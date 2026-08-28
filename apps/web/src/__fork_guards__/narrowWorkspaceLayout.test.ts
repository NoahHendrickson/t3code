// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#narrow-workspace-layout`.
 *
 * Every part of this customization fails quietly rather than loudly:
 *
 * - the minimum lives in a shadow that AppSidebarLayout imports *relatively*,
 *   so a sync that renames an export type-checks against upstream and breaks at
 *   runtime (overrides/README.md, "type parity on relative imports");
 * - the overlay is CSS hung off upstream's `data-slot` hooks and its gap
 *   spacer. Rename either and the stylesheet keeps parsing, the app keeps
 *   rendering, and the sidebar quietly goes back to pushing;
 * - the decision is measured, not broken at a viewport width, because the right
 *   panel takes from the same column. Both directions of that are pinned below.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Resolved override-first by the fork:overrides plugin and tsconfig paths, so
// this asserts what the app actually loads, not what the shadow file says.
import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "../overrides/components/threadSidebarWidth";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import {
  resolveOverlayTargets,
  resolvePushedChatColumnWidth,
  shouldOverlaySidebar,
  SIDEBAR_OVERLAY_ATTRIBUTE,
  SIDEBAR_STATE_ATTRIBUTE,
  syncSidebarOverlay,
  type OverlayNode,
} from "../custom/narrowChatOverlay";
import { cssRules } from "./cssRules";

/** A stub of one element: enough to answer `querySelector` and report a width. */
function node(input: {
  matches?: Record<string, OverlayNode | null>;
  width?: number;
  attributes?: Record<string, string>;
}): OverlayNode & { attributes: Record<string, string> } {
  const attributes = { ...input.attributes };
  return {
    attributes,
    clientWidth: input.width ?? 0,
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    querySelector: (selector) => input.matches?.[selector] ?? null,
  };
}

/**
 * The workspace as the thread route actually builds it: nothing, then an inset,
 * then ChatView inside it. Each stage is a separate DOM the watcher has to cope
 * with finding.
 */
