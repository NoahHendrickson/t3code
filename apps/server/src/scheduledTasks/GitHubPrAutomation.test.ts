// @effect-diagnostics-next-line nodeBuiltinImport:off -- Signing real test webhook bodies requires Node's HMAC implementation.
import * as NodeCrypto from "node:crypto";
import * as NodePlatformCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import { ProjectId, ScheduledTaskUpsertInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Queue from "effect/Queue";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as GitHubRequestPolicy from "@t3tools/source-control-github/server/GitHubRequestPolicy";
import * as GitHubRest from "@t3tools/source-control-github/server/GitHubRest";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as Automation from "./GitHubPrAutomation.ts";
import * as ScheduledTaskService from "./ScheduledTaskService.ts";

const decodeInput = Schema.decodeUnknownSync(ScheduledTaskUpsertInput);
const input = (overrides: Record<string, unknown> = {}) =>
  decodeInput({
    id: "scheduled-task:github",
    title: "Code review",
    prompt: "Review for bugs and post findings on the PR.",
    enabled: true,
    schedule: {
      type: "webhook",
      github: { repositories: [{ projectId: "d2" }, { projectId: "no3y" }] },
    },
    projectId: "d2",
    workspaceStrategy: { type: "root" },
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    ...overrides,
  });
const HookInput = Schema.Struct({
  config: Schema.Struct({ url: Schema.String, secret: Schema.String }),
});

const decodeHookInput = Schema.decodeUnknownEffect(HookInput);

const withService = <A, E>(
  body: (context: {
    service: ScheduledTaskService.ScheduledTaskService["Service"];
    launches: Queue.Queue<ThreadLaunchService.ThreadLaunchInput>;
    hooks: Map<string, { id: number; config: { url: string; secret: string } }>;
    calls: Array<GitHubRest.GitHubRestInput>;
  }) => Effect.Effect<A, E>,
  options: {
    failRepo?: string;
    failDeleteRepo?: string;
    failFirstLaunch?: boolean;
    publicUrl?: boolean;
    gate?: Deferred.Deferred<void>;
    beforeService?: (sql: SqlClient.SqlClient) => Effect.Effect<void>;
  } = {},
) =>
  Effect.gen(function* () {
    const launches = yield* Queue.unbounded<ThreadLaunchService.ThreadLaunchInput>();
    const hooks = new Map<string, { id: number; config: { url: string; secret: string } }>();
    const calls: Array<GitHubRest.GitHubRestInput> = [];
    let sequence = 0;
    let launchCount = 0;
    const sql = yield* SqlClient.SqlClient;
    if (options.beforeService) yield* options.beforeService(sql);
    const external = Layer.mergeAll(
      Layer.mock(ProjectStore.ProjectStoreV2)({
        get: (projectId) =>
          Effect.succeedSome({
            projectId,
            title: projectId,
            workspaceRoot: `/repo/${projectId}`,
            defaultModelSelection: null,
            defaultThreadEnvMode: null,
            autoPull: false,
            faviconPath: null,
            projectIcon: null,
            scripts: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            deletedAt: null,
          }),
      }),
      Layer.mock(VcsProcess.VcsProcess)({
        run: (request) =>
          Effect.succeed({
            stdout: `git@github.com:owner/${request.cwd.split("/").at(-1)}.git\n`,
            stderr: "",
            exitCode: 0 as never,
            stdoutTruncated: false,
            stderrTruncated: false,
          }),
      }),
      Layer.mock(GitHubRest.GitHubRest)({
        rest: (request) =>
          Effect.gen(function* () {
            calls.push(request);
            const name = request.path.split("/").slice(1, 3).join("/");
            let response: unknown;
            if (request.method === "POST" || request.method === "PATCH") {
              if (name === options.failRepo)
                return yield* new GitHubRequestPolicy.GitHubApiResponseError({
                  host: "github.com",
                  operation: "test",
                  status: 403,
                });
              const data = yield* decodeHookInput(request.body).pipe(Effect.orDie);
              const hook = { id: hooks.get(name)?.id ?? ++sequence, config: data.config };
              hooks.set(name, hook);
              response = hook;
            } else if (request.method === "DELETE") {
              if (name === options.failDeleteRepo)
                return yield* new GitHubRequestPolicy.GitHubApiResponseError({
                  host: "github.com",
                  operation: "test",
                  status: 403,
                });
              hooks.delete(name);
              response = null;
            } else if (request.path.includes("/hooks"))
              response = hooks.has(name) ? [hooks.get(name)] : [];
            else
              response = {
                full_name: name,
                default_branch: name.endsWith("no3y") ? "custom" : "main",
              };
            return {
              status: 200,
              headers: {},
              body: JSON.stringify(response),
              truncated: false,
              invalidUtf8: false,
            };
          }),
      }),
    );
    const deps = Layer.mergeAll(
      NodePlatformCrypto.layer,
      Scheduler.layer,
      Layer.effect(Automation.GitHubPrAutomation, Automation.make).pipe(Layer.provide(external)),
      Layer.mock(ThreadLaunchService.ThreadLaunchService)({
        launch: (request) =>
          Queue.offer(launches, request).pipe(
            Effect.andThen(
              Effect.suspend(() => {
                launchCount++;
                return options.failFirstLaunch && launchCount === 1
                  ? Effect.fail(
                      new ThreadLaunchService.ThreadLaunchError({
                        operation: "resolve-project",
                        commandId: request.commandId,
                        projectId: request.projectId,
                        cause: "Temporarily unavailable",
                      }),
                    )
                  : Effect.void;
              }),
            ),
            Effect.andThen(options.gate ? Deferred.await(options.gate) : Effect.void),
            Effect.as({ threadId: "test-thread", resumed: false } as never),
          ),
      }),
      Layer.mock(ManagedProjectFolders.ManagedProjectFolders)({
        namedProjectsRoot: "/projects",
        isScratchProject: () => Effect.succeed(false),
      }),
      Layer.mock(ThreadManagementService.ThreadManagementService)({}),
      Layer.mock(SecretRequests.SecretRequests)({}),
      Layer.succeed(
        ScheduledTaskService.ScheduledTaskWebhookOrigin,
        Effect.succeed({
          relayHookBaseUrl:
            options.publicUrl === false ? null : "https://relay.example/v1/hooks/test",
        }),
      ),
    );
    return yield* Effect.gen(function* () {
      const service = yield* ScheduledTaskService.ScheduledTaskService;
      return yield* body({ service, launches, hooks, calls });
    }).pipe(Effect.provide(ScheduledTaskService.layer.pipe(Layer.provide(deps))));
  }).pipe(Effect.provide(SqlitePersistence.layerMemory));

function request(
  secret: string,
  token: string,
  repository = "owner/d2",
  number = 42,
  action = "opened",
  event = "pull_request",
) {
  const bodyText = JSON.stringify({
    action,
    repository: { full_name: repository },
    pull_request: {
      number,
      head: { sha: "a".repeat(40) },
      base: { sha: "b".repeat(40), repo: { full_name: repository } },
    },
  });
  return {
    hookId: "scheduled-task:github",
    token,
    method: "POST",
    path: "/api/hooks/test",
    query: "",
    bodyText,
    body: new TextEncoder().encode(bodyText),
    headers: {
      "x-github-event": event,
      "x-hub-signature-256": `sha256=${NodeCrypto.createHmac("sha256", secret).update(bodyText).digest("hex")}`,
    },
  };
}

it.effect(
  "connects two origins, persists signed hooks, retries without duplication and disconnects on delete",
  () =>
    withService(({ service, hooks, calls }) =>
      Effect.gen(function* () {
        const { task } = yield* service.upsert(input());
        assert.equal(hooks.size, 2);
        assert.isTrue(task.webhook?.hasSecret);
        assert.equal(
          task.schedule.type === "webhook" && task.schedule.github?.repositories[1]?.defaultBranch,
          "custom",
        );
        assert.equal(task.threadId, null);
        const callsBeforeRename = calls.length;
        yield* service.upsert(input({ title: "Renamed" }));
        assert.equal(calls.length, callsBeforeRename);
        assert.equal(calls.filter((call) => call.method === "POST").length, 2);
        yield* service.delete({ id: task.id });
        assert.equal(hooks.size, 0);
        assert.equal((yield* service.list()).tasks.length, 0);
      }),
    ),
);

it.effect(
  "routes two arriving PRs to their own projects with exact PRs, commits and isolated worktrees",
  () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      return yield* withService(
        ({ service, launches, hooks }) =>
          Effect.gen(function* () {
            const { task } = yield* service.upsert(input());
            const token = task.webhook!.path.split("/").at(-1)!;
            const secret = hooks.get("owner/d2")!.config.secret;
            yield* service.triggerWebhook(request(secret, token));
            const first = yield* Queue.take(launches);
            yield* service.triggerWebhook(request(secret, token, "owner/no3y", 108));
            yield* Deferred.succeed(gate, undefined);
            const second = yield* Queue.take(launches);
            assert.equal(first.projectId, ProjectId.make("d2"));
            assert.equal(second.projectId, ProjectId.make("no3y"));
            assert.include(first.initialMessage!.text, "https://github.com/owner/d2/pull/42");
            assert.notInclude(first.initialMessage!.text, "pull/108");
            assert.include(second.initialMessage!.text, "https://github.com/owner/no3y/pull/108");
            assert.include(second.initialMessage!.text, "a".repeat(40));
            assert.deepEqual(second.workspaceStrategy, {
              type: "worktree",
              baseRef: "custom",
              startFromOrigin: true,
            });
            assert.include(second.title!, "owner/no3y #108");
            assert.notEqual(first.commandId, second.commandId);
          }),
        { gate },
      );
    }),
);

