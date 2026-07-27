// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-workflow-docs`.
 *
 * AGENTS.md is upstream-owned, so an upstream rewrite could silently drop the
 * fenced Fork Workflow section in a "clean" sync — and with it, every future
 * agent's knowledge of the branch rules. Fail loudly instead.
 */

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
    const claudePath = NodePath.join(repoRoot, "CLAUDE.md");
    expect(NodeFS.lstatSync(claudePath).isSymbolicLink()).toBe(true);
    // No trim. A symlink's target is its blob verbatim, so a trailing newline
    // aims it at a filename that cannot exist — which is exactly the state
    // this assertion used to normalize away and pass through. Upstream fixed
    // that newline in 5e13f5357 and reintroduced it in 6891c77d3 without any
    // guard changing value, so match the target exactly.
    expect(NodeFS.readlinkSync(claudePath)).toBe("AGENTS.md");
  });

  it("resolves CLAUDE.md to the rules rather than merely pointing at them", () => {
    // The promise in the manifest is that an agent opening CLAUDE.md learns
    // the fork rules. That is a statement about what reading it produces, not
    // about how the link is spelled, so read through it.
    const claude = NodeFS.readFileSync(NodePath.join(repoRoot, "CLAUDE.md"), "utf8");
    const agents = NodeFS.readFileSync(NodePath.join(repoRoot, "AGENTS.md"), "utf8");
    expect(claude).toBe(agents);
    expect(claude).toContain("fork:begin fork-workflow");
    expect(claude).toContain(".fork/AGENTS.md");
  });
});
