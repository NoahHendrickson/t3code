// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * The bucketing itself is behaviour, and it is tested as behaviour next to the
 * module it lives in (`custom/sidebarV2ProjectGrouping.test.ts`). This file
 * guards only the seam inside upstream's `SidebarV2.tsx`, which nothing else
 * can observe without standing up the whole sidebar: that the switch is wired,
 * that the rendered sequence and the keyboard-order sequence are the same one,
 * and that grouping stays off the two shelves.
 *
 * The seam that matters most is the second. `orderedActiveThreads` backs arrow
 * navigation, shift-range selection and post-settle landing, all positional, so
 * a list that disagrees with the paint order addresses the wrong row — and
 * nothing about the render *looks* wrong when it does. Both now derive from one
 * `activeSections`, which is what makes the divergence unrepresentable rather
 * than merely unlikely; these assertions catch a merge that splits them apart
 * again.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/SidebarV2.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");

describe("fork guard: sidebar-v2-project-grouping", () => {
  it("offers the switch from the project scope menu", () => {
    expect(chromeRows).toContain("Group by project");
    expect(chromeRows).toContain("onGroupByProjectChange");
    // Toggling a view preference must not dismiss the menu it lives in.
    expect(chromeRows).toContain("closeOnClick={false}");
    expect(sidebar).toContain("groupByProject={groupByProject}");
    // Where grouping can draw no header, the switch says so rather than
    // accepting a click that does nothing.
    expect(chromeRows).toContain("disabled={props.groupByProjectUnavailableReason !== null}");
    expect(sidebar).toContain("groupByProjectUnavailableReason=");
  });

  it("renders and orders from one sequence", () => {
    expect(sidebar).toContain("const activeSections = useMemo(");
    // Collapse filters paint before flatten: keyboard order reads the same
    // visible sequence the list draws, not the unfiltered bucket list.
    expect(sidebar).toContain("const visibleActiveSections = useMemo(");
    expect(sidebar).toContain("visibleActiveSections.flatMap((section) => section.threads)");
    // Render call is multiline after format — pin the callback args, not a
    // single-line spelling prettier will keep rewriting.
    expect(sidebar).toMatch(/visibleActiveSections\.flatMap\(\s*\(section,\s*sectionIndex\)\s*=>/u);
    expect(sidebar).toContain("[...orderedActiveThreads, ...visibleSnoozedThreads");
    const definition = sidebar.indexOf("const orderedActiveThreads");
    const use = sidebar.indexOf("[...orderedActiveThreads,");
    expect(definition).toBeGreaterThanOrEqual(0);
    expect(use).toBeGreaterThan(definition);
  });

  it("draws a header for every section that has one, in paint order", () => {
    // The other half of the single-sequence claim: the render must emit the
    // header from the same section whose threads follow it. Dropping this hunk
    // is the likeliest outcome of a merge that rewrites upstream's list body,
    // and it would leave a flat-looking sidebar over a grouped ordered list.
    const start = sidebar.indexOf("const items: ReactNode[] = visibleActiveSections.flatMap(");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sidebar.indexOf("/* fork:end sidebar-v2-project-grouping */", start);
    expect(end).toBeGreaterThan(start);
    const render = sidebar.slice(start, end);
    expect(render).toContain("<SidebarV2ProjectGroupHeader");
    // One binding for both halves, taken from the section being rendered: the
    // header is drawn from it and the cards' under-a-header flag is read off
    // the same value, so they cannot come to disagree.
    expect(render).toContain("const header = section.header;");
    expect(render).toContain('renderThreadRow(thread, "active", header !== null)');
    // collapsed is decided once in visibleActiveSections and carried on the
    // section — recomputing membership here would drift from the filter.
    expect(render).toContain("collapsed={section.collapsed}");
    expect(render).not.toContain("collapsedProjectKeys.has(header.projectKey)");
    expect(render).toContain("onToggleCollapsed=");
  });

  it("collapses from the row with a hover chevron, leaving the plus alone", () => {
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain('data-testid="sidebar-v2-project-group-collapse"');
    expect(header).toContain("aria-expanded={!props.collapsed}");
    expect(header).toContain("FolderOpenIcon");
    expect(header).toContain("ChevronDownIcon");
    // Hover group is on the row; collapse is a behind-layer so the plus can
    // paint above it. A flex-1 collapse sibling was eating plus clicks.
    expect(header).toContain("group/collapse relative flex w-full");
    expect(header).toContain("absolute inset-0 z-0");
    expect(header).toContain('"relative z-10"');
    expect(header).toContain("group-hover/collapse:invisible");
    expect(header).toContain("group-hover/collapse:visible");
    expect(header).toContain("New thread in ${label}");
    expect(header).toContain("event.stopPropagation()");
    // Persistence and the route-thread keep live in the grouping module so a
    // sync that drops the SidebarV2 wiring still fails the behaviour tests.
    const grouping = readSibling("../custom/sidebarV2ProjectGrouping.ts");
    expect(grouping).toContain("SIDEBAR_V2_COLLAPSED_PROJECTS_STORAGE_KEY");
    expect(grouping).toContain("threadsVisibleInProjectSection");
    expect(sidebar).toContain("useSidebarV2CollapsedProjects");
  });

  it("starts a thread in the header's own project, and only where there is one", () => {
    // The chrome row's plus has to ask which project when there are several;
    // a grouped header has already answered it.
    //
    // Which environment it lands in is the palette's rule, shared rather than
    // restated: buildSidebarProjectPickerEntries prefers the member matching
    // the thread you are reading and falls back to the group's canonical ref.
    // An earlier revision took that canonical ref directly, which is a
    // different rule — reading a remote thread of a project that also has a
    // local member, the palette starts remote and the shortcut started local.
    // Calling the function is what makes the two agree; asserting the call is
    // what keeps them agreeing.
    expect(sidebar).toContain("buildSidebarProjectPickerEntries({");
    expect(sidebar).toContain("preferredProjectRef: resolveThreadActionProjectRef({");
    expect(sidebar).toContain(
      "scopeProjectRef(entry.targetProject.environmentId, entry.targetProject.id)",
    );
    // The unresolved-project section names no project to start in, and is the
    // one header that must render without the button. Gated on the bucket's own
    // key rather than on its label being null: the label correlates today, and
    // one signal carrying two meanings is how it stops correlating later.
    expect(sidebar).toContain("header.projectKey === UNGROUPED_PROJECT_KEY");
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain("props.onNewThread ?");
    expect(header).toContain("aria-label={`New thread in ${");
  });

  it("groups the active cards only, and only where a header would say something new", () => {
    expect(sidebar).toContain(
      "groupByProject && projectScopeKey === null && projectGroups.length > 1",
    );
    // The shelves keep their flat, time-ordered rendering.
    expect(sidebar).toContain("for (const thread of renderedSettledThreads)");
    expect(sidebar).toContain("for (const thread of visibleSnoozedThreads)");
  });

  it("keeps the project on grouped cards for assistive tech", () => {
    // Grouped cards stop drawing the project name because the header carries
    // it — but a screen reader has no "two rows up", so hiding it visually is
    // the whole of the change. Dropping the prop entirely would make grouped
    // mode carry strictly less than flat mode.
    expect(sidebar).toContain("projectTitleHidden={underProjectHeader}");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("sr-only");
  });

  it("gives the header heading semantics inside upstream's thread list", () => {
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain('role="presentation"');
    expect(header).toContain("aria-level={3}");
    // On the label span, not on the row. The row also holds the collapse
    // control and the new-thread button, and a heading containing either takes
    // that control's text into its own accessible name. That was the role's
    // position before those buttons existed, so a sync restoring it onto the
    // row is the realistic regression, and asserting the role appears
    // *somewhere* in the file cannot tell the two apart.
    expect(header).toMatch(/<span\s+role="heading"/u);
    const headerRow = /<div\s+data-testid="sidebar-v2-project-group-header"[\s\S]*?>/u.exec(
      header,
    )?.[0];
    expect(headerRow).toBeDefined();
    expect(headerRow).not.toContain('role="heading"');
    // Figma 113:3718: no own horizontal pad; 24px folder box + gap-1.
    expect(headerRow).toContain("gap-1");
    expect(headerRow).not.toContain("px-3");
    expect(headerRow).not.toContain("px-2.5");
  });

  it("rebuilds the project index only when the project list changes", () => {
    // The thread list churns on the clock, capability descriptors and PR states
    // arriving per row; indexing every member ref on each of those is work per
    // project for an answer that has not changed.
    expect(sidebar).toContain(
      "const projectRefIndex = useMemo(() => createProjectRefIndex(projectGroups), [projectGroups]);",
    );
  });
});
