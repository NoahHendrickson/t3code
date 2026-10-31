// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-new-worktree-default-base`.
 *
 * Entering New worktree must clear the draft's branch so the branch selector
 * seeds the repo default, and only on the way in, so reselecting the checked
 * item keeps a base the user picked. A sync that restores upstream's
 * onEnvModeChange puts new worktrees back on the checked-out (or previous
 * worktree's) branch.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Upstream moved onEnvModeChange into useComposerSelection.
const chatView = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../components/chat/useComposerSelection.ts", import.meta.url)),
  "utf8",
);

describe("fork guard: fork-new-worktree-default-base", () => {
  it("clears the carried branch only when a draft enters worktree mode", () => {
    const start = chatView.indexOf("const onEnvModeChange = (mode");
    expect(start).toBeGreaterThan(-1);
    const fence = chatView.slice(
      start,
      chatView.indexOf("fork:end fork-new-worktree-default-base", start),
    );
    expect(fence.replace(/\s+/g, " ")).toContain(
      '...(mode === "worktree" && resolveEffectiveEnvMode({ activeWorktreePath: draftThread?.worktreePath ?? null, hasServerThread: false, draftThreadEnvMode: draftThread?.envMode, }) !== "worktree" ? { branch: null, worktreePath: null } : {}),',
    );
  });
});