it.effect(
  "ignores pings, unrelated repositories and non-open actions without launching an agent",
  () =>
    withService(({ service, launches, hooks }) =>
      Effect.gen(function* () {
        const { task } = yield* service.upsert(input());
        const token = task.webhook!.path.split("/").at(-1)!;
        const secret = hooks.get("owner/d2")!.config.secret;
        for (const [repo, action, event] of [
          ["owner/d2", "opened", "ping"],
          ["owner/d2", "synchronize", "pull_request"],
          ["owner/else", "opened", "pull_request"],
          ["owner/d2", "reopened", "pull_request"],
        ]) {
          const result = yield* service.triggerWebhook(
            request(secret, token, repo, 42, action, event),
          );
          assert.equal(result._tag === "accepted" && result.outcome, "ignored");
        }
        assert.deepEqual((yield* service.listWebhookDeliveries({ id: task.id })).deliveries, []);
        assert.equal(yield* Queue.size(launches), 0);
        assert.equal((yield* service.list()).tasks[0]?.runCount, 0);
      }),
    ),
);

it.effect(
  "rejects an invalid signature before claiming the event; deduplicates direct and relay redelivery",
  () =>
    withService(({ service, hooks, launches }) =>
      Effect.gen(function* () {
        const { task } = yield* service.upsert(input());
        const token = task.webhook!.path.split("/").at(-1)!;
        assert.equal(
          (yield* service.triggerWebhook(request("wrong", token)))._tag,
          "rejected_signature",
        );
        const valid = request(hooks.get("owner/d2")!.config.secret, token);
        const first = yield* service.triggerWebhook(valid);
        yield* Queue.take(launches);
        const duplicate = yield* service.triggerWebhook({
          ...valid,
          relayDeliveryId: "relay-second-path",
        });
        assert.equal(duplicate._tag === "accepted" && duplicate.outcome, "duplicate");
        assert.equal(
          first._tag === "accepted" && duplicate._tag === "accepted" && first.deliveryId,
          duplicate._tag === "accepted" && duplicate.deliveryId,
        );
        assert.equal(yield* Queue.size(launches), 0);
      }),
    ),
);

