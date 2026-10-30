// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-spaces`.
 *
 * Spaces live in two upstream files: the sidebar draws each space's rows
 * around its cards, and the chat header draws the open-thread tabs either
 * side of its breadcrumb. A sync that drops either call site silently turns
 * Spaces back into plain project grouping, or leaves the header with no
 * tabs.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const chatHeader = readSibling("../components/chat/ChatHeader.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const routeTree = readSibling("../routeTree.gen.ts");
const scheduledPage = readSibling("../custom/scheduled/ScheduledPage.tsx");
const palettes = readSibling("../theme.custom.palettes.css");

describe("fork guard: fork-spaces", () => {
  it("offers Spaces in the grouping radios", () => {
    expect(chromeRows).toMatch(/<OptionRadioItem\s+value="spaces"/u);
    expect(sidebar).toContain('const spacesGrouped = grouping === "spaces";');
    expect(chromeRows).toContain('{props.grouping === "spaces" ? "Spaces" : "Threads"}');
  });

  it("sections every project under Spaces, even a single one", () => {
    const branchAt = sidebar.indexOf("if (spacesGrouped) {");
    expect(branchAt).toBeGreaterThan(-1);
    const branch = sidebar.slice(branchAt, sidebar.indexOf("}", sidebar.indexOf("});", branchAt)));
    expect(branch).toContain("buildActiveThreadSections(");
    expect(branch).toContain("grouped: true");
  });

  it("draws the space header with its favicon and the status caret", () => {
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(sidebar).toContain('variant={spacesGrouped ? "space" : "project"}');
    expect(header).toContain('<ProjectFavicon project={props.spaceProject} className="size-4" />');
    expect(sidebar).toContain("spaceProject={");
    expect(header).toContain('data-fork-space-caret=""');
    expect(header).toContain('<path d="M2.71 4.75H11.29L7 9.04Z" />');
  });

  it("puts a space's rows in its section and leads its cards with their provider", () => {
    const rows = readSibling("../custom/spaces/SidebarV2SpaceRows.tsx");
    expect(rows).toContain('data-fork-space-row="" data-fork-project-section=""');
    expect(sidebar).toContain("spaceProviderMark={spacesGrouped && underProjectHeader}");
    expect(sidebar).toContain("props.spaceProviderMark === true ? (");
  });

  it("hangs a space's children off a guide line under its favicon", () => {
    const theme = readSibling("../theme.custom.css");
    const stepAt = theme.indexOf(
      "ul:has(> li[data-fork-space-header])\n  > li[data-fork-project-section] {",
    );
    expect(stepAt).toBeGreaterThan(-1);
    expect(theme.slice(stepAt, theme.indexOf("}", stepAt))).toContain(
      "padding-inline-start: 28px;",
    );
    expect(theme).toContain("left: 18.5px;");
  });

  it("folds a space's cards without changing its header's collapse", () => {
    expect(sidebar).toContain("spaceThreadsFolded(section.header, expandedSpaceThreads)");
    // The header still reads the one collapsed flag (sidebar-v2-project-grouping).
    expect(sidebar).toContain("collapsed={section.collapsed}");
  });

  it("draws the Threads row before the cards and the link rows after them", () => {
    const threadsRowAt = sidebar.indexOf("<SidebarV2SpaceThreadsRow");
    const cardsAt = sidebar.indexOf("...section.threads.map((thread) =>", threadsRowAt);
    const linksAt = sidebar.indexOf("<SidebarV2SpaceLinkRows", cardsAt);
    expect(threadsRowAt).toBeGreaterThan(-1);
    expect(cardsAt).toBeGreaterThan(threadsRowAt);
    expect(linksAt).toBeGreaterThan(cardsAt);
  });

  it("draws the tabs on a row of their own: in a chat view, or once over a split", () => {
    const chatView = readSibling("../components/ChatView.tsx");
    const panes = readSibling("../custom/splitThreads/SplitThreadPanes.tsx");
    // Above the header, never sharing its row; not in a split or a float window.
    expect(chatView).toContain(
      "const forkSpaceTabRow = forkSpacesOn && !splitPane.split && !splitPane.floating;",
    );
    expect(chatView.indexOf("<SpaceTabRow")).toBeLessThan(chatView.indexOf("data-chat-header"));
    // A split's row is a sibling before the panes, so they never remount.
    const rowAt = panes.indexOf("<SplitSpaceTabRow");
    expect(rowAt).toBeGreaterThan(-1);
    expect(rowAt).toBeLessThan(panes.indexOf("data-fork-split-threads={split"));
    // The header is upstream's again.
    expect(chatHeader).not.toContain("fork-spaces");
  });

  it("keeps a split's sidebar pair in its space's run, stacked", () => {
    expect(readSibling("../custom/splitThreads/SidebarSplitPairRow.tsx")).toContain(
      'data-fork-project-section={props.projectSection ? "" : undefined}',
    );
    expect(readSibling("../components/Sidebar.tsx")).toContain(
      "projectSection={options.underProjectHeader === true}",
    );
    const theme = readSibling("../theme.custom.css");
    // Stacked in a tray, both cards lit while the split is on screen.
    const stackAt = theme.indexOf("& > li[data-fork-split-pair] > ul {");
    expect(stackAt).toBeGreaterThan(-1);
    const stack = theme.slice(stackAt, theme.indexOf("}", stackAt));
    expect(stack).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(stack).toContain("background: rgb(0 0 0 / 0.04);");
    expect(theme).toContain(
      '> ul:has(> li > [aria-current="page"])\n    > li[data-thread-item]:not(:has(> [aria-current="page"]))',
    );
  });

  it("pairs a split's two threads, ranks by status, and lifts the Glass card", () => {
    const tabs = readSibling("../custom/spaces/SpaceThreadTabs.tsx");
    const theme = readSibling("../theme.custom.css");
    expect(tabs).toContain("tabs.filter((tab) => tab !== homePartner),");
    expect(tabs).toContain('data-fork-space-tab-pair=""');
    expect(tabs).toContain("const tabs = rankSpaceTabs(");
    expect(tabs).toContain('data-fork-space-tab-selected={selected ? "" : undefined}');
    // Each tab leads with its provider: Claude's mascot, the Codex cloud.
    expect(tabs).toContain("provider={providerFor(tab.shell)}");
    expect(readSibling("../custom/icons/ProviderMarks.tsx")).toContain(
      'if (props.driverKind === "claudeAgent") {',
    );
    const liftAt = theme.indexOf('[data-fork-space-tab-row="thread"]');
    expect(liftAt).toBeGreaterThan(-1);
    expect(theme.slice(liftAt, theme.indexOf("}", liftAt))).toContain("top: 2.75rem;");
    const ruleAt = theme.indexOf("[data-fork-space-tab-selected] {");
    expect(theme.slice(ruleAt, theme.indexOf("}", ruleAt))).toContain(
      "box-shadow: var(--fork-glass-selected-shadow);",
    );
  });

  it("makes a space's empty draft its Home, with the real composer and the overview", () => {
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toContain("const forkSpaceHome = forkSpacesOn && isDraftHeroState;");
    expect(chatView).toContain("<SpaceDraftOverview project={activeProjectRef} />");
    expect(chatView).toContain("homeActive={!isServerThread}");
    expect(readSibling("../theme.custom.css")).toContain(
      '[data-chat-composer-overlay="true"][data-draft-hero][data-fork-space-home] {',
    );
  });

  it("routes the changelog and filters automations by space", () => {
    expect(routeTree).toContain("from './routes/changelog'");
    expect(scheduledPage).toContain("spaceKey={search.space}");
    expect(scheduledPage).toContain("spaceHasProject(space, environmentId, task.projectId)");
  });

  it("draws the shelves under spaces with the spaces' caret and no hairline", () => {
    expect(sidebar).toContain("<SidebarV2SpaceCaret open={snoozedShelfExpanded} />");
    expect(sidebar).toContain("<SidebarV2SpaceCaret open={settledShelfExpanded} />");
    const theme = readSibling("../theme.custom.css");
    const shelfAt = theme.indexOf("& > span.h-px {");
    expect(theme.slice(shelfAt, theme.indexOf("}", shelfAt))).toContain("background: transparent;");
  });

  it("inks a space's rows with Glass's quiet ink", () => {
    const ruleAt = palettes.indexOf("[data-fork-space-row] {");
    expect(ruleAt).toBeGreaterThan(-1);
    expect(palettes.slice(ruleAt, palettes.indexOf("}", ruleAt))).toContain(
      "--contrast-muted-foreground: var(--fork-glass-quiet-ink);",
    );
  });
});
