// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * The bucketing itself is behaviour, and it is tested as behaviour next to the
 * module it lives in (`custom/sidebarV2ProjectGrouping.test.ts`). This file
 * guards only the seam inside upstream's `Sidebar.tsx`, which nothing else
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

const sidebar = readSibling("../components/Sidebar.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");

describe("fork guard: sidebar-v2-project-grouping", () => {
  it("offers the switch from the projects filter menu", () => {
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
    // Pinned cards paint first and flat (upstream's pin block escapes
    // grouping on purpose); the grouped order follows them, and both feed
    // one keyboard order. Order asserted, not just presence: a merge that
    // reorders the spreads (pinned after active) still contains every name
    // while breaking the paint/keyboard-order outcome.
    const pinnedSpread = sidebar.indexOf("...pinnedThreads,");
    const activeSpread = sidebar.indexOf("...orderedActiveThreads,");
    const snoozedSpread = sidebar.indexOf("...visibleSnoozedThreads,");
    expect(pinnedSpread).toBeGreaterThanOrEqual(0);
    expect(activeSpread).toBeGreaterThan(pinnedSpread);
    expect(snoozedSpread).toBeGreaterThan(activeSpread);
    const definition = sidebar.indexOf("const orderedActiveThreads");
    expect(definition).toBeGreaterThanOrEqual(0);
    expect(activeSpread).toBeGreaterThan(definition);
  });

  it("draws a header for every section that has one, in paint order", () => {
    // The other half of the single-sequence claim: the render must emit the
    // header from the same section whose threads follow it. Dropping this hunk
    // is the likeliest outcome of a merge that rewrites upstream's list body,
    // and it would leave a flat-looking sidebar over a grouped ordered list.
    const start = sidebar.indexOf("...visibleActiveSections.flatMap(");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sidebar.indexOf("/* fork:end sidebar-v2-project-grouping */", start);
    expect(end).toBeGreaterThan(start);
    const render = sidebar.slice(start, end);
    expect(render).toContain("<SidebarV2ProjectGroupHeader");
    // One binding for both halves, taken from the section being rendered: the
    // header is drawn from it and the cards' under-a-header flag is read off
    // the same value, so they cannot come to disagree.
    expect(render).toContain("const header = section.header;");
    expect(render).toMatch(/renderThreadRow\(\s*thread,\s*"active",\s*header !== null\s*\)/u);
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
    // Expanded rest → open folder; collapsed rest → closed (Figma 151:6742);
    // hover either way → chevron.
    expect(header).toContain("FolderOpenIcon");
    expect(header).toContain("FolderClosedIcon");
    expect(header).toContain("ChevronDownIcon");
    // Hover group is on the row; collapse is a behind-layer so the trailing
    // buttons can paint above it. A flex-1 collapse sibling was eating plus
    // clicks. The layer stops one 32px column short of the row's end per
    // trailing button (Figma 364:11451, 368:21126) so the label button's
    // hover fill never lies under them.
    expect(header).toContain("group/collapse relative flex h-8 w-full");
    expect(header).toContain("absolute inset-y-0 left-0 z-0");
    expect(header).toContain(
      'trailingCount === 2 ? "right-16" : trailingCount === 1 ? "right-8" : "right-0"',
    );
    expect(header).toContain('"-me-3 relative z-10 flex shrink-0 items-center"');
    // The design's 32px buttons on the shared 24px box: the size and corner
    // win through twMerge, and -me-3 pulls the group out of the row's padding
    // onto the list edge the trailing derivation measures from.
    expect(
      header.split('cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "size-8 rounded-[10px]")').length - 1,
    ).toBe(2);
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

  it("reveals the header's menu and plus only while its section is hovered", () => {
    // Figma 368:21364: a three-dot opening the project's menu beside the
    // plus, both hidden until the pointer is somewhere in that project's
    // section. The reveal is a stylesheet rule keyed on markers the header
    // and its cards carry — no React state on pointer movement — and the
    // card marker rides projectTitleHidden, which already means "under a
    // header". Focus and coarse pointers see the buttons regardless.
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain('data-fork-project-section-header=""');
    expect(header).toContain('data-fork-section-actions=""');
    expect(header).toContain("EllipsisVerticalIcon");
    expect(header).toContain("aria-label={`Actions for ${label}`}");
    // The menu: settle every active thread in the section, or open the
    // project's settings. Settle-all is disabled at a count of 0 rather than
    // hidden, and the count names exactly what the click touches.
    expect(header).toContain("Settle all threads");
    expect(header).toContain("disabled={settleAllCount === 0}");
    expect(header).toContain("props.onSettleAllThreads?.()");
    expect(header).toContain("props.onProjectSettings?.()");
    // An open menu pins the buttons: the pointer is on the popup, not the row.
    expect(header).toContain('data-fork-menu-open={menuOpen ? "" : undefined}');
    expect(sidebar).toContain(
      'data-fork-project-section={props.projectTitleHidden === true ? "" : undefined}',
    );
    expect(sidebar).toContain("onProjectSettings={");
    expect(sidebar).toContain("if (group) openProjectSettings(group);");
    // Settle-all reuses the multi-select batch path (coSettlingKeys, so
    // post-settle navigation skips the batch) over the *unfiltered* sections
    // — a collapsed group still settles what it hides — with the same three
    // gates the card's own settle button has.
    expect(sidebar).toContain("onSettleAllThreads={");
    expect(sidebar).toContain("const settleAllKeysByProjectKey = useMemo(() => {");
    expect(sidebar).toMatch(
      /for \(const section of activeSections\)[\s\S]{0,600}?draftIdByThreadKey\.has\(threadKey\)[\s\S]{0,200}?settledOverride === "settled"[\s\S]{0,300}?threadSettlement/u,
    );
    expect(sidebar).toMatch(
      /const settleAllThreadsInProject = useCallback\([\s\S]{0,600}?const coSettlingKeys = new Set\(threadKeys\);[\s\S]{0,300}?attemptSettle\(scopeThreadRef\(thread\.environmentId, thread\.id\), \{ coSettlingKeys \}\);/u,
    );
    const theme = readSibling("../theme.custom.css");
    expect(theme).toContain("[data-fork-section-actions][data-fork-menu-open]");
    // The menu is glass: it opens over the thread list, so it is the one
    // popup the fork's opaque-popup rule (fork-popup-surface) carves out.
    expect(header).toContain('data-fork-glass-menu=""');
    expect(theme).toMatch(
      /\[data-slot="menu-popup"\]\.dropdown-glass\[data-fork-glass-menu\]\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/u,
    );
    expect(theme).toMatch(
      /li\[data-fork-project-section-header\]\s+\[data-fork-section-actions\]\s*\{\s*opacity:\s*0;/u,
    );
    expect(theme).toContain(
      "li[data-fork-project-section-header]:has(~ li[data-fork-project-section]:hover):not(",
    );
    expect(theme).toContain(
      ":has(~ li[data-fork-project-section-header] ~ li[data-fork-project-section]:hover)",
    );
    // Keyboard focus, not any focus: a click on the collapse layer leaves it
    // focused, and :focus-within pinned the buttons on after the pointer left.
    expect(theme).toMatch(/:is\(:hover, :has\(:focus-visible\)\)\s+\[data-fork-section-actions\]/u);
    expect(theme).not.toMatch(/section-header\]:is\([^)]*:focus-within/u);
    expect(theme).toMatch(
      /@media \(pointer: coarse\)[\s\S]{0,300}?\[data-fork-section-actions\]\s*\{\s*opacity:\s*1;/u,
    );
  });

  it("makes the headers drag handles under manual project sort", () => {
    // Manual sort reorders by drag, as the legacy sidebar's does: the header
    // is the handle, the drop writes the same projectOrder through the same
    // store action, and only with headers on screen. The sortable items are
    // the headers alone in a list that also holds their cards, so the
    // strategy must displace nothing — a list-sorting strategy would shift
    // the wrong rows under the pointer.
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain(
      "export const SIDEBAR_V2_PROJECT_HEADER_SORTING_STRATEGY: SortingStrategy = () => null;",
    );
    expect(header).toContain("useSortable({ id: props.projectKey, disabled: !props.reorderable })");
    expect(header).toContain("{...(props.reorderable ? sortable.listeners : {})}");
    // The header stamps the drop side; the stylesheet draws the line — over
    // the header for "above", under the section's *last card* for "below"
    // (under the header itself only when the group is closed or empty). A
    // straight pseudo-element, not a shadow on the rounded label button.
    expect(header).toContain("data-fork-drop-edge={dropEdge ?? undefined}");
    expect(header).not.toContain("shadow-[0_-2px");
    const dropTheme = readSibling("../theme.custom.css");
    expect(dropTheme).toContain('[data-fork-drop-edge="above"]::before');
    expect(dropTheme).toMatch(
      /\[data-fork-drop-edge="below"\]\s*~ li\[data-fork-project-section\]:not\(:has\(\+ li\[data-fork-project-section\]\)\)/u,
    );
    expect(dropTheme).toMatch(
      /\[data-fork-drop-edge="below"\]:not\(\s*:has\(\+ li\[data-fork-project-section\]\)\s*\)::after/u,
    );
    // content-visibility:auto paint-contains the card rows, which clipped the
    // line hanging below the last card; the drawing card lifts it.
    expect(dropTheme).toMatch(
      /\[data-fork-drop-edge="below"\]\s*~ li\[data-fork-project-section\][^{]*\)\s*\{\s*content-visibility:\s*visible;/u,
    );
    // And the target is the section the pointer is in, not the nearest
    // header centre; the rule itself is tested beside its module.
    expect(sidebar).toContain("collisionDetection={sidebarV2ProjectSectionCollision}");
    expect(sidebar).toContain('sidebarProjectSortOrder === "manual" &&');
    expect(sidebar).toContain("strategy={SIDEBAR_V2_PROJECT_HEADER_SORTING_STRATEGY}");
    expect(sidebar).toContain("onDragEnd={handleProjectDragEnd}");
    expect(sidebar).toMatch(
      /reorderProjects\(\s*orderedProjects\.map\(getProjectOrderKey\),\s*activeGroup\.memberProjects\.map\(\(member\) => member\.physicalProjectKey\),\s*overGroup\.memberProjects\.map\(\(member\) => member\.physicalProjectKey\),\s*\)/u,
    );
    // The unresolved-project bucket has no order key to write; it never drags.
    expect(sidebar).toMatch(
      /reorderable=\{\s*projectReorderEnabled &&\s*header\.projectKey !== UNGROUPED_PROJECT_KEY\s*\}/u,
    );
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
    // Counted on what the list can show, not on whether it is scoped: a scope
    // of several projects still has several headers worth drawing.
    expect(sidebar).toContain("grouped: groupByProject && visibleProjectCount > 1");
    expect(sidebar).toContain(
      "scopedProjectGroups.length === 0 ? projectGroups.length : scopedProjectGroups.length",
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
    // Figma 364:11442: the row's inline padding, the 16px folder box and the
    // gap to the label all come from custom/sidebarV2CardAlignment, which is
    // what lands the folder mark on the same 20px edge as each card's prompt
    // below it. Derived, never a literal here.
    expect(headerRow).toContain("SIDEBAR_V2_CARD_ALIGNMENT.headerPad");
    expect(headerRow).toContain("SIDEBAR_V2_CARD_ALIGNMENT.headerGap");
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
