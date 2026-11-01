// @effect-diagnostics nodeBuiltinImport:off
/* Fork guard, see `.fork/customizations.yaml#fork-collapsed-thread-tabs`. A sync that drops
   the mount, the header-inset rule or the selected glass loses the tabs or their look. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = readSibling("../components/ChatView.tsx");
const chatHeader = readSibling("../components/chat/ChatHeader.tsx");
const strip = readSibling("../custom/CollapsedThreadTabs.tsx");
const theme = readSibling("../theme.custom.css");
const glassSurfaces = readSibling("../theme.custom.glass-surfaces.css");
const sidebar = readSibling("../components/Sidebar.tsx");

describe("fork guard: fork-collapsed-thread-tabs", () => {
  it("mounts the strip in the leading chat column only, above its header", () => {
    const columnAt = chatView.indexOf("data-chat-column\n");
    const stripAt = chatView.indexOf("{splitPane.leading && !splitPane.floating ? (", columnAt);
    const headerAt = chatView.indexOf("<header", columnAt);
    expect(columnAt).toBeGreaterThan(-1);
    expect(stripAt).toBeGreaterThan(columnAt);
    expect(headerAt).toBeGreaterThan(stripAt);
  });

  it("starts a new agent through the sidebar's own paths, in the filtered project if any", () => {
    expect(strip).toContain("const startNewAgentDraft = useStartNewAgentDraft();");
    expect(strip).toContain(
      "if (filteredProject && startSidebarThreadInProject(filteredProject.projectKey)) return;",
    );
    expect(strip).toContain("onClick={startNewAgent}");
    expect(sidebar).toContain(
      "() => registerSidebarStartThreadInProject(handleNewThreadInProject),",
    );
  });

  it("renders only while the desktop sidebar is collapsed, holding Completed throughout", () => {
    expect(strip).toContain("if (isMobile) return null;");
    expect(strip).toContain("if (sidebarVisible) return <CompletedHoldObserver />;");
  });

  it("pulls the chat header under the strip back to the gutter", () => {
    expect(theme).toContain("[data-chat-column]:has(> [data-fork-thread-tabs]) {");
    // The breadcrumb hides only while the open thread has a visible tab.
    expect(theme).toContain(
      "[data-chat-column]:has(> [data-fork-thread-tabs][data-open-thread-tabbed])",
    );
    expect(theme).toContain('nav[aria-label="Thread breadcrumb"] {');
    expect(chatHeader).toContain('ariaLabel="Thread breadcrumb"');
    expect(strip).toContain('data-open-thread-tabbed={openThreadTabbed ? "" : undefined}');
    expect(theme).not.toContain("--workspace-controls-top: calc(");
    expect(strip).toContain('data-fork-thread-tabs=""');
  });

  it("opens the sidebar's own thread menu and settles through its own path", () => {
    expect(sidebar).toContain(
      "useEffect(() => registerSidebarThreadMenu(handleThreadContextMenu), [handleThreadContextMenu]);",
    );
    expect(strip).toContain("openSidebarThreadMenu(threadRef, position)");
    expect(strip).toContain("settleAndAdvance(threadRef)");
    expect(sidebar).toContain("if (!isMobile) setSidebarOpen(true);");
  });

  it("dresses the selected tab and project in the selected card's glass", () => {
    const start = glassSurfaces.indexOf("fork:begin fork-collapsed-thread-tabs");
    const block = glassSurfaces.slice(
      start,
      glassSurfaces.indexOf("fork:end fork-collapsed-thread-tabs"),
    );
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('[data-fork-thread-tab][data-active="true"]');
    expect(block).toContain("[data-fork-segmented-tab][data-pressed]");
    for (const token of [
      "--fork-glass-selected-shadow",
      "--fork-glass-selected-glint",
      "--fork-glass-dark-edge",
    ]) {
      expect(block).toContain(`var(${token})`);
    }
  });
});
