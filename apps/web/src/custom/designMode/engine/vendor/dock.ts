export type PanelMode = 'docked' | 'floating'

export interface PanelPrefs {
  width: number
  mode: PanelMode
}

export const MIN_WIDTH = 280
export const MAX_WIDTH = 560
export const DEFAULT_WIDTH = 320
export const STORAGE_KEY = 'the-forge:panel'

/**
 * Clamp order matters: MIN is applied LAST so it wins over the 50vw viewport cap on
 * tiny windows — an under-min panel is unusable, while a page squeezed below 50% is
 * merely cramped (user-ratified: min 280 = the pre-dock fixed width, so every existing
 * clip fix keeps holding).
 */
export function clampWidth(width: number, viewportWidth: number): number {
  const max = Math.min(MAX_WIDTH, Math.floor(viewportWidth * 0.5))
  return Math.max(MIN_WIDTH, Math.min(width, max))
}

export function loadPrefs(): PanelPrefs {
  // Every return path clamps — an unclamped DEFAULT on a very narrow first-run/error
  // viewport would seed the dock wider than the 50vw/MIN policy allows (Bugbot, PR #2).
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { width: clampWidth(DEFAULT_WIDTH, window.innerWidth), mode: 'docked' }
    // unknown + manual checks at the I/O boundary — project convention, no schema libs.
    const parsed: unknown = JSON.parse(raw)
    const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
      width?: unknown
      mode?: unknown
    }
    const width =
      typeof obj.width === 'number' && Number.isFinite(obj.width) ? obj.width : DEFAULT_WIDTH
    const mode: PanelMode = obj.mode === 'floating' ? 'floating' : 'docked'
    return { width: clampWidth(width, window.innerWidth), mode }
  } catch {
    // Storage disabled (some privacy modes throw) or corrupt JSON — defaults, never crash.
    return { width: clampWidth(DEFAULT_WIDTH, window.innerWidth), mode: 'docked' }
  }
}

export function savePrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Persistence is a nicety — a full/blocked storage must never break an edit session.
  }
}

import type { Panel } from './panel'
import { MarginPush } from './margin-push'

/**
 * Owns the docked-vs-floating layout state of the panel. "Docked" pushes the page
 * content left via MarginPush (margin-push.ts), which owns the html-margin mechanism
 * itself — the saved-verbatim discipline, the canvas suspension, and the tween — shared
 * with the layers panel's LeftDock below. Everything here rides ON TOP of that push:
 * float/dock mode, the width drag, persistence, and the status-node reparenting.
 */
export class Dock {
  private prefs: PanelPrefs
  /** The html margin-right push. Engaged only between applyDocked() and removeDocked(),
   * which is also this class's "is the dock applied" truth: exit()/mode-switches must only
   * undo what was actually applied (a floating-mode exit() re-appending #status to the
   * shadow root would needlessly reorder DOM it never touched). */
  private push = new MarginPush('right')
  private active = false

  constructor(
    private host: HTMLElement,
    private panel: Panel,
    private status: HTMLElement,
    private toggle: HTMLElement
  ) {
    this.prefs = loadPrefs()
    // Seed the width var at boot — pure inline style, no listeners, zero idle overhead.
    // (syncWidth is the ONLY width painter; inactive here, so it writes just the var.)
    this.syncWidth()
    // Element-scoped listeners on our own shadow DOM (same pattern as Overlay's toggle
    // click) — the document/window-level drag listeners exist only during a drag.
    this.panel.resizeHandle.addEventListener('pointerdown', this.onResizeStart)
    this.panel.modeButton.addEventListener('click', () => {
      this.setMode(this.prefs.mode === 'docked' ? 'floating' : 'docked')
    })
    this.syncModeButton()
  }

  mode(): PanelMode {
    return this.prefs.mode
  }

  width(): number {
    return this.prefs.width
  }

  /** Design mode turned on. */
  enter(): void {
    this.active = true
    if (this.prefs.mode === 'docked') this.applyDocked()
    window.addEventListener('resize', this.onWindowResize)
  }

  /** Design mode turned off — every page mutation is undone here. */
  exit(): void {
    this.active = false
    window.removeEventListener('resize', this.onWindowResize)
    this.removeDocked()
    // A feature flag that outlives exit() forces ordering contracts on callers (the old
    // contract: canvas.suspend() had to run BEFORE dock.exit() or the next enter() would
    // silently inherit a stale suspended margin). removeDocked() above already restored the
    // margin verbatim and released the push, so this clears the flag WITHOUT repainting or
    // cutting short the exit glide — it just means the next enter() always starts from a
    // clean, non-suspended push (2026-07-11 review).
    this.push.setCanvasActive(false)
  }

  setMode(mode: PanelMode): void {
    if (mode === this.prefs.mode) return
    this.prefs = { ...this.prefs, mode }
    savePrefs(this.prefs)
    this.syncModeButton()
    if (!this.active) return
    if (mode === 'docked') this.applyDocked()
    else this.removeDocked()
  }

  setCanvasActive(on: boolean): void {
    this.push.setCanvasActive(on)
  }

