import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";
import { create } from "zustand";

import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";
import { layersRailAvailable, useLayersCollapsed } from "./layersCollapsed";

/** The docked properties panel (ForkDesignPanel's `w-[325px]`). */
export const DESIGN_PANEL_WIDTH_PX = 325;
/** The layers rail (ForkLayersTree's `w-52`). */
export const LAYERS_RAIL_WIDTH_PX = 208;
/** The narrowest the preview itself can go before upstream's browser chrome row clips its
 * trailing controls, the design-mode toggle among them (measured at 286px). */
const PREVIEW_MIN_WIDTH_PX = 300;

/** Width the right panel needs to show the design chrome and a usable preview beside it. */
export function designPaneWidth(railShown: boolean): number {
  return DESIGN_PANEL_WIDTH_PX + PREVIEW_MIN_WIDTH_PX + (railShown ? LAYERS_RAIL_WIDTH_PX : 0);
}

interface DesignPanelRoomState {
  /** Thread key → preview tab → the width that tab's design chrome needs. */
  readonly byThreadKey: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly setRoom: (threadKey: string, tabId: string, width: number | null) => void;
}

/**
 * The room design mode asks of the right panel. A thread can mount several preview tabs at
 * once with only one visible, so each tab publishes its own need and the thread's minimum
 * is the largest: a hidden tab that writes nothing can never clear the visible one's.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export const useDesignPanelRoomStore = create<DesignPanelRoomState>()((set) => ({
  byThreadKey: {},
  setRoom: (threadKey, tabId, width) =>
    set((state) => {
      const tabs = state.byThreadKey[threadKey] ?? {};
      if ((tabs[tabId] ?? null) === width) return state;
      const { [tabId]: _previous, ...rest } = tabs;
      const next = width === null ? rest : { ...rest, [tabId]: width };
      const { [threadKey]: _thread, ...others } = state.byThreadKey;
      return {
        byThreadKey: Object.keys(next).length === 0 ? others : { ...others, [threadKey]: next },
      };
    }),
}));

/** The minimum width design mode needs from this thread's right panel, if any. ChatView
 * passes it to the panel's width hook: a raised minimum widens the panel at render without
 * touching the width the user dragged to, so clearing it hands that width straight back. */
export function useDesignPanelRoom(threadKey: string | null): number | undefined {
  return useDesignPanelRoomStore((state) => {
    const tabs = threadKey === null ? undefined : state.byThreadKey[threadKey];
    if (!tabs) return undefined;
    const widths = Object.values(tabs);
    return widths.length === 0 ? undefined : Math.max(...widths);
  });
}

/** Publishes this preview tab's need while it is visible with design mode on. Subscribes to
 * one number, not the tab state, so selection and layers traffic never re-render the
 * preview panel that calls it. */
export function usePublishDesignPanelRoom(
  threadRef: ScopedThreadRef,
  runtimeTabId: string | null,
  visible: boolean,
): void {
  const [collapsed] = useLayersCollapsed();
  const width = useDesignModeStore((state) => {
    if (!visible || runtimeTabId === null) return null;
    const tab = selectDesignModeTab(state.byTabId, runtimeTabId);
    if (!tab.enabled) return null;
    return designPaneWidth(!collapsed && layersRailAvailable(tab, runtimeTabId));
  });
  const threadKey = scopedThreadKey(threadRef);
  useEffect(() => {
    if (width === null || runtimeTabId === null) return;
    const { setRoom } = useDesignPanelRoomStore.getState();
    setRoom(threadKey, runtimeTabId, width);
    return () => setRoom(threadKey, runtimeTabId, null);
  }, [threadKey, runtimeTabId, width]);
}
