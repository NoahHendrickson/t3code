import { designModeBridge } from "./designModeBridge";
import { useDesignModeStore } from "./designModeStore";
import { useDesignSentPreviews } from "./designSentPreviews";
import { designUndoHistory } from "./designUndoHistory";

/**
 * Everything design mode keeps for one preview tab, released in one call.
 *
 * The only caller is `browser/desktopTabLifetime.ts`'s close path — the one place that knows a
 * preview tab is CLOSED rather than merely unmounted, which every other part of this feature is
 * built to survive. That insight belongs in the lease; the *list* of what design mode holds does
 * not. Keeping the list here means the fenced hunk in that shared file stays one call and does
 * not have to learn this feature's memory layout, and the next per-tab memo is added here rather
 * than as another line in an upstream file (Cursor review, PR #74).
 *
 * Everything released is host-side and in-memory. The guest engine and its drafts die with the
 * webview on their own; nothing here touches the page, and nothing here can fail.
 */
export function disposeDesignModeTab(runtimeTabId: string): void {
  useDesignModeStore.getState().remove(runtimeTabId);
  useDesignSentPreviews.getState().forget(runtimeTabId);
  designUndoHistory.clear(runtimeTabId);
  designModeBridge.forgetTab(runtimeTabId);
}
