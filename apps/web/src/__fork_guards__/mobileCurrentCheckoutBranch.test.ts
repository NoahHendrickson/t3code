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
  it("applies the resolver to immediate and offline creation", () => {
    expect(readCustomizationHunks(draftScreen)).toContain(
      "const selectedBranchName = resolveProjectThreadBranch({",
    );
    expect(readCustomizationHunks(flowProvider)).toContain("branch: resolveProjectThreadBranch({");
  });
});
