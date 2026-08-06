import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

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
