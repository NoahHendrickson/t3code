import {
  FILL_PREVIEW_VIEWPORT,
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
  type PreviewViewportSetting,
} from "@t3tools/contracts";

/** The strategies below always produce a sized frame, never `fill` — saying so in the type
 * keeps callers (and the guard) from carrying an impossible branch. */
type FramedViewport = Extract<PreviewViewportSetting, { readonly _tag: "freeform" }>;
import type { ScopedThreadRef } from "@t3tools/contracts";

import {
  BrowserViewportCommitTimeoutError,
  commitBrowserViewportChange,
} from "~/browser/browserViewportActions";
import { resolveBrowserDeviceViewportArea } from "~/browser/browserViewportLayout";
import { toastManager } from "~/components/ui/toast";
import { readThreadPreviewState } from "~/previewStateStore";

import { designModeBridge } from "../designModeBridge";

/**
 * The canvas's viewport policy: which screens the panel offers, what each one commits, and
 * how a commit is applied. Kept out of the components so the two height strategies are
 * named things a test can call, rather than a boolean threaded through render code.
 */

/**
 * Logical ("looks like") screen sizes in CSS pixels — what the OS hands the page at each
 * display's default scaling, not its native pixel count, so a 14" MacBook is 1512×982 and
 * not 3024×1964.
 *
 * Only the WIDTH is always committed verbatim; the height depends on which strategy below
 * the caller picks.
 */
export const CANVAS_RESOLUTIONS = [
  { id: "macbook-14", label: "MacBook 14″", width: 1512, height: 982 },
  { id: "macbook-16", label: "MacBook 16″", width: 1728, height: 1117 },
  { id: "display-24", label: "24″ display", width: 1920, height: 1080 },
  { id: "display-27", label: "27″ display", width: 2560, height: 1440 },
] as const;

export type CanvasResolution = (typeof CANVAS_RESOLUTIONS)[number];

/**
 * Which screen, if any, the applied viewport came from — what puts the checkmark on a menu
 * row and lights the trigger.
 *
 * Width alone is not enough. 1920 and 2560 are exactly the widths people hand-type, so
 * width-only matching claims viewports this menu never applied — and then the True-height
 * switch, which re-commits whatever is "active", silently discards the height they set. So
 * the height has to be one this menu could have produced for that screen.
 *
 * `freeform` alone is deliberate too: every commit here is freeform, while a `preset`
 * belongs to upstream's device toolbar — and its legacy catalog still carries
 * `desktop-1920x1080`, whose width collides with the 24" entry.
 */
export function resolutionForViewport(
  viewport: PreviewViewportSetting,
  paneRect: { readonly width: number; readonly height: number } | null,
): CanvasResolution | null {
  if (viewport._tag !== "freeform") return null;
  const candidate = CANVAS_RESOLUTIONS.find((entry) => entry.width === viewport.width);
  if (!candidate) return null;
  // ±1px: the pane-derived height is rounded, and the pane can measure a hair differently
  // between the commit and this read.
  const matches = (height: number) => Math.abs(height - viewport.height) <= 1;
  return matches(viewportAtTrueSize(candidate).height) ||
    matches(viewportFillingPane(candidate, paneRect).height)
    ? candidate
    : null;
}

/**
 * Both strategies commit the screen's width verbatim, because that width becomes the
 * guest's real CSS viewport width — media queries, `vw` and breakpoints then answer to the
 * screen being previewed rather than to however wide the preview pane happens to be. A page
 * that hides content below a breakpoint has to see the screen, not the pane.
 *
 * The height is clamped to the contract's bounds either way: an over-area viewport is
 * refused server-side and would reach the user as an error toast rather than a resize.
 */
const framed = (resolution: CanvasResolution, height: number): FramedViewport => ({
  _tag: "freeform",
  width: resolution.width,
  height: Math.max(
    PREVIEW_VIEWPORT_MIN_DIMENSION,
    Math.min(
      Math.min(
        PREVIEW_VIEWPORT_MAX_DIMENSION,
        Math.floor(PREVIEW_VIEWPORT_MAX_AREA / resolution.width),
      ),
      Math.round(height),
    ),
  ),
});

/**
 * The default: a height derived from the measured pane, so the frame's aspect ratio matches
 * it and upstream's fit lands 1:1 on both axes — the frame fills the preview area with no
 * letterbox and you see more of the page at once. The frame is then not the screen's real
 * height, so "what's above the fold" is not meaningful; that is what the other strategy is
 * for. Falls back to the screen's own height when the pane hasn't been measured yet.
 *
 * The widest screens in a tall pane still letterbox, because the derived height runs past
 * the contract's area cap and clamps. An honest letterbox beats a refused resize.
 */
