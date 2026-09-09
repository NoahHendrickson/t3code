// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-local-checkout-branch-follow`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const reactor = readSibling("../../../server/src/orchestration/Layers/CheckpointReactor.ts");
const reactorTest = readSibling(
  "../../../server/src/orchestration/Layers/CheckpointReactor.test.ts",
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
  it("lets a local-checkout thread follow the branch its turn ran on", () => {
    const hunks = readCustomizationHunks(reactor);
    // The shared-cwd refusal is scoped to worktree threads. A local thread
    // (worktreePath null) reaches the adoption dispatch below the fence.
    expect(hunks).toContain("if (thread.worktreePath !== null) {");
    expect(hunks).toContain("worktreeIsShared");
    // Upstream's original early return, which refused every local thread,
    // must not come back with a sync.
    expect(reactor).not.toMatch(
      /thread\.worktreePath === null \|\|\s*thread\.worktreePath !== input\.cwd/u,
    );
    // The adoption itself is upstream's compare-and-swap dispatch, unchanged.
    expect(reactor).toContain('commandId: yield* serverCommandId("worktree-branch-drift")');
    expect(reactor).toContain("expectedBranch: thread.branch");
  });

  it("keeps the local-checkout case covered by the reactor's own test", () => {
    const hunks = readCustomizationHunks(reactorTest);
    expect(hunks).toContain(
      "adopts a drifted checkout for a local thread even though other local threads share it",
    );
    expect(hunks).toContain("threadWorktreePath: null");
    expect(hunks).toContain("secondThreadSharingWorktree: true");
  });
});
