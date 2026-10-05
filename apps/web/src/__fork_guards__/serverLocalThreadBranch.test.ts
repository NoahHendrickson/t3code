// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-local-thread-branch`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const launch = readSibling("../../../server/src/orchestration-v2/ThreadLaunchService.ts");
const launchTest = readSibling("../../../server/src/orchestration-v2/ThreadLaunchService.test.ts");
const resolver = readSibling("../../../server/src/git/resolveBootstrapThreadBranch.ts");

function readCustomizationHunks(source: string): string {
  const begin = "fork:begin server-local-thread-branch";
  const end = "fork:end server-local-thread-branch";
  const hunks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(begin, cursor);
    if (start === -1) break;
    const stop = source.indexOf(end, start);
    if (stop === -1) throw new Error("unterminated server-local-thread-branch hunk");
    hunks.push(source.slice(start, stop));
    cursor = stop + end.length;
  }
  return hunks.join("\n");
}

describe("fork guard: server-local-thread-branch", () => {
  it("wires the resolver into the launch create with the live status source", () => {
    const hunks = readCustomizationHunks(launch);
    // The call site: the created thread's branch comes from the resolver,
    // fed by the status service — the same live value the sidebar and PR
    // badge compare against — never listRefs' cache-served flag.
    expect(hunks).toContain("const initialBranch = yield* resolveBootstrapThreadBranch(");
    expect(hunks).toContain("localStatus: git.localStatus");
    expect(hunks).toContain("getProjectShellById: projects.getById");
    // Only a worktree actually being made names its own branch; a root or
    // existing-folder launch still gets the live branch.
    expect(hunks).toContain('preparingWorktree: workspaceStrategy.type === "worktree"');
    expect(hunks).not.toContain("listRefs(");
    // The policy stays out of the launch service: the fence carries the
    // import and the call, not a resolver of its own.
    expect(hunks).not.toContain("Effect.gen");
    // Upstream's own assignment must not come back with a sync and shadow it.
    expect(launch).not.toContain("const initialBranch = workspaceStrategy.branch ?? null;");
  });

  it("keeps the policy's outcomes in the resolver", () => {
    // Explicit branch wins and a worktree being prepared is skipped before
    // any lookup; a failure of any kind becomes null rather than an error.
    expect(resolver).toMatch(/if \(input\.branch !== null \|\| input\.preparingWorktree\)/u);
    expect(resolver).toContain("Effect.as(null)");
    expect(resolver).toContain("Cause.hasInterruptsOnly(cause)");
    expect(resolver).not.toContain("listRefs(");
  });

  it("keeps the seam covered by the launch service's own test", () => {
    const hunks = readCustomizationHunks(launchTest);
    expect(hunks).toContain("fills in the checked-out branch when a root launch names none");
    expect(hunks).toContain("keeps an explicit branch over the checked-out one");
    expect(hunks).toContain("leaves a worktree launch to name its own branch");
  });
});
