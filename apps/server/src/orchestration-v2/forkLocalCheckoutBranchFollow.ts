/**
 * A local-checkout thread follows the branch its turn just ran on — see
 * `.fork/customizations.yaml#server-local-checkout-branch-follow`.
 *
 * When an agent (or the user) runs `git checkout` in the project's shared
 * checkout and the turn completes, the thread that ran adopts the checked-out
 * branch as its recorded branch, so the sidebar card, the PR badge and the
 * composer chip agree for the thread whose agent did the work. Only that
 * thread follows; the other local threads keep their record and the
 * composer's "Branch changed" banner, since nothing they did moved the
 * checkout.
 *
 * Excluded: the default branch (the shared checkout's resting state after a
 * merge, not the thread's work), a detached HEAD, a temporary `t3/…`
 * placeholder (`isTemporaryWorktreeBranch` also knows the older `t3code/…`), a thread with no recorded branch, a worktree thread (its
 * checkout is its own; upstream V2 records branch changes there through its
 * own flows), and a thread whose newer run is already active. The adoption is
 * `thread.metadata.update` guarded by `expectedWorktreePath: null`, so a
 * thread that moved into a worktree meanwhile is left alone. Nothing here can
 * fail the run's finalization: every error becomes a warning.
 *
 * `RunFinalizationService` calls `LocalCheckoutBranchFollower` with the
 * checkout status its observer already read; the reference defaults to a
 * no-op so the replay harness and unit tests need no wiring.
 */
import {
  CommandId,
  type OrchestrationV2Command,
  type OrchestrationV2ThreadShell,
  type RunId,
  type ThreadId,
  type VcsStatusLocalResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ThreadManagement from "./ThreadManagementService.ts";

export interface LocalCheckoutBranchFollowInput {
  readonly threadId: ThreadId;
  readonly runId: RunId;
  readonly cwd: string;
  readonly local: VcsStatusLocalResult;
}

export class LocalCheckoutBranchFollower extends Context.Reference<{
  readonly follow: (input: LocalCheckoutBranchFollowInput) => Effect.Effect<void>;
}>("t3/orchestration-v2/fork/LocalCheckoutBranchFollower", {
  defaultValue: () => ({ follow: () => Effect.void }),
}) {}

export type LocalCheckoutBranchFollowShell = Pick<
  OrchestrationV2ThreadShell,
  "id" | "branch" | "worktreePath" | "activeRunId"
>;

export interface LocalCheckoutBranchFollowDeps<ShellError = never, DispatchError = never> {
  readonly getThreadShell: (
    threadId: ThreadId,
  ) => Effect.Effect<LocalCheckoutBranchFollowShell | null, ShellError>;
  readonly dispatch: (
    command: Extract<OrchestrationV2Command, { readonly type: "thread.metadata.update" }>,
  ) => Effect.Effect<unknown, DispatchError>;
}

/** Returns the adopted branch, or null when the thread keeps its record. */
export const followLocalCheckoutBranch = <ShellError, DispatchError>(
  input: LocalCheckoutBranchFollowInput,
  deps: LocalCheckoutBranchFollowDeps<ShellError, DispatchError>,
): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const checkedOut = input.local.refName;
    if (checkedOut === null || input.local.isDefaultRef || isTemporaryWorktreeBranch(checkedOut)) {
      return null;
    }
    const thread = yield* deps.getThreadShell(input.threadId);
    if (
      thread === null ||
      thread.worktreePath !== null ||
      thread.branch === null ||
      thread.branch === checkedOut
    ) {
      return null;
    }
    if (thread.activeRunId !== null && thread.activeRunId !== input.runId) {
      return null;
    }
    yield* deps.dispatch({
      type: "thread.metadata.update",
      // One id per run: a retried finalization replays the receipt instead of
      // re-adopting a branch the user may have changed since.
      commandId: CommandId.make(`server:fork-local-checkout-branch-follow:${input.runId}`),
      threadId: input.threadId,
      branch: checkedOut,
      expectedWorktreePath: null,
    });
    return checkedOut;
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.logWarning("local checkout branch follow skipped", {
            threadId: input.threadId,
            runId: input.runId,
            cwd: input.cwd,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(null)),
    ),
  );

export const layer = Layer.effect(
  LocalCheckoutBranchFollower,
  Effect.gen(function* () {
    const threads = yield* ThreadManagement.ThreadManagementService;
    return LocalCheckoutBranchFollower.of({
      follow: (input) =>
        followLocalCheckoutBranch(input, {
          getThreadShell: threads.getThreadShell,
          dispatch: threads.dispatch,
        }).pipe(Effect.asVoid),
    });
  }),
);
