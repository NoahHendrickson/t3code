/**
 * Which split pane a ChatView is in — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Every ChatView reads this. Outside a split it is the one focused pane, so
 * nothing changes. Inside a split, only the focused pane (the route's thread)
 * may answer window-level input. Shortcuts, paste-to-focus, menu actions and
 * dictation listen on the window, and two panes answering would act twice.
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
}

export const SINGLE_PANE: SplitPaneState = {
  split: false,
  focused: true,
  leading: true,
  canSplit: false,
  focusPartner: async () => {},
};

export const SplitPaneContext = createContext<SplitPaneState>(SINGLE_PANE);

export function useSplitPane(): SplitPaneState {
  return useContext(SplitPaneContext);
}