export function viewportFillingPane(
  resolution: CanvasResolution,
  paneRect: { readonly width: number; readonly height: number } | null,
): FramedViewport {
  const area = paneRect ? resolveBrowserDeviceViewportArea(paneRect) : null;
  return framed(
    resolution,
    area && area.width > 0 ? (resolution.width * area.height) / area.width : resolution.height,
  );
}

/** The "True height" switch: the screen's own height, so the frame is a real 1512×982 (or
 * whatever) browser and the fold is honest. A landscape screen in a tall pane letterboxes,
 * which reads as canvas rather than dead space because the surround is painted the same
 * gray. */
export function viewportAtTrueSize(resolution: CanvasResolution): FramedViewport {
  return framed(resolution, resolution.height);
}

/**
 * A rejected resize is usually PreviewView's own — its subscribeBrowserViewportChange
 * handler already toasts and rethrows, so reporting again would double up. The two that
 * never reach that handler are the ones worth surfacing: the 15s commit timeout, and a tab
 * with no visible handler at all. Silently swallowing those makes a hung resize look like a
 * dead button.
 */
function reportCommitFailure(error: unknown): void {
  if (!(error instanceof BrowserViewportCommitTimeoutError)) return;
  toastManager.add({
    type: "error",
    title: "Screen size didn't apply",
    description: "The preview didn't answer in time. Try again, or reload the preview tab.",
  });
}

/**
 * Applies a viewport to the preview tab and re-anchors the artboard on it.
 *
 * The reset matters after a SIZE change: canvas mode keeps the transform it held at the old
 * size, which leaves the page shrunken and off-centre in canvas gray. It is wrong on entry,
 * where the seed transform is deliberately taken from the live scroll — see
 * `handOverPreviewToCanvas`. Only on success either way: a refused resize never moved the
 * window, so neither should the view.
 */
export function commitCanvasViewport(runtimeTabId: string, next: PreviewViewportSetting): void {
  void commitBrowserViewportChange(runtimeTabId, next).then(
    () => designModeBridge.canvasCommand(runtimeTabId, "reset-view"),
    reportCommitFailure,
  );
}

/**
 * The viewport each tab had before canvas mode took the preview full-bleed, so exiting can
 * put it back. Module-level rather than component state on purpose: the lifetime is the
 * canvas session, which outlives the panel's mounts (thread switches, design-mode toggles),
 * and it is exactly how designModeBridge and browserViewportActions already key per-tab
 * state. Entries are dropped on restore, so nothing accumulates past a session.
 */
const viewportBeforeCanvas = new Map<string, PreviewViewportSetting>();

/**
 * Entering canvas mode hands the whole preview area over: a device viewport left from a
 * previous session (or upstream's toolbar) would letterbox the canvas inside itself.
 *
 * No `reset-view` here, unlike a size change. CanvasMode seeds its transform from the live
 * scroll so entry is pixel-identical, and resetting would throw that away — with
 * `html { overflow: hidden }` there is no scrolling back, and it would falsify the toggle's
 * own "restores page scroll" promise, since the exit scroll is computed from this transform.
 */
export function handOverPreviewToCanvas(
  runtimeTabId: string,
  threadRef: ScopedThreadRef,
  tabId: string | null,
): void {
  // Read imperatively: the canvas strip has no reason to re-render on viewport changes, and
  // only this transition needs it.
  const current = tabId
    ? (readThreadPreviewState(threadRef).sessions[tabId]?.viewport ?? FILL_PREVIEW_VIEWPORT)
    : FILL_PREVIEW_VIEWPORT;
  // Already full-bleed: nothing to hand over, and issuing the resize anyway would cost a
  // round-trip for no change.
  if (current._tag === "fill") return;
  viewportBeforeCanvas.set(runtimeTabId, current);
  void commitBrowserViewportChange(runtimeTabId, FILL_PREVIEW_VIEWPORT).catch(reportCommitFailure);
}

/**
 * Leaving canvas mode puts the preview back — the reverse-states rule in CLAUDE.md, in both
 * directions:
 *
 * - a device preset the user set on upstream's toolbar must not be silently consumed by
 *   having visited canvas mode, so it is restored;
 * - a screen picked INSIDE canvas must not outlive it, because the picker that could clear
 *   it renders only while canvas is on — it would strand a letterboxed frame on the plain
 *   preview with no way back short of upstream's toolbar.
 *
 * A viewport that is neither is the user's own doing and is left alone.
 */
export function restorePreviewViewport(
  runtimeTabId: string,
  applied: PreviewViewportSetting,
  paneRect: { readonly width: number; readonly height: number } | null,
): void {
  const previous = viewportBeforeCanvas.get(runtimeTabId);
  viewportBeforeCanvas.delete(runtimeTabId);
  const next =
    previous ?? (resolutionForViewport(applied, paneRect) ? FILL_PREVIEW_VIEWPORT : null);
  if (!next) return;
  void commitBrowserViewportChange(runtimeTabId, next).catch(reportCommitFailure);
}
