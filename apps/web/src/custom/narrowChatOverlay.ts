/**
 * The sidebar floats over the workspace exactly when pushing would take the
 * chat column below its minimum — see
 * `.fork/customizations.yaml#narrow-workspace-layout`.
 *
 * A viewport breakpoint cannot express that. The chat column is not the
 * viewport minus the sidebar: the right panel (preview, diff, files, terminal)
 * sits beside it and takes as much as the user has dragged it to. A 1200px
 * window with a 740px preview open leaves the chat 220px, while a 950px window
 * with no panel leaves it 690px — the narrower window is the one that does not
 * need an overlay. So the decision reads the column itself.
 *
 * Which means finding it, and it is not there when this mounts. The thread
 * route renders nothing until its thread ref resolves, then an inset whose
 * ChatView arrives later still. Resolving once and giving up is how this
 * shipped broken: on a cold window the measurement never attached, and the
 * overlay simply never fired.
 */

import { useEffect } from "react";

import { THREAD_MAIN_CONTENT_MIN_WIDTH } from "../components/threadSidebarWidth";

export const SIDEBAR_OVERLAY_ATTRIBUTE = "data-fork-sidebar-overlay";
export const SIDEBAR_STATE_ATTRIBUTE = "data-sidebar-state";

const WRAPPER_SELECTOR = '[data-slot="sidebar-wrapper"]';
const CONTAINER_SELECTOR = '[data-slot="sidebar-container"]';
const INSET_SELECTOR = '[data-slot="sidebar-inset"]';
const CHAT_COLUMN_SELECTOR = "[data-chat-column-maximized-away]";

/**
 * The slice of `Element` this needs, so the resolution and the decision can be
 * exercised against a stub of each mount stage rather than a live browser.
 * `clientWidth` throughout: `offsetWidth` is not on `Element`, and the 1px the
 * panel's right border costs is nothing against a 400px threshold.
 */
export interface OverlayNode {
  readonly clientWidth: number;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelector(selectors: string): OverlayNode | null;
}

export interface OverlayTargets {
  /** Carries the overlay attribute and upstream's sidebar state. Always mounted. */
  readonly wrapper: OverlayNode;
  /** The panel — what pushing costs the column. */
  readonly container: OverlayNode;
  /** The workspace, once the route has one. */
  readonly inset: OverlayNode | null;
  /** ChatView's row, once the thread has resolved. Watched, never measured. */
  readonly workspace: OverlayNode | null;
  /**
   * The column, or the widest stand-in available while the workspace mounts.
   * Null only before the route renders anything, where there is nothing to
   * decide about yet.
   */
  readonly chatColumn: OverlayNode | null;
}

export interface ChatColumnMetrics {
  /** The chat column's width right now, whatever the sidebar is currently doing. */
  readonly chatColumnWidth: number;
  /** The panel's own width — what pushing costs the column. */
  readonly sidebarWidth: number;
  /** Whether the panel is currently taking layout space from the column. */
  readonly sidebarOccupiesLayout: boolean;
}

/**
 * The width the chat column would have if the sidebar pushed it. Deciding on
 * this rather than on the measured width is what keeps the rule from
 * oscillating: overlaying *gives* the column the sidebar's width back, so a
 * predicate over the measured width would flip, re-measure, and flip again
 * every frame. Normalised this way both states describe the same number, so the
 * predicate answers the same in each and settles after one flip.
 */
export function resolvePushedChatColumnWidth(metrics: ChatColumnMetrics): number {
  return metrics.sidebarOccupiesLayout
    ? metrics.chatColumnWidth
    : metrics.chatColumnWidth - metrics.sidebarWidth;
}

/**
 * The threshold is the same constant that stops a sidebar *drag* from eating
 * the column, so "the chat column's minimum width" means one number no matter
 * which way the space is taken.
 */
export function shouldOverlaySidebar(metrics: ChatColumnMetrics): boolean {
  return resolvePushedChatColumnWidth(metrics) < THREAD_MAIN_CONTENT_MIN_WIDTH;
}

