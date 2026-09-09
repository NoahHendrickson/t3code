/**
 * Which branch a bootstrap-created thread records — see
 * `.fork/customizations.yaml#server-local-thread-branch`.
 *
 * Upstream mobile records a branch only when its picker is tapped, so the
 * untouched "Current checkout" default arrives as null and the thread never
 * shows a branch on any other surface. The server has the checkout and the
 * status service, so it fills the label in at creation instead of waiting on
 * a client release.
 *
 * Precedence: an explicit client branch always wins; a worktree being
 * prepared names its own branch through that flow; an existing worktree path
 * is the checkout to read, the project root is the fallback. The source is
 * the live local status — the same value the sidebar and PR badge compare
 * against — never listRefs' cache-served flag. A detached HEAD, a
 * non-repository project, a missing project, or a status failure yields null
 * with a warning rather than fabricating a branch or failing the create.
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ProjectId, ThreadId } from "@t3tools/contracts";

export interface BootstrapThreadBranchInput {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  /** True when the same bootstrap also prepares a new worktree. */
  readonly preparingWorktree: boolean;
}

export interface BootstrapThreadBranchDeps<ProjectError = never, StatusError = never> {
  readonly getProjectShellById: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<{ readonly workspaceRoot: string }>, ProjectError>;
  readonly localStatus: (input: {
    readonly cwd: string;
  }) => Effect.Effect<{ readonly refName: string | null }, StatusError>;
}

export const resolveBootstrapThreadBranch = <ProjectError, StatusError>(
  input: BootstrapThreadBranchInput,
  deps: BootstrapThreadBranchDeps<ProjectError, StatusError>,
): Effect.Effect<string | null> => {
  if (input.branch !== null || input.preparingWorktree) {
    return Effect.succeed(input.branch);
  }
  return Effect.gen(function* () {
    const cwd =
      input.worktreePath ??
      Option.getOrNull(
        Option.map(yield* deps.getProjectShellById(input.projectId), (p) => p.workspaceRoot),
      );
    if (cwd === null) return null;
    return (yield* deps.localStatus({ cwd })).refName;
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.logWarning("bootstrap thread create could not resolve checkout branch", {
            threadId: input.threadId,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(null)),
    ),
  );
};
