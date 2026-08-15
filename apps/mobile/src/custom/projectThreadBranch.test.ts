import { describe, expect, it } from "vite-plus/test";

import { resolveProjectThreadBranch } from "./projectThreadBranch";

describe("resolveProjectThreadBranch", () => {
  it("uses the current checkout branch when local mode has no explicit selection", () => {
    expect(
      resolveProjectThreadBranch({
        workspaceMode: "local",
        selectedBranchName: null,
        availableBranches: [
          { name: "main", current: false },
          { name: "custom", current: true },
        ],
      }),
    ).toBe("custom");
  });

  it("keeps an explicit selection", () => {
    expect(
      resolveProjectThreadBranch({
        workspaceMode: "local",
        selectedBranchName: "feature/explicit",
        availableBranches: [{ name: "custom", current: true }],
      }),
    ).toBe("feature/explicit");
  });

  it("does not synthesize a worktree base branch", () => {
    expect(
      resolveProjectThreadBranch({
        workspaceMode: "worktree",
        selectedBranchName: null,
        availableBranches: [{ name: "custom", current: true }],
      }),
    ).toBeNull();
  });

  it("keeps detached HEAD null instead of using the default branch", () => {
    expect(
      resolveProjectThreadBranch({
        workspaceMode: "local",
        selectedBranchName: null,
        availableBranches: [{ name: "main", current: false }],
      }),
    ).toBeNull();
  });
});
