import type { TaggedElement } from './source'
import type { DraftStore } from './drafts'
import { LayersTree } from './layers'
import { LeftDock } from './dock'
import { createButton } from './ui/button'

/** What the controller needs from the overlay — structural, so layers chrome doesn't
 * import Overlay (and can be driven by a stub in tests). */
export interface LayersOverlay {
  host: HTMLElement
  attach(el: HTMLElement): void
}

/** The verbs the tree hands back to DesignMode — selection and deletion truth stay there. */
export interface LayersHost {
  onSelect: (el: TaggedElement, additive: boolean) => void
  onDelete: (el: TaggedElement) => void
  onHover: (el: TaggedElement | null) => void
}

/**
 * The layers panel's chrome lifecycle (Figma pivot P2): the tree, its left-side page push,
 * and the closed-state pill, owned together so index.ts holds ONE object instead of three
 * fields and a pair of open/sync verbs. Same extraction the overlay has already made three
 * times — canvas-chrome.ts, composer-config.ts, text-edit.ts (PR #45 review).
 *
 * Open-state truth lives in LeftDock (it owns the persisted preference); this class is what
 * keeps the tree's running state and the pill's visibility in step with it.
 */
export class LayersController {
  private tree: LayersTree
  private dock: LeftDock
  private toggle: HTMLButtonElement
  private active = false

  constructor(overlay: LayersOverlay, drafts: DraftStore, host: LayersHost) {
    this.dock = new LeftDock(overlay.host)
    this.tree = new LayersTree(drafts, {
      onSelect: host.onSelect,
      onHover: host.onHover,
      onDelete: host.onDelete,
      onClose: () => this.setOpen(false),
    })
    overlay.attach(this.tree.root)
    this.toggle = createButton({ label: 'Layers', title: 'Show layers', className: 'layers-toggle' })
    this.toggle.hidden = true
    this.toggle.addEventListener('click', () => this.setOpen(true))
    overlay.attach(this.toggle)
  }

  /** Design mode turned on. */
  enter(): void {
    this.active = true
    this.dock.enter()
    if (this.dock.isOpen()) this.tree.start()
    this.syncToggle()
  }

  /** Design mode turned off — the tree stops (zero idle overhead: no observer, no timer)
   * and every page mutation the dock made is undone. */
  exit(): void {
    this.active = false
    this.tree.stop()
    this.dock.exit()
    this.toggle.hidden = true
  }

  setOpen(open: boolean): void {
    this.dock.setOpen(open)
    if (this.active && open) this.tree.start()
    else this.tree.stop()
    this.syncToggle()
  }

  isOpen(): boolean {
    return this.dock.isOpen()
  }

  /** Selection changed — rides DesignMode's one selection funnel. */
  setSelection(els: TaggedElement[]): void {
    this.tree.setSelection(els)
  }

  /** Drafts changed: repaints tombstone strike-through / discard-undo. Internally debounced,
   * so a scrub burst costs one tree rebuild, not one per tick. */
  refreshOnDrafts(): void {
    this.tree.refreshSoon()
  }

  /** Canvas mode took/released the page — suspends the left push exactly like the right one. */
  setCanvasActive(on: boolean): void {
    this.dock.setCanvasActive(on)
  }

  /** The top-left 'Layers' pill shows only while design mode is on AND the panel is closed
   * (open state has the panel's own ‹ button; idle state must stay chrome-free). */
  private syncToggle(): void {
    this.toggle.hidden = !this.active || this.dock.isOpen()
  }
}
