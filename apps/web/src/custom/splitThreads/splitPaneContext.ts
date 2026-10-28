/**
 * Which split pane a ChatView is in — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Every ChatView reads this. Outside a split it is the one focused pane, so
 * nothing changes. Inside a split, only the focused pane (the route's thread)
 * may answer window-level input. Shortcuts, paste-to-focus, menu actions and
 * dictation listen on the window, and two panes answering would act twice.
 * The floating window is never the focused pane: the route stays on the
 * column's thread while the floating one is typed into.
 */
import { createContext, useContext } from "react";

export interface SplitPaneState {
  /** True while two panes share the column. */
  readonly split: boolean;
  /** This pane holds the route's thread and owns window-level input. */
  readonly focused: boolean;
  /** The left pane, the only one that can sit under the macOS traffic lights. */
  readonly leading: boolean;
  /** The window is wide enough for two panes. */
  readonly canSplit: boolean;
  /** Hands the route to the other pane's thread, so this one can close. A
      no-op from the background pane, whose partner already holds the route. */
  readonly focusPartner: () => Promise<void>;
  /** This pane is the window floating over the column. */
  readonly floating: boolean;
  /** Lifts this pane's thread into the floating window; the column keeps its
      split partner, or goes back to the route's previous thread. Null when
      there is nothing to put behind it or the window is too narrow. */
  readonly float: (() => void) | null;
  /** Lands the floating window beside the column's thread as a split. */
  readonly dock: (() => void) | null;
}

export const SINGLE_PANE: SplitPaneState = {
  split: false,
  focused: true,
  leading: true,
  canSplit: false,
  focusPartner: async () => {},
  floating: false,
  float: null,
  dock: null,
};

export const SplitPaneContext = createContext<SplitPaneState>(SINGLE_PANE);

export function useSplitPane(): SplitPaneState {
  return useContext(SplitPaneContext);
}
