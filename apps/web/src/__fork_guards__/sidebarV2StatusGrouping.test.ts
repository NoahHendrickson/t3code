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
    expect(sidebar).toContain("listSections.flatMap((section) => section.threads)");
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

  it("feeds drafts to the pipeline and paints Drafts above the pinned block", () => {
    expect(sidebar).toContain("isDraft: (threadKey) => draftIdByThreadKey.has(threadKey),");
    expect(sidebar).toContain("splitSidebarV2DraftsSection(visibleActiveSections)");
    // Paint: the Drafts section comes before the Pinned header.
    const draftsPaint = sidebar.indexOf("renderStatusSection(draftsSection, true)");
    const pinnedHeader = sidebar.indexOf('section="pinned"');
    expect(draftsPaint).toBeGreaterThan(-1);
    expect(draftsPaint).toBeLessThan(pinnedHeader);
    // Keyboard order matches: draft rows, then pinned, then the rest.
    const draftsSpread = sidebar.indexOf("...(draftsSection?.threads ?? EMPTY_THREADS),");
    expect(draftsSpread).toBeGreaterThan(-1);
    expect(draftsSpread).toBeLessThan(sidebar.indexOf("...visiblePinnedThreads,"));
  });

  it("gives the settled tail the status header while status grouping is on", () => {
    // settledCount includes older settled threads the server has not sent yet.
    expect(sidebar).toContain("const settledSectionShown = statusGrouped && settledCount > 0;");
    expect(sidebar).toMatch(/settledCount > 0 &&[\s\S]{0,200}?!settledSectionShown/u);
    expect(sidebar).toContain('section="settled"');
    expect(sidebar).toContain("count={settledCount}");
    expect(sidebar).toContain("collapsed={!settledShelfExpanded}");
    // Flat and project modes keep the hairline shelf header.
    expect(sidebar).toContain('data-testid="sidebar-v2-settled-shelf-toggle"');
  });

  it("keeps the Working shelf beta out of the way while status grouping is on", () => {
    expect(sidebar).toContain("const workingShelfActive = workingShelfEnabled && !statusGrouped;");
    // Upstream's inbox tracker keeps a just-finished run on the shelf for its grace period.
    expect(sidebar).toContain("workingShelfActive && inboxObservation.isWorking(thread)");
  });

  it("stamps the section rows the caret's hover walk reads", () => {
    // theme.custom.css lights a header's caret while a later
    // data-fork-status-section row before the next header is hovered.
    expect(sidebar).toContain(
      'data-fork-status-section={props.inStatusSection === true ? "" : undefined}',
    );
    expect(sidebar).toMatch(
      /inStatusSection=\{\s*statusSection !== undefined \|\|\s*\(section === "settled" && settledSectionShown\)\s*\}/u,
    );
    expect(sidebar).toContain('data-fork-status-section={pinnedSectionShown ? "" : undefined}');
  });
});
