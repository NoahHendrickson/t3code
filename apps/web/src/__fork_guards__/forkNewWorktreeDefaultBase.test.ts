// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-new-worktree-default-base`.
 *
 * Choosing New worktree must clear the draft's branch so the branch selector
 * seeds the repo default. A sync that restores upstream's onEnvModeChange
 * puts new worktrees back on the checked-out (or previous worktree's) branch.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const chatView = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../components/ChatView.tsx", import.meta.url)),
  "utf8",
);

describe("fork guard: fork-new-worktree-default-base", () => {
  it("clears the carried branch when a draft enters worktree mode", () => {
    const start = chatView.indexOf("const onEnvModeChange = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const handler = chatView.slice(
      start,
      chatView.indexOf("fork:end fork-new-worktree-default-base", start),
    );
    expect(handler).toContain(
      '...(mode === "worktree" ? { branch: null, worktreePath: null } : {}),',
    );
  });
});
