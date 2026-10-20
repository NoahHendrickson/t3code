// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-status-grouping`.
 *
 * Bucketing and the Completed hold are tested as behaviour beside their module
 * (`custom/sidebarV2StatusGrouping.test.ts`). This guards the seam inside
 * upstream's `Sidebar.tsx`: that the switch is wired, that status sections
 * come out of the same `activeSections` sequence the keyboard order flattens,
 * and that the Working shelf beta stands down while status grouping is on.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");

describe("fork guard: sidebar-v2-status-grouping", () => {
  it("offers the option beside Group by project, exclusive with it", () => {
    expect(chromeRows).toContain("Group by status");
    // One grouping value, so the two switches cannot both be on.
    expect(chromeRows).toContain('value="status"');
    expect(chromeRows).toContain('value="none"');
    expect(sidebar).toContain("onGroupingChange={setGrouping}");
    expect(sidebar).toContain('const statusGrouped = grouping === "status";');
  });

  it("builds status sections inside activeSections, so paint and keyboard order stay one list", () => {
    const start = sidebar.indexOf("const activeSections = useMemo(");
    const end = sidebar.indexOf("const visibleActiveSections = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const memo = sidebar.slice(start, end);
    expect(memo).toContain("buildSidebarV2StatusSections({");
    expect(memo).toContain("holds: completedHolds");
    expect(memo).toContain("openThreadKey: statusOpenThreadKey");
    expect(sidebar).toContain('if (section.kind === "status")');
    expect(sidebar).toContain("visibleActiveSections.flatMap((section) => section.threads)");
    expect(sidebar).toContain("<SidebarV2StatusSectionHeader");
  });

  it("gives the pinned block its own collapsible header while status grouping is on", () => {
    expect(sidebar).toContain(
      "const pinnedSectionShown = statusGrouped && pinnedThreads.length > 0;",
    );
    expect(sidebar).toContain('section="pinned"');
    expect(sidebar).toContain('collapsedStatusSections.has("pinned")');
    // The collapsed block paints and navigates the same rows.
    expect(sidebar).toContain("...visiblePinnedThreads,");
    // The header replaces the divider; the other modes keep it.
    expect(sidebar).toMatch(/pinnedThreads\.length > 0 &&[\s\S]{0,200}?!pinnedSectionShown/u);
  });

  it("keeps the Working shelf beta out of the way while status grouping is on", () => {
    expect(sidebar).toContain("const workingShelfActive = workingShelfEnabled && !statusGrouped;");
    expect(sidebar).toContain("workingShelfActive && isSidebarThreadWorking(thread)");
  });
});