it.effect("rolls back newly created hooks when the second repository refuses setup", () =>
  withService(
    ({ service, hooks }) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(service.upsert(input()));
        assert.include(failure.message, "GitHub access");
        assert.equal(hooks.size, 0);
        assert.equal((yield* service.list()).tasks.length, 0);
      }),
    { failRepo: "owner/no3y" },
  ),
);

it.effect("requires public access before making GitHub changes", () =>
  withService(
    ({ service, calls }) =>
      Effect.gen(function* () {
        assert.include((yield* Effect.flip(service.upsert(input()))).message, "T3 Connect");
        assert.equal(calls.length, 0);
      }),
    { publicUrl: false },
  ),
);

it.effect("pauses and resumes reviews and removes deselected repositories", () =>
  withService(({ service, hooks, launches }) =>
    Effect.gen(function* () {
      const { task } = yield* service.upsert(input());
      yield* service.upsert(
        input({ schedule: { type: "webhook", github: { repositories: [{ projectId: "no3y" }] } } }),
      );
      assert.equal(hooks.size, 1);
      assert.isFalse(hooks.has("owner/d2"));
      yield* service.setEnabled({ id: task.id, enabled: false });
      const valid = request(
        hooks.get("owner/no3y")!.config.secret,
        task.webhook!.path.split("/").at(-1)!,
        "owner/no3y",
      );
      assert.equal((yield* service.triggerWebhook(valid))._tag, "disabled");
      assert.equal(yield* Queue.size(launches), 0);
      yield* service.setEnabled({ id: task.id, enabled: true });
      assert.equal((yield* service.triggerWebhook(valid))._tag, "accepted");
      assert.equal((yield* Queue.take(launches)).projectId, ProjectId.make("no3y"));
    }),
  ),
);

