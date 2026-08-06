import type { ScopedThreadRef } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

import { designModeBridge } from "../designModeBridge";
import { useCanvasViewportHandoff } from "./useCanvasViewportHandoff";
import { CanvasIcon, ZoomFitIcon, ZoomInIcon, ZoomOutIcon } from "./PanelIcons";
import { ScreenSizeMenu } from "./ScreenSizeMenu";

/** The canvas strip: a Figma-frame toggle that hands the page to the guest's vendored
 * CanvasMode (space-drag pan, cursor-anchored wheel/pinch zoom, the powers-of-2 ladder),
 * then composes the screen-size picker and the discrete zoom verbs beside the settled zoom
 * readout while it's on. */
export function CanvasControls({
  runtimeTabId,
  threadRef,
  tabId,
  canvas,
}: {
  runtimeTabId: string;
  threadRef: ScopedThreadRef;
  tabId: string | null;
  canvas: { on: boolean; scalePercent: number };
}) {
  // The preview goes full-bleed while canvas owns it and back afterwards. Hung off the
  // canvas-on transition, not this button: canvas also resumes on its own when design mode
  // is toggled back on or the page reloads.
  useCanvasViewportHandoff({ runtimeTabId, threadRef, tabId, canvasOn: canvas.on });

  const zoomButton =
    "flex size-6 items-center justify-center rounded bg-[var(--fork-design-field)] text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5";

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-4">
      <button
        type="button"
        onClick={() => designModeBridge.setCanvas(runtimeTabId, !canvas.on)}
        aria-pressed={canvas.on ? "true" : "false"}
        title={canvas.on ? "Exit canvas (restores page scroll)" : "Canvas — pan and zoom the page"}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded px-1.5 text-xs transition-colors [&_svg]:size-4",
          canvas.on
            ? "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]"
            : "bg-[var(--fork-design-field)] text-muted-foreground hover:text-foreground",
        )}
      >
        <CanvasIcon />
        Canvas
      </button>
      {canvas.on ? (
        <div className="flex items-center gap-1">
          <ScreenSizeMenu
            runtimeTabId={runtimeTabId}
            threadRef={threadRef}
            tabId={tabId}
            triggerClassName={zoomButton}
          />
          <button
            type="button"
            title="Zoom out"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-out")}
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            title="Reset to 100%"
            className="h-6 min-w-10 rounded bg-[var(--fork-design-field)] px-1 text-center font-mono text-[11px] text-foreground"
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-100")}
          >
            {canvas.scalePercent}%
          </button>
          <button
            type="button"
            title="Zoom in"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-in")}
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            title="Zoom to fit"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-fit")}
          >
            <ZoomFitIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
