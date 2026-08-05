import { create } from "zustand";

import type {
  DesignModeColorToken,
  DesignModeElementSnapshot,
  DesignModeLayerNode,
  DesignModeSourceMode,
} from "./protocol";

export interface DesignModeTokens {
  readonly colors: readonly DesignModeColorToken[];
  readonly spacingBasePx: number | null;
}

/** Per-preview-tab design-mode state, keyed by runtimeTabId (the globally-unique id the
 * browser layer already uses — server tab ids are only unique per server process). Lives in
 * a module store rather than component state because the webview element (and the engine
 * injected into its guest) outlives PreviewView mounts: switching threads and back must not
 * forget that a tab has Design mode on. Selection and draft count are pushed here by the
 * console-message bridge (ForkPreviewDesignMode) and read by the native panel. */
export interface DesignModeTabState {
  readonly enabled: boolean;
  /** How the engine maps elements to source on this page (protocol.ts
   * DesignModeSourceMode) — null until the engine's ready message reports it. Every mode
   * stays fully editable; `selector-only` gets a soft note in the panel's empty state. */
  readonly sourceMode: DesignModeSourceMode | null;
  readonly selection: readonly DesignModeElementSnapshot[];
  readonly draftCount: number;
  /** Host-side compare toggle state (the guest holds the actual before/after rendering). */
  readonly comparing: boolean;
  /** The previewed app's theme tokens — null until the engine's tokens message lands. */
  readonly tokens: DesignModeTokens | null;
  /** The curated layers tree — null until the engine's first layers message. */
  readonly layers: {
    readonly roots: readonly DesignModeLayerNode[];
    readonly truncated: boolean;
  } | null;
}

interface DesignModeStoreState {
  readonly byTabId: Record<string, DesignModeTabState>;
  readonly setEnabled: (runtimeTabId: string, enabled: boolean) => void;
  readonly setSourceMode: (runtimeTabId: string, sourceMode: DesignModeSourceMode) => void;
  readonly setSelection: (
    runtimeTabId: string,
    selection: readonly DesignModeElementSnapshot[],
  ) => void;
  readonly setDraftCount: (runtimeTabId: string, draftCount: number) => void;
  readonly setComparing: (runtimeTabId: string, comparing: boolean) => void;
  readonly setTokens: (runtimeTabId: string, tokens: DesignModeTokens) => void;
  readonly setLayers: (
    runtimeTabId: string,
    layers: NonNullable<DesignModeTabState["layers"]>,
  ) => void;
  readonly remove: (runtimeTabId: string) => void;
}

const EMPTY_TAB_STATE: DesignModeTabState = {
  enabled: false,
  sourceMode: null,
  selection: [],
  draftCount: 0,
  comparing: false,
  tokens: null,
  layers: null,
};

const patchTab = (
  state: DesignModeStoreState,
  runtimeTabId: string,
  patch: Partial<DesignModeTabState>,
) => {
  const current = state.byTabId[runtimeTabId] ?? EMPTY_TAB_STATE;
  return { byTabId: { ...state.byTabId, [runtimeTabId]: { ...current, ...patch } } };
};

export const useDesignModeStore = create<DesignModeStoreState>()((set) => ({
  byTabId: {},
  setEnabled: (runtimeTabId, enabled) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId] ?? EMPTY_TAB_STATE;
      if (current.enabled === enabled) return state;
      // Toggling off keeps drafts alive in the guest but the panel's world view resets
      // symmetrically — selection, layers AND tokens; the engine re-emits all three on
      // the next activation, so nothing stale can survive tab reuse or navigations.
      return patchTab(state, runtimeTabId, {
        enabled,
        selection: [],
        comparing: false,
        layers: null,
        tokens: null,
      });
    }),
  setSourceMode: (runtimeTabId, sourceMode) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId] ?? EMPTY_TAB_STATE;
      if (current.sourceMode === sourceMode) return state;
      return patchTab(state, runtimeTabId, { sourceMode });
    }),
  setSelection: (runtimeTabId, selection) =>
    set((state) => patchTab(state, runtimeTabId, { selection })),
  setDraftCount: (runtimeTabId, draftCount) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId] ?? EMPTY_TAB_STATE;
      if (current.draftCount === draftCount) return state;
      return patchTab(state, runtimeTabId, { draftCount });
    }),
  setComparing: (runtimeTabId, comparing) =>
    set((state) => patchTab(state, runtimeTabId, { comparing })),
  setTokens: (runtimeTabId, tokens) => set((state) => patchTab(state, runtimeTabId, { tokens })),
  setLayers: (runtimeTabId, layers) => set((state) => patchTab(state, runtimeTabId, { layers })),
  remove: (runtimeTabId) =>
    set((state) => {
      if (!(runtimeTabId in state.byTabId)) return state;
      const { [runtimeTabId]: _removed, ...rest } = state.byTabId;
      return { byTabId: rest };
    }),
}));

export function selectDesignModeTab(
  byTabId: Record<string, DesignModeTabState>,
  runtimeTabId: string | null,
): DesignModeTabState {
  return (runtimeTabId ? byTabId[runtimeTabId] : undefined) ?? EMPTY_TAB_STATE;
}
