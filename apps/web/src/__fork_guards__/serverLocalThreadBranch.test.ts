// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-local-thread-branch`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const ws = readSibling("../../../server/src/ws.ts");
const serverTest = readSibling("../../../server/src/server.test.ts");

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
  it("fills a bootstrap thread's missing branch from the live checkout", () => {
    const hunks = readCustomizationHunks(ws);
    // The label comes from the status service, the same source the sidebar
    // and PR badge compare against — never from listRefs' cache-served flag.
    expect(hunks).toContain("gitWorkflow.localStatus({ cwd })");
    expect(hunks).toContain("return local.refName");
    // An existing worktree is the checkout to read; the project root is the
    // fallback, not the other way round.
    expect(hunks).toMatch(/createThread\.worktreePath \?\?\s*\(Option\.isSome\(project\)/u);
    // The client's own choice always wins, and a worktree being prepared
    // names its branch through that flow instead.
    expect(hunks).toMatch(
      /bootstrap\.createThread\.branch \?\?\s*\(bootstrap\.prepareWorktree\s*\? null\s*: yield\* resolveCheckedOutBranch\(bootstrap\.createThread\)\)/u,
    );
    // The fallback must never fail the turn start: a status error logs and
    // yields null rather than surfacing to the client.
    expect(hunks).toContain("Effect.as(null)");
  });

  it("keeps the focused server test that pins the behavior", () => {
    expect(readCustomizationHunks(serverTest)).toContain(
      "fills in the checked-out branch when a bootstrap thread names none",
    );
  });
});
