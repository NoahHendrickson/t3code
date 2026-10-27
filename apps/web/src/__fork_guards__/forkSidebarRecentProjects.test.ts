// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-sidebar-recent-projects`.
 *
 * The V2 sidebar carries a quick-start strip of recent projects between the
 * action rows and the Threads row. A sync that drops the call site, or routes
 * it through a different start path than the project header's plus, loses the
 * one-click start or lets the two land in different environments.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const strip = readSibling("../custom/SidebarV2RecentProjectsStrip.tsx");
const glassSurfaces = readSibling("../theme.custom.glass-surfaces.css");

describe("fork guard: fork-sidebar-recent-projects", () => {
  it("renders the strip between the action rows and the Threads row", () => {
    const actionsAt = sidebar.indexOf("<SidebarV2ChromeActionRows");
    const stripAt = sidebar.indexOf("<SidebarV2RecentProjectsStrip");
    const threadsRowAt = sidebar.indexOf("<SidebarV2ProjectScopeRow");
    expect(actionsAt).toBeGreaterThan(-1);
    expect(stripAt).toBeGreaterThan(actionsAt);
    expect(threadsRowAt).toBeGreaterThan(stripAt);
  });

  it("starts through the project header's own new-thread handler", () => {
    const stripAt = sidebar.indexOf("<SidebarV2RecentProjectsStrip");
    const callSite = sidebar.slice(stripAt, sidebar.indexOf("/>", stripAt));
    expect(callSite).toContain("onStartAgent={handleNewThreadInProject}");
    expect(sidebar).toContain("const handleNewThreadInProject = useCallback(");
  });

  it("wears the glass rim under Glass unless 3D is off", () => {
    expect(strip).toContain('data-fork-recent-project=""');
    const fullOnlyAt = glassSurfaces.lastIndexOf(
      ':where(:not([data-fork-glass-3d="off"])) {',
      glassSurfaces.indexOf("[data-fork-recent-project] {"),
    );
    const ruleAt = glassSurfaces.indexOf("[data-fork-recent-project] {");
    expect(fullOnlyAt).toBeGreaterThan(-1);
    expect(ruleAt).toBeGreaterThan(fullOnlyAt);
    expect(glassSurfaces.slice(ruleAt, glassSurfaces.indexOf("}", ruleAt))).toContain(
      "var(--fork-glass-rim)",
    );
  });
});
