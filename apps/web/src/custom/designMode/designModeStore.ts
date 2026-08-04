import { create } from "zustand";

import type { DesignModeElementSnapshot } from "./protocol";

/** Per-preview-tab design-mode state, keyed by runtimeTabId (the globally-unique id the
 * browser layer already uses — server tab ids are only unique per server process). Lives in
 * a module store rather than component state because the webview element (and the engine
 * injected into its guest) outlives PreviewView mounts: switching threads and back must not
 * forget that a tab has Design mode on. Selection and draft count are pushed here by the
 * console-message bridge (ForkPreviewDesignMode) and read by the native panel. */
export interface DesignModeTabState {
  readonly enabled: boolean;
  /** Whether the guest page carries forge-mode's `data-dc-source` JSX tags — null until the
   * engine's ready message reports it. Untagged pages get the setup hint. */
  readonly tagged: boolean | null;
  readonly selection: readonly DesignModeElementSnapshot[];
  readonly draftCount: number;
  /** Host-side compare toggle state (the guest holds the actual before/after rendering). */
  readonly comparing: boolean;
}

interface DesignModeStoreState {
  readonly byTabId: Record<string, DesignModeTabState>;
  readonly setEnabled: (runtimeTabId: string, enabled: boolean) => void;
  readonly setTagged: (runtimeTabId: string, tagged: boolean) => void;
  readonly setSelection: (
    runtimeTabId: string,
    selection: readonly DesignModeElementSnapshot[],
  ) => void;
  readonly setDraftCount: (runtimeTabId: string, draftCount: number) => void;
  readonly setComparing: (runtimeTabId: string, comparing: boolean) => void;
  readonly remove: (runtimeTabId: string) => void;
}

const EMPTY_TAB_STATE: DesignModeTabState = {
  enabled: false,
  tagged: null,
  selection: [],
  draftCount: 0,
  comparing: false,
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
      // Toggling off keeps drafts alive in the guest but the panel's world view resets;
      // a fresh selection message rebuilds it on the next activation.
      return patchTab(state, runtimeTabId, { enabled, selection: [], comparing: false });
    }),
  setTagged: (runtimeTabId, tagged) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId] ?? EMPTY_TAB_STATE;
      if (current.tagged === tagged) return state;
      return patchTab(state, runtimeTabId, { tagged });
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
