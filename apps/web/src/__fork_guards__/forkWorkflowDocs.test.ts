// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-workflow-docs`.
 *
 * AGENTS.md is upstream-owned, so an upstream rewrite could silently drop the
 * fenced Fork Workflow section in a "clean" sync — and with it, every future
 * agent's knowledge of the branch rules. Fail loudly instead.
 *
 * CLAUDE.md is watched for the same reason and owned by the fork: its blob
 * deliberately differs from upstream's, which carries a trailing newline that
 * breaks the link. Never resolve a sync conflict on it by taking upstream.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("fork guard: fork-workflow-docs", () => {
  it("keeps the fenced Fork Workflow section in AGENTS.md", () => {
    const agents = NodeFS.readFileSync(NodePath.join(repoRoot, "AGENTS.md"), "utf8");
    expect(agents).toContain("fork:begin fork-workflow");
    expect(agents).toContain("fork:end fork-workflow");
    expect(agents).toContain(".fork/AGENTS.md");
  });

  it("keeps CLAUDE.md aliased to AGENTS.md so Claude agents get the same rules", () => {
    // Assert the committed object, not the working tree. What an agent gets
    // is whatever the clone materializes from this blob, and a checkout with
    // core.symlinks=false writes a regular file instead — so a working-tree
    // check reds against a perfectly correct commit. The blob is also where
    // the bug lives: no trim, because a symlink's target is its blob
    // verbatim, and a trailing newline aims it at a filename that cannot
    // exist. That is exactly the state the old `.trim()` assertion
    // normalized away, holding its value while upstream fixed the newline in
    // 5e13f5357 and reintroduced it in 6891c77d3.
    const lsTree = NodeChildProcess.execSync("git ls-tree HEAD -- CLAUDE.md", {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(lsTree.split(/\s+/u)[0]).toBe("120000");
    const target = NodeChildProcess.execSync("git cat-file -p HEAD:CLAUDE.md", {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(target).toBe("AGENTS.md");
  });

  it("resolves CLAUDE.md to the rules rather than merely pointing at them", () => {
    // The promise in the manifest is that an agent opening CLAUDE.md learns
    // the fork rules. That is a statement about what reading it produces, not
    // about how the link is spelled, so read through it. This covers what the
    // committed-blob check above cannot: a conflicted or dirty working tree,
    // where HEAD still holds the fork's good blob.
    const claudePath = NodePath.join(repoRoot, "CLAUDE.md");
    if (!NodeFS.lstatSync(claudePath).isSymbolicLink()) {
      // core.symlinks=false checkout — git wrote the target as a regular
      // file. Read-through is not a property this checkout can have, and the
      // commit is still correct, so assert the fallback shape rather than a
      // false red.
      expect(NodeFS.readFileSync(claudePath, "utf8")).toBe("AGENTS.md");
      return;
    }
    // Precondition, so a broken link fails as an assertion rather than an
    // ENOENT thrown out of readFileSync.
    expect(NodeFS.existsSync(claudePath)).toBe(true);
    const claude = NodeFS.readFileSync(claudePath, "utf8");
    const agents = NodeFS.readFileSync(NodePath.join(repoRoot, "AGENTS.md"), "utf8");
    expect(claude).toBe(agents);
  });
});
