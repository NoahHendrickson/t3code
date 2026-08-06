import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import type { DesignModeTabState } from "./designModeStore";

const LAYERS_COLLAPSED_STORAGE_KEY = "t3code:fork:design-layers-collapsed:v1";

/**
 * Whether the design-mode layers rail is collapsed.
 *
 * Shared rather than local to the rail because the control that brings it back lives
 * somewhere else entirely — collapsed, the rail renders nothing at all, and the way back in
 * is a button in the preview chrome row (ForkPreviewLayersToggle). Both read this, and
 * useLocalStorage is useSyncExternalStore-backed, so they cannot disagree.
 *
 * Device-local, like the sidebar's own collapse prefs: a fork-only affordance has no
 * business in a contracts schema upstream owns, which every sync would then carry.
 */
export function useLayersCollapsed(): [boolean, (value: boolean) => void] {
  return useLocalStorage(LAYERS_COLLAPSED_STORAGE_KEY, false, Schema.Boolean);
}

/** Whether there is a rail to show at all. One definition because two components ask: the
 * rail's own gate and the chrome-row control that reopens it. Copies of this predicate had
 * already drifted — the toggle's was missing the `runtimeTabId` half, harmless only because
 * `selectDesignModeTab(null)` happens to answer `enabled: false`. */
export const layersRailAvailable = (
  tab: DesignModeTabState,
  runtimeTabId: string | null,
): boolean => runtimeTabId !== null && tab.enabled && tab.layers !== null;

/** The rail, for `aria-controls` on both halves of the disclosure. */
export const LAYERS_RAIL_ID = "fork-design-layers";

/**
 * Each half of this disclosure unmounts ITSELF on activation — hide is inside the rail, show
 * is in the chrome row — so without this the focused element simply disappears and focus
 * falls to `<body>`, leaving a keyboard user tabbing in from the top of the document. The
 * rest of this rail is careful about focus (roving tabindex, `focusOnRender`, `preventScroll`
 * on the reveal); this closes the one loop that wasn't.
 *
 * After paint, because the counterpart only exists once the state flip has committed.
 */
export function focusLayersControl(selector: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(selector)?.focus();
  });
}

export const LAYERS_HIDE_BUTTON = "[data-fork-design-layers-hide]";
export const LAYERS_SHOW_BUTTON = "[data-fork-design-layers-toggle]";
