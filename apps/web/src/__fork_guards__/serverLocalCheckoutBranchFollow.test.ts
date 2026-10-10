// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-local-checkout-branch-follow`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const finalization = readSibling("../../../server/src/orchestration-v2/RunFinalizationService.ts");
const runtimeLayer = readSibling("../../../server/src/orchestration-v2/runtimeLayer.ts");
const follower = readSibling(
  "../../../server/src/orchestration-v2/forkLocalCheckoutBranchFollow.ts",
);
const followerTest = readSibling(
  "../../../server/src/orchestration-v2/forkLocalCheckoutBranchFollow.test.ts",
);

function readCustomizationHunks(source: string): string {
  const begin = "fork:begin server-local-checkout-branch-follow";
  const end = "fork:end server-local-checkout-branch-follow";
  const hunks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(begin, cursor);
    if (start === -1) break;
    const stop = source.indexOf(end, start);
    if (stop === -1) throw new Error("unterminated server-local-checkout-branch-follow hunk");
    hunks.push(source.slice(start, stop));
    cursor = stop + end.length;
  }
  return hunks.join("\n");
}

describe("fork guard: server-local-checkout-branch-follow", () => {
  it("hands the finalization's checkout status to the follower", () => {
    const hunks = readCustomizationHunks(finalization);
    // The observer returns the status it already read instead of void, and
    // finalize feeds it to the follower; no second git status per turn.
    expect(hunks).toContain(
      "Effect.Effect<VcsStatusLocalResult | null, RunFinalizationRefreshError>",
    );
    expect(hunks).toContain("const follower = yield* LocalCheckoutBranchFollower;");
    expect(hunks).toContain(
      "yield* follower.follow({ cwd, threadId: input.threadId, runId: input.runId, local });",
    );
    expect(hunks).toContain("return local;");
    expect(finalization).not.toMatch(/local\.isDefaultRef\) return;/u);
  });

  it("wires the real follower into production only", () => {
    const hunks = readCustomizationHunks(runtimeLayer);
    expect(hunks).toContain(
      "ForkLocalCheckoutBranchFollow.layer.pipe(Layer.provide(layerThreadManagementProvided))",
    );
    // Elsewhere the reference keeps its no-op default.
    expect(follower).toContain("defaultValue: () => ({ follow: () => Effect.void })");
  });

  it("keeps the policy's outcomes in the follower", () => {
    // Local threads only, never the default branch, a placeholder, or a
    // thread whose record already matches; a worktree thread is left alone.
    expect(follower).toContain(
      "if (checkedOut === null || input.local.isDefaultRef || isTemporaryWorktreeBranch(checkedOut))",
    );
    expect(follower).toContain("thread.worktreePath !== null ||");
    expect(follower).toContain(
      "if (thread.activeRunId !== null && thread.activeRunId !== input.runId)",
    );
    expect(follower).toContain("expectedWorktreePath: null");
    expect(follower).toContain("Cause.hasInterruptsOnly(cause)");
    expect(followerTest).toContain(
      "adopts the drifted checkout for the local thread whose turn ran there",
    );
    expect(followerTest).toContain("the thread owns a worktree");
    expect(followerTest).toContain("a failed dispatch is a warning, never a finalization failure");
  });
});
