/**
 * Resolve the branch identity persisted for a newly created Mobile thread.
 * Current-checkout mode may rely on the branch list's implicit current ref;
 * worktree mode keeps requiring the explicit base-branch selection flow.
 */
export function resolveProjectThreadBranch(input: {
  readonly workspaceMode: "local" | "worktree";
  readonly selectedBranchName: string | null;
  readonly availableBranches: ReadonlyArray<{ readonly name: string; readonly current: boolean }>;
}): string | null {
  if (input.selectedBranchName !== null || input.workspaceMode === "worktree") {
    return input.selectedBranchName;
  }
  return input.availableBranches.find((branch) => branch.current)?.name ?? null;
}
