// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#mobile-current-checkout-branch`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const draftScreen = readSibling("../../../mobile/src/features/threads/NewTaskDraftScreen.tsx");
const flowProvider = readSibling("../../../mobile/src/features/threads/new-task-flow-provider.tsx");

function readCustomizationHunks(source: string): string {
  const begin = "fork:begin mobile-current-checkout-branch";
  const end = "fork:end mobile-current-checkout-branch";
  const hunks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(begin, cursor);
    if (start === -1) break;
    const stop = source.indexOf(end, start);
    if (stop === -1) throw new Error("unterminated mobile-current-checkout-branch hunk");
    hunks.push(source.slice(start, stop));
    cursor = stop + end.length;
  }
  return hunks.join("\n");
}

describe("fork guard: mobile-current-checkout-branch", () => {
  it("records the live checkout on queued tasks via upstream's resolver", () => {
    // Immediate creation is upstream's own path now
    // (resolveProjectThreadCreationBranch + currentCheckoutBranchName); the
    // fork's one surviving divergence is the offline-outbox path, which
    // upstream deliberately leaves unlabeled. The fence must feed upstream's
    // resolver from the live status stream — never from listRefs'
    // cache-served `current` flag, which the retired fork resolver read.
    const hunks = readCustomizationHunks(flowProvider);
    expect(hunks).toContain("branch: resolveProjectThreadCreationBranch({");
    expect(hunks).toContain("currentCheckoutBranch: currentCheckoutBranchName");
    expect(hunks).not.toContain("availableBranches");
    // The draft screen carries no fork hunks anymore; a reappearing one means
    // a sync resurrected the retired resolver.
    expect(readCustomizationHunks(draftScreen)).toBe("");
  });
});