function workspaceAtStage(stage: "no-inset" | "no-chat-view" | "ready") {
  const container = node({ width: 256 });
  const chatColumn = node({ width: 222 });
  const chatView = node({
    matches: { "[data-chat-column-maximized-away]": chatColumn },
  });
  const inset = node({
    width: 944,
    matches: {
      "[data-chat-column-maximized-away]": stage === "ready" ? chatColumn : null,
      ":scope > *": stage === "ready" ? chatView : null,
    },
  });
  const wrapper = node({
    attributes: { [SIDEBAR_STATE_ATTRIBUTE]: "expanded" },
    matches: {
      '[data-slot="sidebar-container"]': container,
      '[data-slot="sidebar-inset"]': stage === "no-inset" ? null : inset,
    },
  });
  return {
    wrapper,
    root: { querySelector: (selector: string) => (selector.includes("wrapper") ? wrapper : null) },
  };
}

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const OVERLAYING = `[${SIDEBAR_OVERLAY_ATTRIBUTE}="true"]`;
const rules = cssRules(readSibling("../theme.custom.css"));
const upstreamWidths = readSibling("../components/threadSidebarWidth.ts");
const overrideWidths = readSibling("../overrides/components/threadSidebarWidth.ts");
const sidebar = readSibling("../components/ui/sidebar.tsx");
const layout = readSibling("../components/AppSidebarLayout.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const baseStyles = readSibling("../index.css");

/** Upstream's default panel width — the cost of pushing, in these scenarios. */
const PANEL = 16 * 16;

function normalize(selector: string): string {
  return selector.replace(/\s+/gu, " ").trim();
}

function overlayRule(selectorFragment: string, options?: { readonly without?: string }) {
  const matches = rules.filter((rule) => {
    const selector = normalize(rule.selector);
    return (
      selector.startsWith(MARKER) &&
      selector.includes(OVERLAYING) &&
      selector.includes(selectorFragment) &&
      (options?.without === undefined || !selector.includes(options.without))
    );
  });
  expect(matches.length).toBe(1);
  return matches[0];
}

describe("fork guard: narrow-workspace-layout", () => {
  it("gives the chat column one minimum width, below upstream's reserve", () => {
    const upstream = /THREAD_MAIN_CONTENT_MIN_WIDTH = (\d+) \* (\d+)/u.exec(upstreamWidths);
    expect(upstream).not.toBeNull();
    expect(THREAD_MAIN_CONTENT_MIN_WIDTH).toBeLessThan(
      Number(upstream?.[1]) * Number(upstream?.[2]),
    );
    expect(THREAD_MAIN_CONTENT_MIN_WIDTH).toBe(400);
  });

  it("moves the minimum and nothing else", () => {
    // The shadow owns the whole module, so an unrelated value drifting in it
    // is a silent behaviour change nothing else would catch.
    expect(THREAD_SIDEBAR_WIDTH_STORAGE_KEY).toBe("chat_thread_sidebar_width");
    // The default is module-private since upstream #8400; a null stored width on
    // a wide viewport is the one path that surfaces it.
    expect(resolveInitialThreadSidebarWidth(null, 10_000)).toBe(16 * 16);
    expect(THREAD_SIDEBAR_MIN_WIDTH).toBe(13 * 16);
  });

  it("keeps the shadow's exported API identical to upstream's", () => {
    // Relative import sites type-check against upstream, so a missing export
    // here is invisible until it throws in a browser.
    const exportsOf = (source: string) =>
      [...source.matchAll(/export (?:const|function) (\w+)/gu)].map((match) => match[1]).sort();
    expect(exportsOf(overrideWidths)).toEqual(exportsOf(upstreamWidths));
  });

  it("still defends the column against a sidebar drag", () => {
    expect(resolveThreadSidebarMaximumWidth(1200)).toBe(1200 - THREAD_MAIN_CONTENT_MIN_WIDTH);
    expect(resolveInitialThreadSidebarWidth(560, 1200)).toBe(560);
    // Until the window is narrow enough that the sidebar's own 208px minimum
    // takes over — upstream behaviour the smaller minimum only pushes further
    // down.
    expect(resolveThreadSidebarMaximumWidth(560)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("leaves a merely narrow window alone", () => {
    // The reported regression: a ~945px window with no right panel leaves the
    // column 689px when the sidebar pushes. Nothing about that needs an
    // overlay, and a viewport breakpoint could not tell.
    expect(
      shouldOverlaySidebar({
        chatColumnWidth: 945 - PANEL,
        sidebarWidth: PANEL,
        sidebarOccupiesLayout: true,
      }),
    ).toBe(false);
  });

  it("overlays on a wide window whose column the right panel has taken", () => {
    // The other reported case: 1216px window, ~740px preview panel open, so the
    // column is ~220px while the viewport says there is room to spare.
    expect(
      shouldOverlaySidebar({
        chatColumnWidth: 222,
        sidebarWidth: PANEL,
        sidebarOccupiesLayout: true,
      }),
    ).toBe(true);
  });

  it("settles after one flip instead of oscillating", () => {
    // Overlaying hands the column the sidebar's width back. A predicate over
    // the *measured* width would then read above the minimum, push again,
    // measure below it, and overlay again — every frame. Normalising to the
    // pushed width makes both states describe one number.
    const pushed = { chatColumnWidth: 300, sidebarWidth: PANEL, sidebarOccupiesLayout: true };
    const overlaid = {
      chatColumnWidth: 300 + PANEL,
      sidebarWidth: PANEL,
      sidebarOccupiesLayout: false,
    };
    expect(resolvePushedChatColumnWidth(pushed)).toBe(resolvePushedChatColumnWidth(overlaid));
    expect(shouldOverlaySidebar(pushed)).toBe(true);
    expect(shouldOverlaySidebar(overlaid)).toBe(true);
  });

  it("answers for a collapsed sidebar as though it were open", () => {
    // The attribute has to describe what opening the panel *would* do, or the
    // first frame after a toggle is the pushed layout it was meant to avoid.
    expect(
      shouldOverlaySidebar({
        chatColumnWidth: 600,
        sidebarWidth: PANEL,
        sidebarOccupiesLayout: false,
      }),
    ).toBe(true);
  });

  it("keeps resolving while the workspace is still mounting", () => {
    // The regression this shipped with: the thread route renders nothing until
    // its thread ref resolves, then an inset whose ChatView arrives later. A
    // watcher that resolves once and gives up never attaches on a cold window,
    // and the overlay silently never fires again.
    for (const stage of ["no-inset", "no-chat-view", "ready"] as const) {
      const targets = resolveOverlayTargets(workspaceAtStage(stage).root);
      expect(targets).not.toBeNull();
      expect(targets?.container.clientWidth).toBe(256);
    }

    // And the parts it watches for appear stage by stage, so each one has
    // something to notice the next by.
    expect(resolveOverlayTargets(workspaceAtStage("no-inset").root)?.inset).toBeNull();
    expect(resolveOverlayTargets(workspaceAtStage("no-chat-view").root)?.workspace).toBeNull();
    expect(resolveOverlayTargets(workspaceAtStage("ready").root)?.workspace).not.toBeNull();
  });

  it("measures the column once ChatView is there, not the inset it stood in for", () => {
    // Standing in for the column while the workspace mounts is what makes the
    // stall invisible: the inset is the column *plus* the right panel, so it
    // reads wide enough to decline an overlay the column needs.
    const early = workspaceAtStage("no-chat-view");
    expect(syncSidebarOverlay(resolveOverlayTargets(early.root)!)).toBe(false);

    const ready = workspaceAtStage("ready");
    expect(syncSidebarOverlay(resolveOverlayTargets(ready.root)!)).toBe(true);
    expect(ready.wrapper.attributes[SIDEBAR_OVERLAY_ATTRIBUTE]).toBe("true");
  });

  it("watches structure shallowly enough to ignore the chat's own churn", () => {
    // `subtree` here would put a MutationObserver over streaming messages and
    // every composer keystroke. The three watched nodes are each one level up
    // from what they are waiting for.
    const source = readSibling("../custom/narrowChatOverlay.ts");
    expect(source).toContain("{ childList: true }");
    // The option, not the word — the prose above the call names it too.
    expect(source).not.toMatch(/subtree\s*:/u);
  });

  it("zeroes the gap spacer while the panel floats", () => {
    // The spacer is the only thing that pushes; the panel itself is fixed.
    expect(overlayRule('[data-slot="sidebar-gap"]')?.body).toMatch(/width:\s*0\s*;/u);
  });

  it("out-stacks the minimap without swallowing the inline lightbox", () => {
    // The panel has to clear the timeline minimap, which is left-anchored and
    // overlaps it. It must NOT clear the expanded-image lightbox: that one
    // renders inline inside the inset rather than through a portal, so a panel
    // above it covers the backdrop, the previous-image button and the
    // click-to-close target with opaque chrome.
    //
    // Both bounds are read from the source, so upstream re-tuning either one
    // fails here instead of silently inverting the sandwich. Isolating the
    // inset is the tempting shortcut and is what this replaced — it traps the
    // lightbox by definition, so it is pinned out.
    const zIndexIn = (source: string, anchor: string) => {
      const line = source.split("\n").find((candidate) => candidate.includes(anchor)) ?? "";
      return Number(/\bz-(\d+)\b/u.exec(line)?.[1]);
    };
    const minimap = zIndexIn(
      readSibling("../components/chat/MessagesTimeline.tsx"),
      "group/minimap",
    );
    const lightbox = zIndexIn(
      readSibling("../components/chat/ExpandedImageDialog.tsx"),
      "fixed inset-0",
    );
    const panel = overlayRule('[data-slot="sidebar-container"]', {
      without: '[data-state="expanded"]',
    });
    const panelZIndex = Number(/z-index:\s*(\d+)/u.exec(panel?.body ?? "")?.[1]);

    expect(minimap).toBe(40);
    expect(lightbox).toBe(50);
    expect(panelZIndex).toBeGreaterThan(minimap);
    expect(panelZIndex).toBeLessThan(lightbox);
    // Declarations only — the prose above the rule names the shortcut it rules out.
    expect(rules.some((rule) => /isolation:\s*isolate/u.test(rule.body))).toBe(false);
  });

  it("hands the title bar strip to the panel while it floats", () => {
    // Draggable regions ignore stacking: the workspace's drag strip is later in
    // the DOM, so while the panel floats over it, it overrides the panel's own
    // no-drag rects and swallows the press that should collapse the sidebar.
    const released = overlayRule('[data-slot="sidebar-inset"] .drag-region');
    expect(released?.body).toMatch(/-webkit-app-region:\s*no-drag\s*;/u);
    // The class it releases, and the two owners that claim it under the panel.
    expect(baseStyles).toContain("-webkit-app-region: drag;");
    // Upstream #7153 moved the strip out of ChatView into the shared header.
    const pageHeader = readSibling("../components/WorkspacePageHeader.tsx");
    expect(pageHeader).toContain('electron && "drag-region"');
    expect(chatView).toContain("<WorkspacePageHeader");
  });

  it("shows the floating layer's shadow only while the panel is open", () => {
    // A collapsed panel parks at left:-width with its right edge on x=0, so an
    // unconditional shadow bleeds across the chat column.
    const container = overlayRule('[data-state="expanded"]');
    expect(container?.body).toMatch(/box-shadow:/u);
    expect(normalize(container?.selector ?? "")).toMatch(/\[data-slot="sidebar-container"\]$/u);
  });

  it("decides from the column rather than the viewport", () => {
    // A media query here would be the bug this replaced: it cannot see the
    // right panel, which takes from the same column.
    const overlayRules = rules.filter((rule) => normalize(rule.selector).includes(OVERLAYING));
    expect(overlayRules.length).toBeGreaterThan(0);
    for (const rule of overlayRules) {
      expect(rule.atRules).toEqual([]);
    }
  });

  it("still selects hooks upstream renders", () => {
    for (const slot of ["sidebar-wrapper", "sidebar-gap", "sidebar-inset", "sidebar-container"]) {
      expect(sidebar).toContain(`data-slot="${slot}"`);
    }
    // The state the decision reads for "is the panel taking layout space", and
    // the column it measures.
    expect(sidebar).toContain("data-sidebar-state={state}");
    expect(chatView).toContain("data-chat-column-maximized-away");
  });

  it("keeps the measurement mounted and keyed to the route", () => {
    expect(layout).toContain("useSidebarOverlayOnNarrowChat(pathname)");
    expect(layout).toContain("wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH");
  });
});
