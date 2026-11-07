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
const dictation = readSibling("../custom/voice/forkDictation.ts");
// Upstream moved the stash shortcut into useComposerStash (registerCommands).
const composerStash = readSibling("../components/chat/useComposerStash.ts");
const questionCard = readSibling("../custom/useComposerPendingUserInputCard.ts");
const threadFind = readSibling("../components/chat/useThreadFind.ts");
const panes = readSibling("../custom/splitThreads/SplitThreadPanes.tsx");

describe("fork guard: fork-split-threads", () => {
  it("routes every chat view through the split panes", () => {
    expect(routeView).toMatch(
      /fork:begin fork-split-threads[\s\S]*?<SplitThreadPanes\s+layout=\{splitLayout\}\s+focusedRef=\{routeThreadRef\}[\s\S]*?focusedView=\{view\}\s*\/>[\s\S]*?fork:end fork-split-threads/u,
    );
    // Upstream's bare {view} must not come back beside it, or the focused
    // ChatView would render twice.
    expect(routeView).not.toMatch(/^\s*\{view\}\s*$/mu);
  });

  it("keeps window-level input to the focused pane", () => {
    expect(chatView).toContain("const splitPane = useSplitPane();");
    expect(chatView).toContain("const ownsGlobalInput = useOwnsGlobalInput();");
    expect(chatView).toMatch(/enabled:\s*activeThreadId !== null &&[\s\S]{0,200}ownsGlobalInput,/u);
    // Effects that listen on the window or take focus on their own guard on
    // the pane: the snap-shot focus subscription, the timeline scroll keys,
    // thread-switch and window-focus refocus, menu actions and paste-to-focus.
    // Upstream also gates them off inside a side chat pane (`embedded`).
    expect(chatView).toMatch(
      /splitPane\.focused && !embedded\s*\?[\s\S]{0,80}subscribeSnapShotComposerFocus/u,
    );
    // The timeline scroll keys moved to timelineViewport's registerCommands observer,
    // which only releases live follow; both panes may hear it harmlessly.
    expect(chatView.match(/if \(!splitPane\.focused\) return;/gu)?.length).toBe(3);
    expect(chatView).toContain(
      "usePasteToFocusComposer(splitPane.focused && !embedded ? activeThreadId : null, composerRef);",
    );
    // The focus primitive itself stays ungated: a pane's own controls use it.
    expect(chatView).toMatch(
      /const focusComposer = \(\) => \{\s*composerRef\.current\?\.focusAtEnd\(\);/u,
    );
    // Global singletons and broadcasts: the PR-link dialog and palette find.
    expect(chatView).toContain(
      "{splitPane.focused && !embedded ? <LinkPullRequestDialogHost /> : null}",
    );
    // Upstream replaced the find broadcast with openThreadFind(threadKey) on the
    // palette's active thread, which is the focused pane's; nothing to gate.
    expect(threadFind).not.toContain("subscribeThreadFindOpen");
    // One rule for every fork hook with a window listener: focused, and not behind Settings or Usage.
    expect(readSibling("../custom/splitThreads/splitPaneContext.ts")).toContain(
      "return useSplitPane().focused && !use(BackgroundThreadContext);",
    );
    expect(dictation).toContain("const ownsInput = useOwnsGlobalInput();");
    expect(dictation).toMatch(/if \(!ownsInput\) return;\s*return registerForkDictationTarget\(/u);
    // A recording left running in a pane that loses focus finishes there.
    expect(dictation).toContain(
      "if (!ownsInput) latest.current.dictation.settleWithoutControls();",
    );
    expect(dictation).toMatch(
      /settleWithoutControls: \(\) => \{\s*if \(state\.phase === "recording"\) void speech\.stop\(\);/u,
    );
    // Each slot owns its ChatView's composer ref; the palette reads the focused one.
    expect(panes).toMatch(/ComposerHandleContext value=\{props\.composerRef\}/u);
    expect(panes).toContain('Object.defineProperty(paletteComposerRef, "current"');
    // Workspace focus recovery looks areas up by name. Without this, a dictation freezing the
    // focused editor recovered into the other pane's composer, and the route followed it.
    expect(panes).toContain('data-workspace-unavailable={state.focused ? undefined : "true"}');
    // So docking a window that owns input hands it the route, or its panel never gets focus.
    expect(panes).toMatch(
      /pair\(focusedRef, floatingRef\);\s*if \(floatOwnsInput && floatRoute !== null\)\s*void navigateToPane\(navigate, floatingRef, floatRoute\);/u,
    );
    // The panel's focus request lands only because it retries when the docked pane's marker clears.
    expect(readSibling("../lib/workspaceFocus.ts")).toContain(
      'attributeFilter: ["inert", "aria-hidden", "data-workspace-unavailable"]',
    );
    // Children with their own window listeners: the stash shortcut and the
    // pending question's digit answers.
    expect(composerStash).toMatch(
      /fork:begin fork-split-threads[\s\S]*?if \(!ownsGlobalInput\) return;[\s\S]*?composer\.stash/u,
    );
    expect(questionCard).toContain(
      "if (!activeQuestion || responseDisabled || !ownsInput) return;",
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