  /** The width actually painted/pushed: the stored DESIRED width, clamped against the
   * LIVE viewport. Kept separate from prefs.width so a transient window shrink never
   * destroys the user's wider choice (PR #2 final review). */
  private appliedWidth(): number {
    return clampWidth(this.prefs.width, window.innerWidth)
  }

  /** Re-paints the width var (and, when the push is engaged, the html margin) from
   * appliedWidth(). MarginPush.write() is a no-op while released, so this stays the single
   * place that derives appliedWidth() and paints both — they can never desync (PR #2 review). */
  private syncWidth(): void {
    const width = this.appliedWidth()
    this.host.style.setProperty('--forge-dock-w', `${width}px`)
    this.push.write(width)
  }

  private applyDocked(): void {
    // Tween the NEXT margin write — dock/undock/design-mode-enter are the discrete toggles;
    // width-drag writes stay instant and onResizeStart force-clears any in-flight arm.
    this.push.arm()
    this.panel.setDocked(true)
    // Same DOM node moves — ids, listeners, and updateStatus() lookups all survive.
    this.panel.footer.appendChild(this.status)
    this.toggle.classList.add('dock-open')
    this.push.apply(this.appliedWidth())
    // Then route through syncWidth, so the var and the margin come from ONE derivation.
    this.syncWidth()
  }

  private removeDocked(): void {
    if (!this.push.isEngaged()) return
    this.push.arm()
    this.panel.setDocked(false)
    this.host.shadowRoot!.appendChild(this.status)
    this.toggle.classList.remove('dock-open')
    this.push.remove()
  }

  private applyWidth(width: number): void {
    this.prefs = { ...this.prefs, width }
    this.syncWidth()
  }

  private onWindowResize = (): void => {
    // Apply-only: repaint the clamped width but leave prefs/storage untouched, so
    // growing the window back restores the user's desired width.
    this.syncWidth()
  }

  private onResizeStart = (e: PointerEvent): void => {
    if (e.button !== 0) return // primary button only — a right-click must not start a drag
    this.push.cancelTween() // a width drag must write margins instantly from its first move
    e.preventDefault()
    const startX = e.clientX
    const startWidth = this.prefs.width
    // Window-level move/up listeners live only for the duration of the drag. No
    // setPointerCapture — jsdom doesn't implement it, and window listeners cover
    // the pointer leaving the handle anyway. pointercancel (touch scroll takeover,
    // OS gesture) tears down exactly like pointerup so no move listener leaks.
    const onMove = (ev: PointerEvent): void => {
      // Panel is on the RIGHT: dragging the handle LEFT (clientX decreases) widens.
      this.applyWidth(clampWidth(startWidth + (startX - ev.clientX), window.innerWidth))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      savePrefs(this.prefs)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  private syncModeButton(): void {
    const docked = this.prefs.mode === 'docked'
    this.panel.modeButton.textContent = docked ? '⇱' : '⇥'
    this.panel.modeButton.title = docked ? 'Float panel' : 'Dock panel'
  }
}

export const LAYERS_WIDTH = 240
export const LAYERS_STORAGE_KEY = 'the-forge:layers'

export interface LayersPrefs {
  open: boolean
}

export function loadLayersPrefs(): LayersPrefs {
  try {
    const raw = localStorage.getItem(LAYERS_STORAGE_KEY)
    if (!raw) return { open: true } // the tree is the pivot's centerpiece — open by default
    const parsed: unknown = JSON.parse(raw)
    const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as { open?: unknown }
    return { open: obj.open !== false }
  } catch {
    return { open: true }
  }
}

export function saveLayersPrefs(prefs: LayersPrefs): void {
  try {
    localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // persistence is a nicety — never break the session over storage (same rule as savePrefs)
  }
}

/**
 * The layers panel's dock (Figma pivot P2) — the LEFT-side sibling of Dock above. Both
 * compose the same MarginPush, so the save-verbatim/suspend/tween disciplines are shared
 * rather than mirrored (PR #45 review: this class used to reproduce Dock's whole state
 * machine by hand inside layers.ts, and its push snapped while the right one tweened).
 * What stays its own: the persisted open/closed preference and a fixed width — the layers
 * panel has no float mode and no resize drag.
 */
export class LeftDock {
  private prefs: LayersPrefs
  private push = new MarginPush('left')
  private active = false

  constructor(private host: HTMLElement) {
    this.prefs = loadLayersPrefs()
    this.host.style.setProperty('--forge-layers-w', `${LAYERS_WIDTH}px`)
  }

  isOpen(): boolean {
    return this.prefs.open
  }

  /** Design mode turned on. */
  enter(): void {
    this.active = true
    if (this.prefs.open) {
      this.push.arm()
      this.push.apply(LAYERS_WIDTH)
    }
  }

  /** Design mode turned off — same clean-flag exit as Dock.exit(). */
  exit(): void {
    this.active = false
    this.push.arm()
    this.push.remove()
    this.push.setCanvasActive(false)
  }

  setOpen(open: boolean): void {
    if (open === this.prefs.open) return
    this.prefs = { open }
    saveLayersPrefs(this.prefs)
    if (!this.active) return
    this.push.arm()
    if (open) this.push.apply(LAYERS_WIDTH)
    else this.push.remove()
  }

  setCanvasActive(on: boolean): void {
    this.push.setCanvasActive(on)
  }
}
