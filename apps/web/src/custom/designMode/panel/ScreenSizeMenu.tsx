import { FILL_PREVIEW_VIEWPORT, type ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect, useRef } from "react";

import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { useThreadPreviewState } from "~/previewStateStore";

import {
  CANVAS_RESOLUTIONS,
  commitCanvasViewport,
  resolutionForViewport,
  viewportAtTrueSize,
  viewportFillingPane,
} from "./canvasResolutions";
import { ScreenSizeIcon } from "./PanelIcons";

/** Read outside the subscription: the rect object churns per frame during a pane drag, and
 * every consumer here wants it only at the moment it acts. */
const readPaneRect = (runtimeTabId: string) =>
  useBrowserSurfaceStore.getState().byTabId[runtimeTabId]?.rect ?? null;

/** Module-private: a non-component export here would cost this file React Fast Refresh,
 * and the panel is edited hot. The guard reads the literal from source. */
const TRUE_HEIGHT_STORAGE_KEY = "t3code:fork:design-true-height:v1";

const FILL_VALUE = "fill";

/**
 * The canvas strip's screen-size picker: name a screen instead of dragging the viewport
 * rails to it. Owns everything that decision needs — the applied viewport it reads back to
 * show a checkmark, the True-height preference, and the commit — so the strip beside it
 * stays a composer. See `.fork/customizations.yaml#fork-design-mode`.
 *
 * Reads the viewport itself rather than taking it as a prop: it is the only consumer, and
 * threading preview-surface state through the design panel's contract would teach panel
 * wiring about the browser surface for no local reason.
 */
export function ScreenSizeMenu({
  runtimeTabId,
  threadRef,
  tabId,
  triggerClassName,
}: {
  runtimeTabId: string;
  threadRef: ScopedThreadRef;
  /** The preview tab this panel is docked beside; null before a tab exists. */
  tabId: string | null;
  triggerClassName: string;
}) {
  const previewState = useThreadPreviewState(threadRef);
  const viewport = tabId
    ? (previewState.sessions[tabId]?.viewport ?? FILL_PREVIEW_VIEWPORT)
    : FILL_PREVIEW_VIEWPORT;
  // A primitive, not the rect object: BrowserSurfaceSlot presents a fresh rect per ≥1px
  // change while a pane is dragged, and subscribing to the object re-renders this menu every
  // frame of that drag for a value only the effect below reads.
  const paneKey = useBrowserSurfaceStore((state) => {
    const rect = state.byTabId[runtimeTabId]?.rect;
    return rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : null;
  });
  const paneRect = readPaneRect(runtimeTabId);
  // Off by default: filling the pane is the more useful default for reading a page, and the
  // fold only matters when you go looking for it. Device-local, like the rail's collapse.
  const [trueHeight, setTrueHeight] = useLocalStorage(
    TRUE_HEIGHT_STORAGE_KEY,
    false,
    Schema.Boolean,
  );

  const activeResolution = resolutionForViewport(viewport, paneRect);
  // null, not a sentinel string: a hand-dragged or hand-typed viewport matches no item, and
  // a radio group whose value matches nothing simply shows no check.
  const selectedValue = viewport._tag === "fill" ? FILL_VALUE : (activeResolution?.id ?? null);

  const viewportFor = (resolution: (typeof CANVAS_RESOLUTIONS)[number], atTrueHeight: boolean) =>
    atTrueHeight ? viewportAtTrueSize(resolution) : viewportFillingPane(resolution, paneRect);

  const selectResolution = (value: string) => {
    const resolution = CANVAS_RESOLUTIONS.find((candidate) => candidate.id === value);
    commitCanvasViewport(
      runtimeTabId,
      resolution ? viewportFor(resolution, trueHeight) : FILL_PREVIEW_VIEWPORT,
    );
  };

  // A derived height only fills the pane the pane it was derived FROM. Collapsing the layers
  // rail or resizing the window would otherwise letterbox the frame the picker just promised
  // would fill — so re-derive when the PANE changes, keyed off its own size rather than the
  // viewport's, which is what keeps a hand-drag on upstream's rails from being snapped back.
  const lastPaneKey = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastPaneKey.current;
    lastPaneKey.current = paneKey;
    if (previous === null || previous === paneKey) return;
    if (!activeResolution || trueHeight) return;
    // Trailing: a window drag fires this per frame, and each commit is a server round-trip.
    // The same gesture-end idiom upstream's own rail drag uses.
    const timer = setTimeout(() => {
      const next = viewportFillingPane(activeResolution, readPaneRect(runtimeTabId));
      if (viewport._tag === "freeform" && next.height === viewport.height) return;
      commitCanvasViewport(runtimeTabId, next);
    }, 300);
    return () => clearTimeout(timer);
  }, [paneKey, activeResolution, trueHeight, viewport, runtimeTabId]);

  const toggleTrueHeight = (next: boolean) => {
    setTrueHeight(next);
    // Re-commit the applied screen at the other height. Without this the switch reads as
    // broken until the next pick — the frame it describes is already on screen.
    if (activeResolution) commitCanvasViewport(runtimeTabId, viewportFor(activeResolution, next));
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label="Screen size"
        title={
          activeResolution
            ? `Screen size — ${activeResolution.label}`
            : "Screen size — fills the preview"
        }
        className={cn(
          triggerClassName,
          activeResolution && "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]",
        )}
      >
        <ScreenSizeIcon />
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" className="min-w-56">
        <MenuRadioGroup
          value={selectedValue}
          onValueChange={(value) => selectResolution(String(value))}
        >
          <MenuRadioItem value={FILL_VALUE} className="min-h-7 py-1 sm:text-xs">
            Fill preview
          </MenuRadioItem>
          {CANVAS_RESOLUTIONS.map((resolution) => (
            <MenuRadioItem
              key={resolution.id}
              value={resolution.id}
              className="min-h-7 py-1 sm:text-xs"
            >
              <span className="flex w-full items-center justify-between gap-4">
                <span>{resolution.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {resolution.width} × {resolution.height}
                </span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuCheckboxItem
          variant="switch"
          closeOnClick={false}
          checked={trueHeight}
          onCheckedChange={toggleTrueHeight}
          title="Frame the screen's real height instead of filling the preview area"
          className="min-h-7 py-1 sm:text-xs"
        >
          True height
        </MenuCheckboxItem>
      </MenuPopup>
    </Menu>
  );
}
