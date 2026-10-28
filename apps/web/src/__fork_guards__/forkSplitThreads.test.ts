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
const threadFind = readSibling("../components/chat/useThreadFind.ts");
const panes = readSibling("../custom/splitThreads/SplitThreadPanes.tsx");

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
    // Effects that listen on the window or take focus on their own guard on
    // the pane: the snap-shot focus subscription, the timeline scroll keys,
    // thread-switch and window-focus refocus, menu actions and paste-to-focus.
    expect(chatView).toMatch(/splitPane\.focused\s*\?[\s\S]{0,80}subscribeSnapShotComposerFocus/u);
    expect(chatView).toMatch(
      /if \(splitPane\.focused\)[\s\S]{0,80}document\.addEventListener\("keydown", handleKeyDown\)/u,
    );
    expect(chatView.match(/if \(!splitPane\.focused\) return;/gu)?.length).toBe(4);
    // The focus primitive itself stays ungated: a pane's own controls use it.
    expect(chatView).toMatch(
      /const focusComposer = \(\) => \{\s*composerRef\.current\?\.focusAtEnd\(\);/u,
    );
    // Global singletons and broadcasts: the PR-link dialog and palette find.
    expect(chatView).toContain("{splitPane.focused ? <LinkPullRequestDialogHost /> : null}");
    expect(threadFind).toContain("paneFocused ? subscribeThreadFindOpen(open) : undefined");
    expect(dictation).toContain("if (!controller || !paneFocused) return;");
    // A recording left running in a pane that loses focus finishes there.
    expect(dictation).toMatch(
      /!paneFocused && controller && isDictationLive\(controller\.currentState\)[\s\S]{0,60}controller\.stop\(\)/u,
    );
    // Each slot owns its ChatView's composer ref; the palette reads the focused one.
    expect(panes).toMatch(/ComposerHandleContext value=\{props\.composerRef\}/u);
    expect(panes).toContain('Object.defineProperty(paletteComposerRef, "current"');
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
    // One model decides what paints, the keyboard order and the drop targets.
    expect(sidebar).toMatch(/const splitModel = useMemo\([\s\S]*?buildSidebarSplitModel\(/u);
    expect(sidebar).toMatch(/const renderThreadRow = \([\s\S]*?splitModel\.rows\.get\(/u);
    expect(sidebar).toMatch(/splitModel\.order\s*(\/\*[\s\S]*?\*\/\s*)?\.map\(/u);
    expect(sidebar).toContain("canPair: (threadKey) => splitModel.pairable.has(threadKey),");
    expect(sidebar).toContain("{...splitDropHandlers}");
    expect(sidebar).toContain("splitThreadDragSourceProps(threadKey,");
  });
});
