import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import { readThreadPreviewState } from "~/previewStateStore";

import { handOverPreviewToCanvas, restorePreviewViewport } from "./canvasResolutions";

/**
 * Keeps the preview viewport in step with canvas mode being on.
 *
 * Hung off the TRANSITION rather than the toggle's click handler, because canvas mode also
 * turns on without the button: `CanvasSession.resume()` re-applies the artboard from the
 * guest's persisted preference whenever design mode goes off→on or the page reloads. A
 * device viewport set while design mode was off would otherwise letterbox the resumed
 * canvas — exactly the state handing the preview over exists to prevent.
 *
 * A frame this panel's own picker applied is left alone on the way in: resuming into the
 * screen you were previewing is the point. `handOverPreviewToCanvas` makes that distinction
 * (and no-ops when the preview is already full-bleed).
 *
 * Everything it reads is read imperatively. The strip has no reason to re-render on viewport
 * or pane changes, and only these two moments need the values.
 */
export function useCanvasViewportHandoff(options: {
  readonly runtimeTabId: string;
  readonly threadRef: ScopedThreadRef;
  readonly tabId: string | null;
  readonly canvasOn: boolean;
}): void {
  const { runtimeTabId, threadRef, tabId, canvasOn } = options;
  // Undefined until the first observation, so a mount that ALREADY has canvas on (the resume
  // path) counts as a turn-on rather than being skipped as "no change".
  const previous = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const was = previous.current;
    previous.current = canvasOn;
    if (was === canvasOn) return;
    const paneRect = useBrowserSurfaceStore.getState().byTabId[runtimeTabId]?.rect ?? null;
    if (canvasOn) {
      handOverPreviewToCanvas(runtimeTabId, threadRef, tabId);
      return;
    }
    // Nothing to put back before the first observation — there was no turn-on to undo.
    if (was === undefined) return;
    const applied = tabId ? readThreadPreviewState(threadRef).sessions[tabId]?.viewport : undefined;
    if (applied) restorePreviewViewport(runtimeTabId, applied, paneRect);
  }, [canvasOn, runtimeTabId, tabId, threadRef]);
}
