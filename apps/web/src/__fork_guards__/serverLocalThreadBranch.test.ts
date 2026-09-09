// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-local-thread-branch`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const ws = readSibling("../../../server/src/ws.ts");
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
  it("wires the resolver into the bootstrap create with the live status source", () => {
    const hunks = readCustomizationHunks(ws);
    // The call site: the bootstrap create's branch comes from the resolver,
    // fed by the status service — the same live value the sidebar and PR
    // badge compare against — never listRefs' cache-served flag.
    expect(hunks).toContain("yield* resolveBootstrapThreadBranch(");
    expect(hunks).toContain("localStatus: gitWorkflow.localStatus");
    expect(hunks).toContain("getProjectShellById: projectionSnapshotQuery.getProjectShellById");
    expect(hunks).toContain("preparingWorktree: bootstrap.prepareWorktree !== undefined");
    expect(hunks).not.toContain("listRefs(");
    // The policy stays out of ws.ts: the fence carries the import and the
    // call, not a resolver of its own.
    expect(hunks).not.toContain("Effect.gen");
  });

  it("keeps the policy's outcomes in the resolver", () => {
    // Explicit branch wins and a worktree being prepared is skipped before
    // any lookup; a failure of any kind becomes null rather than an error.
    expect(resolver).toMatch(/if \(input\.branch !== null \|\| input\.preparingWorktree\)/u);
    expect(resolver).toContain("Effect.as(null)");
    expect(resolver).toContain("Cause.hasInterruptsOnly(cause)");
    expect(resolver).not.toContain("listRefs(");
  });
});
