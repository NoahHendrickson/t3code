/**
 * Fork-owned — see `.fork/customizations.yaml#fork-scheduled-page`.
 */
import { assert, it } from "@effect/vitest";
import { ScheduledTaskId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import {
  escapeGlobPrefix,
  listScheduledTaskRuns,
  parseScheduledTaskMessageId,
} from "./forkScheduledTaskRuns.ts";

/** Mirrors `IdAllocator.userTurnItem`: the message id is percent-encoded into the item id. */
const userTurnItemId = (messageId: string) => `turn-item:message:${encodeURIComponent(messageId)}`;

const insertThread = (
  sql: SqlClient.SqlClient,
  row: { id: string; title?: string; projectId?: string; deletedAt?: string | null },
) =>
  sql`INSERT INTO orchestration_v2_projection_threads ${sql.insert({
    thread_id: row.id,
    project_id: row.projectId ?? "project:test",
    title: row.title ?? "Thread",
    default_provider: "codex",
    runtime_mode: "full-access",
    interaction_mode: "default",
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-09T00:00:00.000Z",
    archived_at: null,
    deleted_at: row.deletedAt ?? null,
    payload_json: "{}",
  })}`;

const insertRun = (
  sql: SqlClient.SqlClient,
  row: {
    id: string;
    threadId: string;
    status: string;
    requestedAt: string;
    completedAt?: string | null;
  },
) =>
  sql`INSERT INTO orchestration_v2_projection_runs ${sql.insert({
    run_id: row.id,
    thread_id: row.threadId,
    ordinal: 1,
    provider: "codex",
    provider_thread_id: null,
    status: row.status,
    requested_at: row.requestedAt,
    completed_at: row.completedAt ?? null,
    payload_json: "{}",
  })}`;

const insertItem = (
  sql: SqlClient.SqlClient,
  row: {
    messageId: string;
    threadId: string;
    runId: string | null;
    updatedAt: string;
    type?: string;
    turnItemId?: string;
  },
) =>
  sql`INSERT INTO orchestration_v2_projection_turn_items ${sql.insert({
    turn_item_id: row.turnItemId ?? userTurnItemId(row.messageId),
    thread_id: row.threadId,
    run_id: row.runId,
    node_id: null,
    provider_thread_id: null,
    provider_turn_id: null,
    parent_item_id: null,
    ordinal: 1,
    type: row.type ?? "user_message",
    status: "completed",
    updated_at: row.updatedAt,
    payload_json: "{}",
  })}`;

const taskA = ScheduledTaskId.make("scheduled-task:command:mcp:aaa");
const taskB = ScheduledTaskId.make("scheduled-task:command:mcp:bbb");

it.effect("lists one task's runs, newest first, with trigger and run fields", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertThread(sql, { id: "thread:a1", title: "First", projectId: "project:p1" });
    yield* insertThread(sql, { id: "thread:a2", title: "Second" });
    yield* insertThread(sql, { id: "thread:b1", title: "Other task" });

    yield* insertRun(sql, {
      id: "run:a1",
      threadId: "thread:a1",
      status: "completed",
      requestedAt: "2026-09-09T10:00:00.000Z",
      completedAt: "2026-09-09T10:01:00.000Z",
    });
    yield* insertRun(sql, {
      id: "run:a2",
      threadId: "thread:a2",
      status: "running",
      requestedAt: "2026-09-09T11:00:00.000Z",
    });
    yield* insertRun(sql, {
      id: "run:b1",
      threadId: "thread:b1",
      status: "completed",
      requestedAt: "2026-09-09T13:00:00.000Z",
    });

    const scheduled = `scheduled-task-message:${taskA}:1757412000000:scheduled`;
    const manual = `scheduled-task-message:${taskA}:1757415600000:manual`;
    const webhook = `scheduled-task-message:${taskA}:webhook:delivery:relay:7b02`;
    const otherTask = `scheduled-task-message:${taskB}:1757422800000:scheduled`;
    yield* insertItem(sql, {
      messageId: scheduled,
      threadId: "thread:a1",
      runId: "run:a1",
      updatedAt: "2026-09-09T09:00:00.000Z",
    });
    yield* insertItem(sql, {
      messageId: manual,
      threadId: "thread:a2",
      runId: "run:a2",
      updatedAt: "2026-09-09T09:00:00.000Z",
    });
    // Queued behind a turn: no run row yet, so the item's updated_at stands in.
    yield* insertItem(sql, {
      messageId: webhook,
      threadId: "thread:a2",
      runId: null,
      updatedAt: "2026-09-09T12:00:00.000Z",
    });
    yield* insertItem(sql, {
      messageId: otherTask,
      threadId: "thread:b1",
      runId: "run:b1",
      updatedAt: "2026-09-09T09:00:00.000Z",
    });
    // Noise that shares the prefix but is not a user message, and a plain user
    // message that is not a scheduled dispatch.
    yield* insertItem(sql, {
      messageId: `scheduled-task-message:${taskA}:1757400000000:scheduled`,
      threadId: "thread:a1",
      runId: "run:a1",
      updatedAt: "2026-09-09T20:00:00.000Z",
      type: "assistant_message",
    });
    yield* insertItem(sql, {
      messageId: "message:plain",
      threadId: "thread:a1",
      runId: "run:a1",
      updatedAt: "2026-09-09T20:00:00.000Z",
    });

    const { runs } = yield* listScheduledTaskRuns(sql, { id: taskA });
    assert.deepEqual<ReadonlyArray<unknown>>(runs, [
      {
        taskId: taskA,
        messageId: webhook,
        threadId: "thread:a2",
        projectId: "project:test",
        threadTitle: "Second",
        trigger: "webhook",
        runId: null,
        status: null,
        requestedAt: "2026-09-09T12:00:00.000Z",
        completedAt: null,
      },
      {
        taskId: taskA,
        messageId: manual,
        threadId: "thread:a2",
        projectId: "project:test",
        threadTitle: "Second",
        trigger: "manual",
        runId: "run:a2",
        status: "running",
        requestedAt: "2026-09-09T11:00:00.000Z",
        completedAt: null,
      },
      {
        taskId: taskA,
        messageId: scheduled,
        threadId: "thread:a1",
        projectId: "project:p1",
        threadTitle: "First",
        trigger: "scheduled",
        runId: "run:a1",
        status: "completed",
        requestedAt: "2026-09-09T10:00:00.000Z",
        completedAt: "2026-09-09T10:01:00.000Z",
      },
    ]);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("excludes runs in deleted threads and reports unknown run statuses as absent", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertThread(sql, { id: "thread:live" });
    yield* insertThread(sql, { id: "thread:gone", deletedAt: "2026-09-09T15:00:00.000Z" });
    yield* insertRun(sql, {
      id: "run:live",
      threadId: "thread:live",
      status: "not-a-status",
      requestedAt: "2026-09-09T10:00:00.000Z",
    });
    yield* insertRun(sql, {
      id: "run:gone",
      threadId: "thread:gone",
      status: "completed",
      requestedAt: "2026-09-09T11:00:00.000Z",
    });
    yield* insertItem(sql, {
      messageId: `scheduled-task-message:${taskA}:1:scheduled`,
      threadId: "thread:live",
      runId: "run:live",
      updatedAt: "2026-09-09T10:00:00.000Z",
    });
    yield* insertItem(sql, {
      messageId: `scheduled-task-message:${taskA}:2:scheduled`,
      threadId: "thread:gone",
      runId: "run:gone",
      updatedAt: "2026-09-09T11:00:00.000Z",
    });

    const { runs } = yield* listScheduledTaskRuns(sql, { id: taskA });
    assert.deepEqual(
      runs.map((run) => [run.threadId, run.status]),
      [["thread:live", null]],
    );
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("matches a task id with GLOB metacharacters literally", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const spiky = ScheduledTaskId.make("task[1]*?");
    // Would match an unescaped `task%5B1%5D*%3F%3A*` pattern via the bare `*`.
    const decoy = ScheduledTaskId.make("task[1]-decoy*?");
    yield* insertThread(sql, { id: "thread:spiky" });
    yield* insertThread(sql, { id: "thread:decoy" });
    yield* insertItem(sql, {
      messageId: `scheduled-task-message:${spiky}:1:manual`,
      threadId: "thread:spiky",
      runId: null,
      updatedAt: "2026-09-09T10:00:00.000Z",
    });
    yield* insertItem(sql, {
      messageId: `scheduled-task-message:${decoy}:2:manual`,
      threadId: "thread:decoy",
      runId: null,
      updatedAt: "2026-09-09T11:00:00.000Z",
    });

    const { runs } = yield* listScheduledTaskRuns(sql, { id: spiky });
    assert.deepEqual(
      runs.map((run) => run.taskId),
      [spiky],
    );
    assert.equal(escapeGlobPrefix("a*b?c[d]"), "a[*]b[?]c[[]d]");
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("lists runs across every task when no id is given, honouring the limit", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertThread(sql, { id: "thread:x" });
    const messages = [
      {
        id: `scheduled-task-message:${taskA}:1757412000000:scheduled`,
        at: "2026-09-09T10:00:00.000Z",
      },
      {
        id: `scheduled-task-message:${taskB}:webhook:delivery:relay:7b02`,
        at: "2026-09-09T11:00:00.000Z",
      },
      {
        id: `scheduled-task-message:${taskB}:1757419200000:manual`,
        at: "2026-09-09T12:00:00.000Z",
      },
      // Not a fire key this build understands: skipped, never fatal. Older
      // than the real runs because LIMIT counts rows before the id parse.
      { id: "scheduled-task-message:garbage", at: "2026-09-09T08:00:00.000Z" },
    ];
    for (const message of messages) {
      yield* insertItem(sql, {
        messageId: message.id,
        threadId: "thread:x",
        runId: null,
        updatedAt: message.at,
      });
    }
    // An item id that is not valid percent-encoding is skipped too.
    yield* insertItem(sql, {
      messageId: "unused",
      turnItemId: "turn-item:message:scheduled-task-message%3A%E0%A4%A",
      threadId: "thread:x",
      runId: null,
      updatedAt: "2026-09-09T07:00:00.000Z",
    });

    const all = yield* listScheduledTaskRuns(sql, {});
    assert.deepEqual(
      all.runs.map((run) => [run.taskId, run.trigger]),
      [
        [taskB, "manual"],
        [taskB, "webhook"],
        [taskA, "scheduled"],
      ],
    );

    const limited = yield* listScheduledTaskRuns(sql, { limit: 1 });
    assert.deepEqual(
      limited.runs.map((run) => run.messageId),
      [`scheduled-task-message:${taskB}:1757419200000:manual`],
    );
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it("parses fire keys with and without a known task id", () => {
  const colonTask = ScheduledTaskId.make("scheduled-task:command:mcp:abc");
  assert.deepEqual(
    parseScheduledTaskMessageId(
      `scheduled-task-message:${colonTask}:1700000000000:scheduled`,
      undefined,
    ),
    { taskId: colonTask, trigger: "scheduled" },
  );
  assert.deepEqual(
    parseScheduledTaskMessageId(
      `scheduled-task-message:${colonTask}:webhook:delivery:relay:1`,
      undefined,
    ),
    { taskId: colonTask, trigger: "webhook" },
  );
  assert.deepEqual(
    parseScheduledTaskMessageId(
      `scheduled-task-message:${colonTask}:1700000000000:manual`,
      colonTask,
    ),
    { taskId: colonTask, trigger: "manual" },
  );
  assert.equal(
    parseScheduledTaskMessageId(`scheduled-task-message:${colonTask}:1700000000000:manual`, taskA),
    undefined,
  );
  assert.equal(
    parseScheduledTaskMessageId(`scheduled-task-message:${colonTask}:nope:manual`, colonTask),
    undefined,
  );
  assert.equal(parseScheduledTaskMessageId("message:plain", undefined), undefined);
});

it.effect(
  "pages beyond 100 runs without skipping timestamp ties or repeating runs after new arrivals",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* insertThread(sql, { id: "thread:pages" });
      for (let index = 0; index < 105; index++) {
        yield* insertItem(sql, {
          messageId: `scheduled-task-message:${taskA}:${index}:manual`,
          threadId: "thread:pages",
          runId: null,
          updatedAt: "2026-09-09T10:00:00.000Z",
        });
      }
      const first = yield* listScheduledTaskRuns(sql, { id: taskA });
      assert.equal(first.runs.length, 100);
      assert.isNotNull(first.nextCursor);
      yield* insertItem(sql, {
        messageId: `scheduled-task-message:${taskA}:106:manual`,
        threadId: "thread:pages",
        runId: null,
        updatedAt: "2026-09-09T11:00:00.000Z",
      });
      const second = yield* listScheduledTaskRuns(sql, { id: taskA, cursor: first.nextCursor! });
      assert.equal(second.runs.length, 5);
      assert.isNull(second.nextCursor);
      assert.equal(new Set([...first.runs, ...second.runs].map((run) => run.messageId)).size, 105);
      const all = yield* listScheduledTaskRuns(sql, { limit: 100 });
      assert.equal(all.runs.length, 100);
      const older = yield* listScheduledTaskRuns(sql, { cursor: all.nextCursor! });
      assert.equal(older.runs.length, 6);
      assert.isNull(older.nextCursor);
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
