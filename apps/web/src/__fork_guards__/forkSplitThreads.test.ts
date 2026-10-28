// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * The split lives in custom/splitThreads, but it only works through three
 * fenced seams in upstream files: ThreadRouteView handing every chat view
 * through the panes, ChatView keeping window-level input to the focused
 * pane, and the sidebar painting pairs and taking card drops. Each seam
 * compiles on its own if a sync drops another, so they are pinned here.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const routeView = readSibling("../components/ThreadRouteView.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const sidebar = readSibling("../components/Sidebar.tsx");
const dictation = readSibling("../custom/voice/useForkDictationController.ts");
const composer = readSibling("../components/chat/ChatComposer.tsx");
const questionCard = readSibling("../custom/useComposerPendingUserInputCard.ts");

describe("fork guard: fork-split-threads", () => {
  it("routes every chat view through the split panes", () => {
    expect(routeView).toMatch(
      /fork:begin fork-split-threads[\s\S]*?<SplitThreadPanes layout=\{splitLayout\} focusedRef=\{routeThreadRef\} focusedView=\{view\} \/>[\s\S]*?fork:end fork-split-threads/u,
    );
    // Upstream's bare {view} must not come back beside it, or the focused
    // ChatView would render twice.
    expect(routeView).not.toMatch(/^\s*\{view\}\s*$/mu);
  });

  it("keeps window-level input to the focused pane", () => {
    expect(chatView).toContain("const splitPane = useSplitPane();");
    expect(chatView).toMatch(
      /enabled:\s*activeThreadId !== null &&[\s\S]{0,200}splitPane\.focused/u,
    );
    // Automatic focus, paste-to-focus, menu actions and the scroll keys.
    expect(chatView.match(/if \(!splitPaneFocusedRef\.current\) return;/gu)?.length).toBe(4);
    expect(dictation).toContain("if (!controller || !paneFocused) return;");
    // Children with their own window listeners: the stash shortcut and the
    // pending question's digit answers.
    expect(composer).toMatch(
      /fork:begin fork-split-threads[\s\S]*?if \(!splitPaneFocused\) return;[\s\S]*?composer\.stash/u,
    );
    expect(questionCard).toContain(
      "if (!activeQuestion || responseDisabled || !paneFocused) return;",
    );
  });

  it("offers the pill above the composer", () => {
    expect(chatView).toMatch(
      /fork:begin fork-split-threads[\s\S]*?<SplitAgentPill[\s\S]*?fork:end fork-split-threads/u,
    );
  });

  it("paints pairs and takes card drops in the sidebar", () => {
    expect(sidebar).toContain("const renderOneThreadRow = (");
    expect(sidebar).toMatch(/const renderThreadRow = \([\s\S]*?resolveSidebarSplitRow\(/u);
    expect(sidebar).toContain("{...splitDropHandlers}");
    expect(sidebar).toContain("splitThreadDragSourceProps(threadKey,");
  });
});
