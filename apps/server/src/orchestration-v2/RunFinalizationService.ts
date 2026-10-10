import {
  CheckpointScopeId,
  ProjectId,
  RunId,
  ThreadId,
  /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow */
  type VcsStatusLocalResult,
  /* fork:end server-local-checkout-branch-follow */
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as PullRequestService from "../pullRequest/PullRequestService.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import * as WorkspaceEntries from "../workspace/WorkspaceEntries.ts";
import * as CheckpointCapture from "./CheckpointCaptureService.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
/* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow */
import { LocalCheckoutBranchFollower } from "./forkLocalCheckoutBranchFollow.ts";
/* fork:end server-local-checkout-branch-follow */

export class RunFinalizationError extends Schema.TaggedError<RunFinalizationError>()(
  "RunFinalizationError",
  {
    threadId: ThreadId,
    runId: RunId,
    scopeId: CheckpointScopeId,
    operation: Schema.Literals(["capture-checkpoint", "refresh-workspace"]),
    cause: Schema.Defect(),
  },
) {}

export class RunFinalizationRefreshError extends Schema.TaggedError<RunFinalizationRefreshError>()(
  "RunFinalizationRefreshError",
  { cwd: Schema.String, cause: Schema.Defect() },
) {}

export class RunFinalizationObserver extends Context.Reference<{
  readonly refreshAfterTurn: (projectId: ProjectId) => Effect.Effect<void>;
  readonly refresh: (input: {
    readonly cwd: string;
    readonly threadId: ThreadId;
    readonly runId: RunId;
    /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow
       The refresh hands back the checkout status it already read, so finalize
       can follow the branch a local thread's turn ran on without a second
       git status; null when no observer is installed. */
  }) => Effect.Effect<VcsStatusLocalResult | null, RunFinalizationRefreshError>;
}>("t3/orchestration-v2/RunFinalizationObserver", {
  defaultValue: () => ({
    refresh: () => Effect.succeed(null),
    refreshAfterTurn: () => Effect.void,
  }),
  /* fork:end server-local-checkout-branch-follow */
}) {}

export class RunFinalizationService extends Context.Service<
  RunFinalizationService,
  {
    readonly finalize: (input: {
      readonly threadId: ThreadId;
      readonly runId: RunId;
      readonly scopeId: CheckpointScopeId;
    }) => Effect.Effect<void, RunFinalizationError>;
  }
>()("t3/orchestration-v2/RunFinalizationService") {}

const make = Effect.gen(function* () {
  const checkpointCapture = yield* CheckpointCapture.CheckpointCaptureServiceV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const observer = yield* RunFinalizationObserver;
  /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow */
  const follower = yield* LocalCheckoutBranchFollower;
  /* fork:end server-local-checkout-branch-follow */

  const finalize: RunFinalizationService["Service"]["finalize"] = Effect.fn(
    "RunFinalizationService.finalize",
  )(function* (input) {
    yield* checkpointCapture
      .execute(input)
      .pipe(
        Effect.mapError(
          (cause) => new RunFinalizationError({ ...input, operation: "capture-checkpoint", cause }),
        ),
      );
    const projection = yield* projections
      .getCheckpointContext(input.threadId)
      .pipe(
        Effect.mapError(
          (cause) => new RunFinalizationError({ ...input, operation: "refresh-workspace", cause }),
        ),
      );
    const cwd = projection.checkpointScopes.find((scope) => scope.id === input.scopeId)?.cwd;
    if (cwd !== undefined) {
      /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow
         The thread whose turn just ran on the shared checkout adopts the
         branch found there; the follower never fails the finalization. */
      const local = yield* observer
        .refresh({ cwd, threadId: input.threadId, runId: input.runId })
        .pipe(
          Effect.mapError(
            (cause) =>
              new RunFinalizationError({ ...input, operation: "refresh-workspace", cause }),
          ),
        );
      if (local !== null) {
        yield* follower.follow({ cwd, threadId: input.threadId, runId: input.runId, local });
      }
      /* fork:end server-local-checkout-branch-follow */
    }
  });
  return RunFinalizationService.of({ finalize });
});

export const layer = Layer.effect(RunFinalizationService, make);

export const observerLive = Layer.effect(
  RunFinalizationObserver,
  Effect.gen(function* () {
    const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;
    const vcsStatus = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const pullRequests = yield* PullRequestService.PullRequestService;
    return {
      refreshAfterTurn: pullRequests.refreshAfterTurn,
      refresh: ({ cwd, threadId, runId }) =>
        Effect.gen(function* () {
          const [, local] = yield* Effect.all(
            [workspaceEntries.refresh(cwd), vcsStatus.refreshLocalStatus(cwd)],
            { concurrency: "unbounded" },
          );
          /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow
             Every exit returns the status read above; see the observer shape. */
          if (local.refName === null || local.isDefaultRef) return local;
          const thread = yield* projections.getThreadShell(threadId);
          if (!thread || thread.branch !== local.refName) return local;
          if (thread.activeRunId !== null && thread.activeRunId !== runId) return local;
          /* fork:end server-local-checkout-branch-follow */
          yield* vcsStatus.refreshPullRequestStatus(cwd).pipe(
            Effect.catch((error) =>
              Effect.logWarning("failed to refresh pull request status after run completion", {
                threadId,
                cwd,
                detail: error.message,
              }),
            ),
          );
          /* fork:begin server-local-checkout-branch-follow — see .fork/customizations.yaml#server-local-checkout-branch-follow */
          return local;
          /* fork:end server-local-checkout-branch-follow */
        }).pipe(Effect.mapError((cause) => new RunFinalizationRefreshError({ cwd, cause }))),
    };
  }),
);