it.effect("allows the same direct or relay PR delivery to retry after dispatch fails", () =>
  withService(
    ({ service, hooks, launches }) =>
      Effect.gen(function* () {
        const { task } = yield* service.upsert(input());
        const token = task.webhook!.path.split("/").at(-1)!;
        const secret = hooks.get("owner/d2")!.config.secret;
        const failed = { ...request(secret, token), relayDeliveryId: "retry-same-relay-id" };
        yield* service.triggerWebhook(failed);
        const first = yield* Queue.take(launches);
        // The next launch is a barrier: the per-task permit releases only after
        // the previous dispatch and its claim cleanup have finished.
        yield* service.triggerWebhook(request(secret, token, "owner/d2", 43));
        yield* Queue.take(launches);
        const retry = yield* service.triggerWebhook(failed);
        assert.equal(retry._tag === "accepted" && retry.outcome, "accepted");
        const retried = yield* Queue.take(launches);
        assert.equal(retried.commandId, first.commandId);
        const duplicate = yield* service.triggerWebhook(request(secret, token));
        assert.equal(duplicate._tag === "accepted" && duplicate.outcome, "duplicate");
      }),
    { failFirstLaunch: true },
  ),
);

it.effect(
  "recovers pre-dispatch claims on restart but keeps accepted message receipts deduplicated",
  () =>
    withService(
      ({ service, hooks, launches }) =>
        Effect.gen(function* () {
          const { task } = yield* service.upsert(input());
          const token = task.webhook!.path.split("/").at(-1)!;
          const secret = hooks.get("owner/d2")!.config.secret;
          const retry = yield* service.triggerWebhook({
            ...request(secret, token),
            relayDeliveryId: "old-relay-claim",
          });
          assert.equal(retry._tag === "accepted" && retry.outcome, "accepted");
          yield* Queue.take(launches);
          const accepted = yield* service.triggerWebhook(request(secret, token, "owner/d2", 43));
          assert.equal(accepted._tag === "accepted" && accepted.outcome, "duplicate");
          assert.equal(yield* Queue.size(launches), 0);
        }),
      {
        beforeService: (sql) =>
          Effect.gen(function* () {
            for (const number of [42, 43]) {
              const deliveryId = `delivery:github:scheduled-task:github:owner/d2:${number}:${"a".repeat(40)}`;
              yield* sql`INSERT INTO scheduled_task_webhook_relay_deliveries
          (relay_delivery_id, task_id, seen_at)
          VALUES (${deliveryId}, 'scheduled-task:github', '2026-01-01T00:00:00.000Z')`;
              if (number === 43) {
                yield* sql`INSERT INTO orchestration_command_receipts
            (command_id, aggregate_kind, aggregate_id, command_type, accepted_at, result_sequence, status, error)
            VALUES (${`scheduled-task:scheduled-task:github:webhook:${deliveryId}:initial-message`},
              'thread', 'deleted-thread', 'message.dispatch', '2026-01-01T00:00:00.000Z', 1, 'accepted', NULL)`;
              }
            }
            yield* sql`INSERT INTO scheduled_task_webhook_relay_deliveries
        (relay_delivery_id, task_id, seen_at)
        VALUES ('old-relay-claim', 'scheduled-task:github', '2026-01-01T00:00:00.000Z')`;
          }).pipe(Effect.orDie),
      },
    ),
);

it.effect("keeps the save and the delete when GitHub cannot remove a hook", () =>
  withService(
    ({ service, hooks }) =>
      Effect.gen(function* () {
        const github = (projectId: string) =>
          input({ schedule: { type: "webhook", github: { repositories: [{ projectId }] } } });
        yield* service.upsert(github("d2"));
        const { task } = yield* service.upsert(github("no3y"));
        assert.deepEqual(
          task.schedule.type === "webhook" &&
            task.schedule.github?.repositories.map((repo) => repo.projectId),
          [ProjectId.make("no3y")],
        );
        assert.deepEqual([...hooks.keys()].toSorted(), ["owner/d2", "owner/no3y"]);
        yield* service.upsert(github("d2"));
        yield* service.delete({ id: task.id });
        assert.equal((yield* service.list()).tasks.length, 0);
      }),
    { failDeleteRepo: "owner/d2" },
  ),
);

it("reads the repository from any github.com origin form", () => {
  for (const origin of [
    "https://github.com/owner/repo.git",
    "https://user@github.com/owner/repo",
    "https://x-access-token:secret@github.com/owner/repo.git\n",
    "git@github.com:owner/repo.git",
    "ssh://git@github.com/owner/repo",
    "ssh://git@github.com:22/owner/repo.git",
    "https://GitHub.com/owner/repo/",
  ]) {
    assert.equal(Automation.githubRepositoryFromOrigin(origin), "owner/repo", origin);
  }
  for (const origin of [
    "https://gitlab.com/owner/repo",
    "https://github.com.evil.example/owner/repo",
    "https://github.com/owner",
  ]) {
    assert.isNull(Automation.githubRepositoryFromOrigin(origin), origin);
  }
});