/**
 * Every stage of the workspace's mount, resolved from scratch. Returns null
 * only while the sidebar itself is absent, which cannot happen from inside the
 * layout that renders it.
 */
export function resolveOverlayTargets(
  root: Pick<OverlayNode, "querySelector">,
): OverlayTargets | null {
  const wrapper = root.querySelector(WRAPPER_SELECTOR);
  const container = wrapper?.querySelector(CONTAINER_SELECTOR) ?? null;
  if (!wrapper || !container) return null;

  const inset = wrapper.querySelector(INSET_SELECTOR);
  const chatColumn = inset?.querySelector(CHAT_COLUMN_SELECTOR) ?? inset;
  return {
    wrapper,
    container,
    inset,
    workspace: inset?.querySelector(":scope > *") ?? null,
    chatColumn,
  };
}

/** Writes the decision onto the wrapper. Returns what the attribute now says. */
export function syncSidebarOverlay(targets: OverlayTargets): boolean {
  const overlaying = targets.wrapper.getAttribute(SIDEBAR_OVERLAY_ATTRIBUTE) === "true";
  if (!targets.chatColumn) return overlaying;

  const next = shouldOverlaySidebar({
    chatColumnWidth: targets.chatColumn.clientWidth,
    sidebarWidth: targets.container.clientWidth,
    // Collapsed counts as "not occupying", so the attribute already describes
    // what opening the panel would do before it is opened.
    sidebarOccupiesLayout:
      targets.wrapper.getAttribute(SIDEBAR_STATE_ATTRIBUTE) === "expanded" && !overlaying,
  });

  if (next !== overlaying) {
    targets.wrapper.setAttribute(SIDEBAR_OVERLAY_ATTRIBUTE, next ? "true" : "false");
  }
  return next;
}

function sameNodes(left: readonly Element[], right: readonly Element[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}

/**
 * Drives {@link SIDEBAR_OVERLAY_ATTRIBUTE} on the sidebar wrapper, which is what
 * `theme.custom.css` keys the overlay rules off. Pass the current route so the
 * workspace is re-resolved when one unmounts with it.
 *
 * Written to the DOM rather than held in React state: this runs from a
 * ResizeObserver during a window drag, and re-rendering the whole workspace on
 * every frame of one is exactly the cost this app does not pay.
 */
export function useSidebarOverlayOnNarrowChat(routeKey: string): void {
  useEffect(() => {
    let measured: readonly Element[] = [];
    let watched: readonly Element[] = [];

    const sync = () => {
      const targets = resolveOverlayTargets(document);
      if (!targets) return;

      // Structural watch: the inset appearing under the wrapper, ChatView
      // appearing under the inset, the column and the right panel appearing
      // under ChatView. `childList` without `subtree` on each, so streaming
      // messages and composer keystrokes — both far deeper — are never seen.
      const nextWatched = [targets.wrapper, targets.inset, targets.workspace].filter(
        (node): node is Element => node instanceof Element,
      );
      if (!sameNodes(nextWatched, watched)) {
        mutations.disconnect();
        for (const node of nextWatched) mutations.observe(node, { childList: true });
        watched = nextWatched;
      }

      // Size watch: the column (window resize, sidebar toggle, right-panel
      // drag) and the panel (a sidebar drag changes what pushing would cost
      // without moving the column at all while overlaying).
      const nextMeasured = [targets.chatColumn, targets.container].filter(
        (node): node is Element => node instanceof Element,
      );
      if (!sameNodes(nextMeasured, measured)) {
        // observe() re-notifies for every new target, which re-enters here —
        // hence only on an actual change, so the re-entry finds none and stops.
        sizes.disconnect();
        for (const node of nextMeasured) sizes.observe(node);
        measured = nextMeasured;
      }

      syncSidebarOverlay(targets);
    };

    const sizes = new ResizeObserver(sync);
    const mutations = new MutationObserver(sync);
    sync();

    return () => {
      sizes.disconnect();
      mutations.disconnect();
    };
  }, [routeKey]);
}
