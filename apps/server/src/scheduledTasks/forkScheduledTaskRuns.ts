/**
 * Run history for scheduled tasks — see
 * `.fork/customizations.yaml#fork-scheduled-page`.
 *
 * Nothing new is persisted. `ScheduledTaskService` mints every dispatched
 * message as `scheduled-task-message:<fireKey>`, and the V2 projection stores
 * that message as a `user_message` turn item whose id is
 * `turn-item:message:<encodeURIComponent(messageId)>` (`IdAllocator.userTurnItem`).
 * So the run history is a prefix scan over the turn-item primary key, joined
 * to the run and thread projections.
 */
import {
  OrchestrationV2RunStatus,
  ScheduledTaskError,
  ScheduledTaskRun,
  SCHEDULED_TASK_RUNS_DEFAULT_LIMIT,
  type ScheduledTaskId,
  type ScheduledTaskListRunsInput,
  type ScheduledTaskListRunsResult,
  type ScheduledTaskRunTrigger,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";

/** Must match `IdAllocator.userTurnItem`, which percent-encodes the message id. */
const USER_TURN_ITEM_PREFIX = "turn-item:message:";
const SCHEDULED_TASK_MESSAGE_PREFIX = "scheduled-task-message:";
const WEBHOOK_SEGMENT = ":webhook:";

const isRunStatus = Schema.is(OrchestrationV2RunStatus);
const decodeRun = Schema.decodeUnknownOption(ScheduledTaskRun);

interface RunRow {
  readonly turn_item_id: string;
  readonly thread_id: string;
  readonly run_id: string | null;
  readonly item_updated_at: string;
  readonly run_status: string | null;
  readonly run_requested_at: string | null;
  readonly run_completed_at: string | null;
  readonly thread_title: string;
  readonly project_id: string;
}

/**
 * Escapes GLOB metacharacters so the pattern matches the prefix literally.
 * `encodeURIComponent` leaves `*` unescaped, so a task id can carry one.
 */
export function escapeGlobPrefix(prefix: string): string {
  return prefix.replace(/[*?[]/g, (char) => `[${char}]`);
}

/** The turn-item id prefix shared by every run of `taskId`, or of every task. */
function scheduledTaskTurnItemPrefix(taskId: ScheduledTaskId | undefined): string {
  const messagePrefix =
    taskId === undefined
      ? SCHEDULED_TASK_MESSAGE_PREFIX
      : `${SCHEDULED_TASK_MESSAGE_PREFIX}${taskId}:`;
  return `${USER_TURN_ITEM_PREFIX}${encodeURIComponent(messagePrefix)}`;
}

interface ParsedFireKey {
  readonly taskId: string;
  readonly trigger: ScheduledTaskRunTrigger;
}

/**
 * Recovers task id and trigger from a decoded message id. Fire keys are
 * `<taskId>:<epochMillis>:<scheduled|manual>` or `<taskId>:webhook:<deliveryId>`,
 * and task ids themselves contain colons, so the id is only unambiguous when
 * the caller already knows it; otherwise the trailing segments decide.
 */
export function parseScheduledTaskMessageId(
  messageId: string,
  knownTaskId: ScheduledTaskId | undefined,
): ParsedFireKey | undefined {
  if (!messageId.startsWith(SCHEDULED_TASK_MESSAGE_PREFIX)) return undefined;
  const fireKey = messageId.slice(SCHEDULED_TASK_MESSAGE_PREFIX.length);

  if (knownTaskId !== undefined) {
    if (!fireKey.startsWith(`${knownTaskId}:`)) return undefined;
    const rest = fireKey.slice(knownTaskId.length + 1);
    if (rest.startsWith("webhook:")) return { taskId: knownTaskId, trigger: "webhook" };
    const trigger = parseTimedTrigger(rest.split(":"));
    return trigger === undefined ? undefined : { taskId: knownTaskId, trigger };
  }

  const webhookAt = fireKey.lastIndexOf(WEBHOOK_SEGMENT);
  if (webhookAt > 0) return { taskId: fireKey.slice(0, webhookAt), trigger: "webhook" };

  const segments = fireKey.split(":");
  if (segments.length < 3) return undefined;
  const trigger = parseTimedTrigger(segments.slice(-2));
  if (trigger === undefined) return undefined;
  return { taskId: segments.slice(0, -2).join(":"), trigger };
}

function parseTimedTrigger(
  segments: ReadonlyArray<string>,
): Extract<ScheduledTaskRunTrigger, "scheduled" | "manual"> | undefined {
  if (segments.length !== 2) return undefined;
  const [epochMillis, trigger] = segments;
  if (epochMillis === undefined || !/^\d+$/.test(epochMillis)) return undefined;
  return trigger === "scheduled" || trigger === "manual" ? trigger : undefined;
}

function rowToRun(
  row: RunRow,
  knownTaskId: ScheduledTaskId | undefined,
): ScheduledTaskRun | undefined {
  if (!row.turn_item_id.startsWith(USER_TURN_ITEM_PREFIX)) return undefined;
  let messageId: string;
  try {
    messageId = decodeURIComponent(row.turn_item_id.slice(USER_TURN_ITEM_PREFIX.length));
  } catch {
    return undefined;
  }
  const parsed = parseScheduledTaskMessageId(messageId, knownTaskId);
  if (parsed === undefined) return undefined;
  return Option.getOrUndefined(
    decodeRun({
      taskId: parsed.taskId,
      messageId,
      threadId: row.thread_id,
      projectId: row.project_id,
      threadTitle: row.thread_title,
      trigger: parsed.trigger,
      runId: row.run_id,
      // A status this build does not know is reported as absent, not fatal.
      status: row.run_status !== null && isRunStatus(row.run_status) ? row.run_status : null,
      requestedAt: row.run_requested_at ?? row.item_updated_at,
      completedAt: row.run_completed_at,
    }),
  );
}

/**
 * Lists the runs a scheduled task (or every task) dispatched, newest first.
 * The GLOB pattern is bound as one parameter so SQLite's LIKE/GLOB
 * optimization can walk the turn-item primary key for the literal prefix;
 * LIKE cannot, because the percent-encoded ids contain `%`. The cursor uses
 * the same timestamp and primary-key ordering as the query, so new runs do
 * not shift older pages. Even an unparseable row advances the cursor.
 */
export function listScheduledTaskRuns(
  sql: SqlClient.SqlClient,
  input: ScheduledTaskListRunsInput,
): Effect.Effect<ScheduledTaskListRunsResult, ScheduledTaskError> {
  const pattern = `${escapeGlobPrefix(scheduledTaskTurnItemPrefix(input.id))}*`;
  const limit = input.limit ?? SCHEDULED_TASK_RUNS_DEFAULT_LIMIT;
  const afterCursor =
    input.cursor === undefined
      ? sql`1 = 1`
      : sql`(
        COALESCE(r.requested_at, i.updated_at) < ${input.cursor.requestedAt}
        OR (COALESCE(r.requested_at, i.updated_at) = ${input.cursor.requestedAt}
          AND i.turn_item_id > ${input.cursor.turnItemId})
      )`;
  return sql<RunRow>`
    SELECT
      i.turn_item_id,
      i.thread_id,
      i.run_id,
      i.updated_at AS item_updated_at,
      r.status AS run_status,
      r.requested_at AS run_requested_at,
      r.completed_at AS run_completed_at,
      t.title AS thread_title,
      t.project_id
    FROM orchestration_v2_projection_turn_items AS i
    LEFT JOIN orchestration_v2_projection_runs AS r ON r.run_id = i.run_id
    JOIN orchestration_v2_projection_threads AS t ON t.thread_id = i.thread_id
    WHERE i.turn_item_id GLOB ${pattern}
      AND i.type = 'user_message'
      AND t.deleted_at IS NULL
      AND ${afterCursor}
    ORDER BY COALESCE(r.requested_at, i.updated_at) DESC, i.turn_item_id
    LIMIT ${limit + 1}
  `.pipe(
    Effect.map((rows) => {
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        runs: page.flatMap((row) => {
          const run = rowToRun(row, input.id);
          return run === undefined ? [] : [run];
        }),
        nextCursor:
          rows.length > limit && last !== undefined
            ? {
                requestedAt: last.run_requested_at ?? last.item_updated_at,
                turnItemId: last.turn_item_id,
              }
            : null,
      };
    }),
    Effect.mapError(
      (cause) =>
        new ScheduledTaskError({
          message: "Could not list scheduled task runs.",
          ...(input.id === undefined ? {} : { taskId: input.id }),
          cause,
        }),
    ),
  );
}
