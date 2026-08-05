import type { DesignModeCanvasCommand } from "../protocol";
import { CanvasMode, type ViewportRect } from "./vendor/canvas";

/** Trailing debounce for the settled zoom readout — continuous gestures (wheel/pinch/
 * drag) tick every frame; the host only needs the value once per gesture lull. */
const CANVAS_EMIT_DEBOUNCE_MS = 150;

interface CanvasSessionOpts {
  /** Overlay containment — canvas gestures must ignore events on selection chrome. */
  hostContains: (t: EventTarget | null) => boolean;
  /** Current selection's viewport bounding box, for Shift+2 zoom-to-selection. */
  selectionRect: () => ViewportRect | null;
  /** Fires per pan/zoom tick so selection chrome re-measures with the page. */
  onReflow: () => void;
}

/**
 * Owns the canvas subsystem end to end: the vendored Forge CanvasMode (pan/zoom artboard;
 * its listeners exist only while applied — zero idle overhead), the host command dispatch,
 * the debounced settled-zoom emit, and its change gate. HeadlessDesignMode only constructs
 * it with page hooks, exposes scale() to the gesture modules, and calls resume/suspend on
 * activation — the layersSession.ts pattern.
 */
export class CanvasSession {
  onCanvas?: (on: boolean, scalePercent: number) => void;

  private readonly canvas: CanvasMode;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmit = "";

  constructor(opts: CanvasSessionOpts) {
    this.canvas = new CanvasMode({
      // The properties panel is NATIVE T3 chrome, outside the guest page entirely —
      // nothing overlays the viewport, so the fit math gets no panel inset.
      dock: { mode: () => "floating", width: () => 0 },
      onCanvasActive: () => this.emit(),
      hostContains: opts.hostContains,
      // Fires per pan/zoom tick: chrome re-measures through the caller's rAF coalescer,
      // and the (debounced) zoom readout heads to the host.
      onChange: () => {
        opts.onReflow();
        this.scheduleEmit();
      },
      selectionRect: opts.selectionRect,
    });
  }

  /** The live artboard scale for gesture math; 1 whenever the canvas is not applied
   * (CanvasMode keeps its last state after unapply, so isApplied gates the read). */
  scale(): number {
    return this.canvas.isApplied() ? this.canvas.scale() : 1;
  }

  /** Host command — toggles the artboard. All gesture handling lives in CanvasMode. */
  setOn(on: boolean): void {
    this.canvas.setOn(on);
  }

  /** Host command — discrete zoom verbs (panel buttons). No-ops while canvas is off:
   * zooming a page that isn't an artboard would write a transform onto the raw page. */
  run(action: DesignModeCanvasCommand): void {
    if (!this.canvas.isApplied()) return;
    switch (action) {
      case "zoom-in":
        this.canvas.zoomStep(1);
        return;
      case "zoom-out":
        this.canvas.zoomStep(-1);
        return;
      case "zoom-fit":
        this.canvas.zoomToFit();
        return;
      case "zoom-100":
        this.canvas.setZoomCentered(1);
        return;
      default: {
        // Exhaustiveness: a new DesignModeCanvasCommand variant must fail to compile
        // here instead of being silently dropped.
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  }

  /** Design mode turned on — re-enter the artboard if this session had canvas on
   * (CanvasMode's own sessionStorage pref). */
  resume(): void {
    this.canvas.resume();
  }

  /** Design mode turned off — undo every canvas page mutation (transform, artboard
   * chrome, listeners) but keep the preference; the next activation resumes the view. */
  suspend(): void {
    this.canvas.suspend();
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
  }

  /** Change-gated canvas state emit — (on, whole-percent) rarely changes relative to the
   * per-tick onChange stream, so most gesture ticks cost one string compare. */
  private emit(): void {
    const on = this.canvas.isApplied();
    const scalePercent = Math.round(this.scale() * 100);
    const key = `${on}:${scalePercent}`;
    if (key === this.lastEmit) return;
    this.lastEmit = key;
    this.onCanvas?.(on, scalePercent);
  }

  /** Continuous gestures funnel here: trailing debounce so the readout settles once per
   * gesture lull instead of one console line per tick. */
  private scheduleEmit(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit();
    }, CANVAS_EMIT_DEBOUNCE_MS);
  }
}
