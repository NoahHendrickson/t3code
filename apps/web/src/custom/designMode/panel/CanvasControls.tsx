import { cn } from "~/lib/utils";

import { designModeBridge } from "../designModeBridge";
import { CanvasIcon, ZoomFitIcon, ZoomInIcon, ZoomOutIcon } from "./PanelIcons";

/** The canvas strip: a Figma-frame toggle that hands the page to the guest's vendored
 * CanvasMode (space-drag pan, cursor-anchored wheel/pinch zoom, the powers-of-2 ladder),
 * plus discrete zoom verbs and the settled zoom readout while it's on. */
export function CanvasControls({
  runtimeTabId,
  canvas,
}: {
  runtimeTabId: string;
  canvas: { on: boolean; scalePercent: number };
}) {
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
