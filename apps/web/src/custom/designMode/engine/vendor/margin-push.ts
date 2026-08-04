import { armPageTransition } from './motion'

export type PushSide = 'left' | 'right'

/**
 * The page-push mechanism BOTH docks ride (right = properties panel, left = layers panel):
 * an inline margin on <html> shoves the page's content out from under a panel — the
 * VisBug-style trick. The page's own position:fixed elements and 100vw sizing don't shift
 * (viewport-relative; we can't shrink the real viewport like DevTools), which is the
 * accepted trade for a dev tool.
 *
 * Extracted from Dock in the PR #45 review: LeftDock had reproduced the whole
 * saved-margin/active/canvasActive/apply/remove/sync state machine line for line. The
 * disciplines that duplication kept getting right are now stated exactly once:
 *
 * - The page's PRE-EXISTING inline margin is captured on engage and restored VERBATIM on
 *   release. `saved === null` means we have never touched it; `''` means we touched it and
 *   the page had no inline value of its own.
 * - `setCanvasActive` SUSPENDS the push without releasing it: the saved page value is
 *   written back (not `''`), so a page's own inline margin survives a whole canvas session.
 * - Discrete toggles (dock/undock, design-mode enter/exit, layers open/close) tween via
 *   `arm()`; continuous ones (the right dock's width drag) write instantly and call
 *   `cancelTween()` first so a drag never fights an in-flight glide.
 *
 * What this class deliberately does NOT own: everything layered ON TOP of the push — the
 * right Dock's float/resize/persistence and the left dock's open-state prefs. Composition,
 * not parametrization of those.
 */
export class MarginPush {
  private readonly prop: 'marginLeft' | 'marginRight'
  private readonly cssProp: 'margin-left' | 'margin-right'
  /** null = we have not touched the html margin; '' = touched, page had no inline value. */
  private saved: string | null = null
  /** True only between apply() and remove() — the single gate for every margin write, so a
   * release/float/idle state can never be re-painted by a stray write(). */
  private engaged = false
  private canvasActive = false
  /** Last requested width, replayed by suspend/resume so the caller needn't re-supply it. */
  private width = 0
  /** Undoes an in-flight push transition (restoring any pre-existing inline transition
   * verbatim — same restore discipline as `saved`). Non-null only between arm() and its
   * transitionend/timeout. Null when motion is reduced: armPageTransition opts out. */
  private tweenCleanup: (() => void) | null = null

  constructor(side: PushSide) {
    this.prop = side === 'left' ? 'marginLeft' : 'marginRight'
    this.cssProp = side === 'left' ? 'margin-left' : 'margin-right'
  }

  isEngaged(): boolean {
    return this.engaged
  }

  /** Animates the NEXT margin write. The arm/restore/self-clean dance (incl. the
   * transitionend bubbling guard) lives in motion.ts — shared with CanvasMode's zoom tween. */
  arm(): void {
    this.tweenCleanup?.()
    this.tweenCleanup = armPageTransition(document.documentElement, this.cssProp, () => {
      this.tweenCleanup = null
    })
  }

  cancelTween(): void {
    this.tweenCleanup?.()
    this.tweenCleanup = null
  }

  /** Engage the push at `width`px, capturing the page's own inline margin exactly once. */
  apply(width: number): void {
    if (this.saved === null) this.saved = document.documentElement.style[this.prop]
    this.engaged = true
    this.write(width)
  }

  /** Re-paint at `width` — a no-op while released, which is what lets callers route every
   * width change through one function without re-checking their own active/mode flags. */
  write(width: number): void {
    this.width = width
    if (!this.engaged) return
    document.documentElement.style[this.prop] = this.canvasActive
      ? (this.saved ?? '')
      : `${width}px`
  }

  /** Release the push, restoring the page's own margin verbatim. */
  remove(): void {
    if (!this.engaged) return
    this.engaged = false
    if (this.saved !== null) {
      document.documentElement.style[this.prop] = this.saved
      this.saved = null
    }
  }

  /** Canvas mode took/released the page. Suspension must land INSTANTLY (spec §7) — an
   * in-flight push tween would still be gliding when the write below lands, producing a
   * visible fight between the two. While released we only remember the bit: nothing to
   * repaint, and cancelling a tween we aren't about to overwrite would cut short an exit
   * glide that is still running (Dock.exit()'s old field-write did exactly this by hand). */
  setCanvasActive(on: boolean): void {
    if (on === this.canvasActive) return
    this.canvasActive = on
    if (!this.engaged) return
    this.cancelTween()
    this.write(this.width)
  }
}
