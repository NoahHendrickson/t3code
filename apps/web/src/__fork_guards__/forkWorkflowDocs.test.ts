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
    const link = NodeFS.lstatSync(NodePath.join(repoRoot, "CLAUDE.md"));
    expect(link.isSymbolicLink()).toBe(true);
    expect(NodeFS.readlinkSync(NodePath.join(repoRoot, "CLAUDE.md"))).toBe("AGENTS.md");
  });
});
