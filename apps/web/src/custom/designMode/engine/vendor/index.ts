/* t3-fork: pruned from the Forge's src/client/index.ts. The chat/session/delivery layer
 * (SessionFeed, ComposerSend, WatchStatus, Verifier, ChangeList, LifecycleSession and every
 * /__the-forge/* fetch) is removed — T3 Code threads are the delivery surface instead. The
 * DesignMode class keeps the Forge's editing core verbatim: selection, hover, keyboard,
 * drafts, canvas, layers, text edit, move/resize drag, ripple, persistence. New host seams:
 * `onSendRequest` / `onStateChange` / `onDraftsChanged` (see engine/boot.ts). */
import { Overlay } from './overlay'
import { findTaggedElement, type TaggedElement } from './source'
import { buildInspectorData } from './inspector'
import { DraftStore } from './drafts'
import { Panel } from './panel'
import { Dock } from './dock'
import { CanvasMode, unionClientRect, isEditable } from './canvas'
import { TextEditMode } from './text-edit'
import { MoveDrag } from './move-drag'
import { ResizeHandles } from './resize'
import { LayersController } from './layers-controller'
import { buildCanvasChrome, type CanvasChrome } from './canvas-chrome'
import { buildChangeRequestWithElements, renderStandaloneMarkdown } from './request'
import { snapshotRects, diffRects } from './ripple'
import { resetTokensCache } from './tokens'
import { saveLifecycle, sourceIndex, locateBySource, type PersistedLifecycle } from './lifecycle-store'

/** Rapid edits (e.g. dragging a number field) within this window reuse the first snapshot. */
const RIPPLE_DEBOUNCE_MS = 300

/** Arrow keys → the direction vocabulary MoveDrag speaks (P3 ratified #2). A lookup, not a
 * switch, so `ARROW_DIRS[e.key]` doubles as the "is this an arrow at all" test. */
const ARROW_DIRS: Record<string, 'left' | 'right' | 'up' | 'down' | undefined> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

export class DesignMode {
  active = false
  /** Ordered set of currently selected elements — VisBug-style multi-select (B6). */
  selection: TaggedElement[] = []
  /** t3-fork: host seam — receives the standalone change-request markdown when the user hits
   * Send in the engine's send bar. The host (T3 web app) forwards it into the thread composer. */
  onSendRequest?: (markdown: string, elementCount: number) => void
  /** t3-fork: host seam — fires on every setActive transition so the host chrome button can
   * mirror in-page exits (Esc with nothing selected turns design mode off from inside). */
  onStateChange?: (active: boolean) => void
  /** t3-fork: host seam — fires (debounce-free) whenever the draft set changes, so the send
   * bar's count label stays live without owning drafts.onChange (a single-slot callback). */
  onDraftsChanged?: () => void

  private moveRaf = 0
  private reflowRaf = 0
  private rippleRaf = 0
  private lastMove: MouseEvent | null = null
  /** The inline text-edit session (double-click → contenteditable), extracted to
   * text-edit.ts (PR #44 follow-up). While its `active` flag is set, hover/click/keydown
   * handling yields to the browser's own editing behavior via the delegation in
   * onMove/onClick/onKey below. Constructed in the constructor body (needs this.drafts). */
  private textEdit: TextEditMode
  /** The P3 canvas verbs — drag-to-reorder + free-drag + arrow nudge (move-drag.ts) and the
   * 8-point resize chrome (resize.ts). Both are idle-zero: constructed here, but no listener
   * exists until their start() in setActive. */
  private moveDrag: MoveDrag
  private handles: ResizeHandles
  readonly drafts: DraftStore
  private panel: Panel
  private dock: Dock
  /** The layers panel's whole chrome — tree + left page push + closed-state pill (Figma
   * pivot P2, layers-controller.ts). */
  private layersUi: LayersController
  private canvas: CanvasMode
  /** The zoom-pill DOM assembly + its repaint hook (canvas-chrome.ts) — presentation only,
   * constructed once this.canvas/this.panel exist. */
  private canvasChrome: CanvasChrome
  private buttonTimers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  // Layout-ripple state: idle-zero — only populated during the post-edit window.
  // A rapid burst of edits (e.g. dragging a number field) reuses each element's FIRST
  // snapshot in the burst until RIPPLE_DEBOUNCE_MS of quiet, so ripples reflect
  // drag-start -> drag-end, not per-tick noise. Keyed BY EDITED ELEMENT because a
  // multi-select commit loop calls handleBeforeEdit once per selected element per
  // tick — a single snapshot slot would be overwritten down to the last element (its
  // scope alone would ripple) and the alternating elements would defeat the reuse
  // check, re-running snapshotRects (forced layout) on every scrub tick. Snapshots
  // are cleared by a quiet-window TIMER (reset on every edit), not by the rAF that
  // runs the diff — the rAF must leave them alive so the NEXT edit in a burst still
  // diffs against the drag-start baselines instead of re-baselining every frame.
  private rippleSnapshots: Map<TaggedElement, Map<TaggedElement, DOMRect>> | null = null
  private lastEditAt = 0
  private rippleQuietTimer: ReturnType<typeof setTimeout> | null = null

  /** Drafts/selection from a restored session whose elements haven't rendered yet — boot()
   * runs before the framework mounts, so restoreLifecycle retries these on a short timer
   * until the DOM catches up (bounded), and persist() keeps them in storage meanwhile so
   * another reload mid-window doesn't lose them. */
  private pendingRestore: { drafts: PersistedLifecycle['drafts']; selection: PersistedLifecycle['selection'] } | null = null
  private restoreTimer: ReturnType<typeof setTimeout> | null = null
  /** R2 F-C: debounces syncDrafts()+persist() off drafts.onChange, which otherwise fires on
   * EVERY scrub tick — querySelectorAll + JSON.stringify + a synchronous sessionStorage.setItem
   * + replaceChildren per drag frame, against the codebase's own "React never re-renders while
   * scrubbing" discipline (see RIPPLE_DEBOUNCE_MS's burst pattern above). Shares the same
   * "quiet window" concept and constant as the ripple debounce, just a separate timer instance
   * since the two debounce unrelated things (layout-ripple measurement vs. draft persistence). */
  private draftSyncTimer: ReturnType<typeof setTimeout> | null = null
  /** Elements added to the selection BY the restore drain (R2 F-B) — tracks which members of
   * the current selection are "restore-owned" so a later-arriving restore element can still
   * extend the selection (boot located element A, retry later locates B — both are restore
   * additions and should end up co-selected). The moment the user makes their OWN selection
   * (select/toggleSelection/deselect via setSelection), that selection no longer matches this
   * set, and any still-pending restore selection item is dropped as resolved-obsolete instead
   * of stomping what the user just chose. */
  private restoredSelection = new WeakSet<TaggedElement>()

  constructor(
    private overlay: Overlay,
    panel?: Panel,
    drafts?: DraftStore,
    dock?: Dock
  ) {
    this.drafts = drafts ?? new DraftStore()
    this.textEdit = new TextEditMode(this.drafts, {
      select: (el) => this.select(el),
      isSoleSelection: (el) => this.selection.length === 1 && this.selection[0] === el,
      beforeEdit: (el) => this.handleBeforeEdit(el),
      edited: () => this.handleEdited(),
      hideHover: () => this.overlay.hideOutline(),
    })
    this.panel =
      panel ??
      new Panel(
        this.drafts,
        () => this.handleEdited(),
        (el) => this.handleBeforeEdit(el)
      )
    this.dock = dock ?? new Dock(overlay.host, this.panel, overlay.status, overlay.toggle)
    this.layersUi = new LayersController(overlay, this.drafts, {
      onSelect: (el, additive) => (additive ? this.toggleSelection(el) : this.select(el)),
      onHover: (el) => this.hoverOutline(el),
      // Row Del deletes the FOCUSED row, not the selection — canvas Del deletes the whole
      // selection. Deliberate: in the tree, keyboard focus is the thing under the user's
      // finger (it moves independently of selection), so obeying the selection there would
      // delete elements they can't even see the row for. Don't "fix" one to match the other.
      onDelete: (el) => this.deleteElements([el]),
    })
    this.canvas = new CanvasMode({
      dock: {
        mode: () => this.dock.mode(),
        width: () => this.dock.width(),
      },
      // Both docks suspend together — the artboard pans behind the layers panel exactly as
      // it does behind the properties panel (P2). Kept OUT of `dock` (which is fit math for
      // the right panel only) so a third recipient is a line, not another facade.
      onCanvasActive: (on: boolean) => {
        this.dock.setCanvasActive(on)
        this.layersUi.setCanvasActive(on)
      },
      // containsDeep, NOT contains: CanvasMode un-retargets events via composedPath()[0], so
      // its guard sees the real node INSIDE the overlay's shadow tree — which host.contains()
      // can never match (Node.contains stops at the shadow boundary). Plain contains() here
      // would make a wheel over the docked panel pan the artboard instead of scrolling it.
      hostContains: (t) => this.overlay.containsDeep(t),
      onChange: () => this.syncCanvasUi(),
      // Shift+2 zoom-to-selection: the union box of the multi-select, viewport coords
      // (getBoundingClientRect is already canvas-transformed — CanvasMode unmaps it).
      selectionRect: () => unionClientRect(this.selection),
    })
    this.canvasChrome = buildCanvasChrome(this.canvas, this.panel)
    this.overlay.attach(this.canvasChrome.wrap)
    // P3 canvas verbs. Constructed after this.canvas because both read its live zoom to convert
    // viewport travel into page px. `blocked` is the "someone else owns the pointer" gate:
    // mid-text-edit the browser's own caret/selection behavior must win, exactly as onMove and
    // onClick already yield to it. containsDeep (not contains) because MoveDrag resolves its
    // target through composedPath()[0] — a plain contains() can't cross the shadow boundary and
    // would let a press on a resize handle start a page drag (the same lesson canvas.ts's
    // hostContains comment records).
    this.moveDrag = new MoveDrag({
      drafts: this.drafts,
      scale: () => this.canvas.scale(),
      blocked: () => this.textEdit.active,
      overlayContains: (t) => this.overlay.containsDeep(t),
      onSelect: (el) => this.select(el),
      onEdited: () => this.handleEdited(),
    })
    this.handles = new ResizeHandles({
      drafts: this.drafts,
      scale: () => this.canvas.scale(),
      onEdited: () => this.handleEdited(),
    })
    this.overlay.attach(this.moveDrag.root)
    this.overlay.attach(this.handles.root)
    overlay.toggle.addEventListener('click', () => this.setActive(!this.active))
    overlay.copyButton.addEventListener('click', () => {
      // Copying a request with zero actionable edits is never useful.
      const { request } = buildChangeRequestWithElements(this.drafts)
      if (request.elements.length === 0) {
        this.flashButton(overlay.copyButton, 'No changes', 'Copy for agent')
        return
      }
      // Standalone render (guardrails included): the clipboard payload is pasted into an
      // arbitrary agent with no command text in context.
      const md = renderStandaloneMarkdown(request)
      navigator.clipboard
        .writeText(md)
        .then(() => this.flashButton(overlay.copyButton, 'Copied ✓', 'Copy for agent'))
        .catch(() => this.flashButton(overlay.copyButton, 'Copy failed', 'Copy for agent'))
    })
    overlay.compareAllButton.addEventListener('click', () => {
      this.drafts.compareAll(!this.drafts.isComparingAll())
      this.panel.refresh()
    })
    overlay.resetAllButton.addEventListener('click', () => {
      this.discardAll()
    })
    this.drafts.onChange = () => {
      // refreshStatus() is a cheap label update — stays immediate. syncDrafts()+persist() are
      // debounced (R2 F-C): a scrub/drag burst calls onChange once per tick, and each of those
      // is a querySelectorAll+JSON.stringify+sessionStorage.setItem+replaceChildren — the same
      // "quiet window" debounce the layout-ripple logic already uses for the same reason.
      this.refreshStatus()
      // t3-fork: keep the send bar's count label live — reads changeCount() only, cheap.
      this.onDraftsChanged?.()
      // tombstone strike-through and discard-undo paint (P2) — internally 100ms-debounced,
      // so scrub bursts cost one tree rebuild, not one per tick.
      this.layersUi.refreshOnDrafts()
      if (this.draftSyncTimer) clearTimeout(this.draftSyncTimer)
      this.draftSyncTimer = setTimeout(() => this.flushDraftSync(), RIPPLE_DEBOUNCE_MS)
    }
  }

  /** CanvasMode's onChange fires on every state change (setOn, resume, suspend, pan/zoom) —
   * this must stay an IDEMPOTENT full repaint, not an incremental toggle, since it's cheap
   * to call on every tick and a repaint-from-scratch can never drift out of sync with the
   * canvas's actual state. */
  private syncCanvasUi(): void {
    this.canvasChrome.sync()
    // Selection/hover outlines are fixed-position boxes positioned from getBoundingClientRect()
    // and are normally re-measured by onReflow on scroll/resize. The canvas body transform moves
    // every element's visual rect on every pan/zoom tick but fires neither — so in canvas mode
    // this onChange IS the reflow trigger, or a selected element's outline goes stale until the
    // next edit or re-click. onReflow is already rAF-coalesced, so the per-wheel-tick cost is fine.
    this.onReflow()
  }

  /** Cancels the pending debounced draft-sync timer (if any) and runs healStructural()+persist()
   * immediately (R2 F-C). Called from setActive(false) teardown and at the top of buildSend()
   * so a deactivate or a send always sees sessionStorage reflect the current drafts, not a
   * stale pre-debounce snapshot. */
  private flushDraftSync(): void {
    if (this.draftSyncTimer) {
      clearTimeout(this.draftSyncTimer)
      this.draftSyncTimer = null
    }
    // Structural drafts are keyed by node reference — re-bind (or prune) any whose node an
    // HMR remount replaced before projecting state to sessionStorage (PR #44 review).
    // A heal emits onChange, which only re-arms the debounce — the flush itself already
    // reflects the healed state below, and the follow-up flush is a cheap no-op.
    this.drafts.healStructural()
    this.persist()
  }

  get panelRoot(): HTMLElement {
    return this.panel.root
  }

  /** t3-fork: the send seam. Builds the standalone change-request markdown (guardrails
   * included — the payload lands in a T3 thread with no other delivery wrapper) and hands it
   * to the host via onSendRequest. Drafts stay applied as previews; the user discards them
   * once the agent's edit lands and the page hot-reloads. Returns what happened so the send
   * bar can flash the right label. */
  buildSend(): 'sent' | 'no-changes' {
    this.flushDraftSync()
    const { request } = buildChangeRequestWithElements(this.drafts)
    if (request.elements.length === 0) return 'no-changes'
    const markdown = renderStandaloneMarkdown(request)
    this.onSendRequest?.(markdown, request.elements.length)
    return 'sent'
  }

  /** t3-fork: the one discard-everything verb — resetAllButton and the send bar share it. */
  discardAll(): void {
    this.drafts.discardAll()
    this.panel.refresh()
    this.remeasure()
  }

  /** First selection member (or null) — kept for single-selection call sites/tests. */
  get selected(): TaggedElement | null {
    return this.selection[0] ?? null
  }

  setActive(on: boolean): void {
    if (on === this.active) return
    this.active = on
    this.overlay.setActive(on)
    if (on) {
      this.dock.enter()
      this.canvas.resume()
      // Tokens (colors, text scale) are memoized module-globally (readTokens) for cheap
      // repeat access during a session — but that means a theme edit made while design
      // mode was INACTIVE (author tweaks CSS, HMR reloads styles) would otherwise be
      // invisible until a full page reload. Reset on every activation so a fresh session
      // always re-reads the live stylesheet.
      resetTokensCache()
      document.addEventListener('mousemove', this.onMove, true)
      document.addEventListener('click', this.onClick, true)
      document.addEventListener('dblclick', this.onDblClick, true)
      document.addEventListener('keydown', this.onKey, true)
      document.addEventListener('pointerdown', this.onPointerDown, true)
      document.addEventListener('scroll', this.onReflow, { capture: true, passive: true })
      window.addEventListener('resize', this.onReflow, { passive: true })
      this.moveDrag.start()
      this.handles.start()
      this.layersUi.enter()
      this.refreshStatus()
      this.persist()
    } else {
      this.textEdit.finish() // commit any in-progress inline text edit before the listeners go
      document.removeEventListener('mousemove', this.onMove, true)
      document.removeEventListener('click', this.onClick, true)
      document.removeEventListener('dblclick', this.onDblClick, true)
      document.removeEventListener('keydown', this.onKey, true)
      document.removeEventListener('pointerdown', this.onPointerDown, true)
      document.removeEventListener('scroll', this.onReflow, true)
      window.removeEventListener('resize', this.onReflow)
      this.moveDrag.stop()
      this.handles.stop()
      this.clearNoDrop()
      if (this.moveRaf) cancelAnimationFrame(this.moveRaf)
      if (this.reflowRaf) cancelAnimationFrame(this.reflowRaf)
      if (this.rippleRaf) cancelAnimationFrame(this.rippleRaf)
      this.moveRaf = 0
      this.reflowRaf = 0
      this.rippleRaf = 0
      this.clearRippleState()
      this.lastMove = null
      this.selection = []
      // A session the user turned off must not keep restoring in the background.
      if (this.restoreTimer) clearTimeout(this.restoreTimer)
      this.restoreTimer = null
      this.pendingRestore = null
      this.drafts.compareAll(false) // previews survive exit — never leave the page stranded on "before"
      this.panel.hide()
      // Ordering is no longer load-bearing (2026-07-11 review: Dock.exit() now clears its own
      // canvasActive flag) — suspend() before exit() is kept because it's the natural order:
      // suspend() restores the page's saved styles and persists the canvas view, exit() undoes
      // the dock's own margin push. Either order now leaves both objects in a clean state.
      this.canvas.suspend()
      this.dock.exit()
      this.layersUi.exit()
      // A deactivate mid-debounce-window must not leave sessionStorage stale — flush (R2 F-C).
      this.flushDraftSync()
      this.persist()
    }
    // t3-fork: after the transition settles so the host reads a consistent state.
    this.onStateChange?.(on)
  }

  /** Rebuilds the session from a persisted lifecycle after a full page reload: re-activates
   * design mode, re-applies draft previews, and re-selects. The boot pass IS the first drain
   * (R2 F-B) — not a special case with its own policy — so a partial restore here and a
   * partial restore on a later retry tick behave identically. */
  restoreLifecycle(saved: PersistedLifecycle): void {
    if (!saved.designModeOn) return
    this.setActive(true)
    this.pendingRestore = { drafts: saved.drafts, selection: saved.selection }
    const { done } = this.drainPendingRestore()
    if (!done) this.scheduleRestoreRetry()
    this.persist()
  }

  /** Single per-item drain used by BOTH the boot pass (restoreLifecycle) and every retry tick
   * (R2 F-B — previously these ran two divergent policies: the boot pass applied partial
   * drafts but queued the ENTIRE selection as unresolved, while the retry pass only ever
   * touched selection when `this.selection.length === 0` — dead once boot had selected
   * anything — and required ALL-or-nothing, so a partial restore left `pending.selection`
   * undrainable and the retry timer spun all 40 attempts as a zombie).
   *
   * Policy per item:
   * - drafts: apply located items, keep unresolved ones pending (unchanged from before).
   * - selection: per-item. A located item is removed from pending and its element is ADDED to
   *   the selection — but only while the CURRENT selection is still "restore-owned" (empty, or
   *   every currently-selected element is in `restoredSelection`). If the user has since made
   *   their own selection, the pending item is dropped as resolved-obsolete instead of stomping
   *   it — a user's own selection is never overwritten by a late-appearing restore element.
   *
   * Returns `{ done: true }` once nothing remains pending, so the caller (boot pass or retry
   * tick) knows whether to schedule another attempt. */
  private drainPendingRestore(): { done: boolean } {
    const pending = this.pendingRestore
    if (!pending) return { done: true }

    const remainingDrafts: PersistedLifecycle['drafts'] = []
    for (const d of pending.drafts) {
      const el = locateBySource(d.dcSource, d.index)
      if (!el) {
        remainingDrafts.push(d)
        continue
      }
      for (const [prop, value] of d.props) this.drafts.apply(el, prop, value)
    }
    pending.drafts = remainingDrafts

    const restoreOwnsSelection = this.selection.length === 0 || this.selection.every((el) => this.restoredSelection.has(el))
    const remainingSelection: PersistedLifecycle['selection'] = []
    if (restoreOwnsSelection) {
      const additions: TaggedElement[] = []
      for (const sel of pending.selection) {
        const el = locateBySource(sel.dcSource, sel.index)
        if (el) additions.push(el)
        else remainingSelection.push(sel)
      }
      if (additions.length > 0) {
        for (const el of additions) this.restoredSelection.add(el)
        this.setSelection([...this.selection, ...additions])
      }
    } // else: the user's own selection is in place — every pending selection item is dropped as
    // resolved-obsolete (remainingSelection stays empty) rather than fighting the user for it.
    pending.selection = remainingSelection

    const done = pending.drafts.length === 0 && pending.selection.length === 0
    if (done) this.pendingRestore = null
    return { done }
  }

  /** Retries locating drafts/selection left unresolved by restoreLifecycle — boot() runs
   * before the framework mounts, so the first pass often finds nothing. Ticks every 300ms
   * for up to 40 attempts (~12s bounded window) rather than forever, so an app that never
   * renders the tagged element (e.g. it was deleted by the agent) doesn't leak a timer. Stops
   * as soon as drainPendingRestore reports done, so a partial restore that fully resolves (or
   * resolves-obsolete) on some retry tick never spins out the remaining attempts. */
  private scheduleRestoreRetry(attempt = 0): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer)
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      if (!this.pendingRestore) return
      const { done } = this.drainPendingRestore()
      if (!done && attempt + 1 < 40) {
        this.scheduleRestoreRetry(attempt + 1)
        return
      }
      // Either fully drained, or attempts are exhausted — give up either way: a bounded window
      // that never renders the tagged element (e.g. it was deleted by the agent) must not leave
      // a zombie pendingRestore that keeps getting merged into every future persist() forever.
      this.pendingRestore = null
      this.persist()
    }, 300)
  }

  private refreshStatus(): void {
    if (!this.active) return
    // t3-fork: the watcher/session indicator args are gone with the delivery layer — the
    // status strip only carries draft count + Before/After + Copy/Reset now.
    this.overlay.updateStatus(this.drafts.elementCount(), this.drafts.isComparingAll())
  }

  /** Serializes the full lifecycle to sessionStorage. Called only from state-change hooks
   * while the tool is in use — an ordinary page load with design mode off never writes.
   * Elements are addressed as (dcSource, index-among-matches) so list items sharing one
   * source location survive a reload individually (lifecycle-store.ts). */
  private persist(): void {
    const drafts: PersistedLifecycle['drafts'] = []
    const liveKeys = new Set<string>()
    for (const [el, props] of this.drafts.entries()) {
      const dcSource = (el as TaggedElement).dataset?.dcSource
      if (!dcSource) continue // untagged elements can't be re-located — preview-only, not persisted
      const index = sourceIndex(el as TaggedElement, dcSource)
      liveKeys.add(`${dcSource}#${index}`)
      drafts.push({
        dcSource,
        index,
        props: [...props.entries()].map(([p, d]) => [p, d.value] as [string, string]),
      })
    }
    // Merge in still-unresolved restore work so a reload mid-retry-window doesn't lose it —
    // the live DraftStore only has what's actually been located and applied so far.
    if (this.pendingRestore) {
      for (const d of this.pendingRestore.drafts) {
        if (!liveKeys.has(`${d.dcSource}#${d.index}`)) drafts.push(d)
      }
    }
    const selection =
      this.selection.length === 0 && this.pendingRestore && this.pendingRestore.selection.length > 0
        ? this.pendingRestore.selection
        : this.selection.flatMap((el) => {
            const dcSource = el.dataset?.dcSource
            return dcSource ? [{ dcSource, index: sourceIndex(el, dcSource) }] : []
          })
    saveLifecycle({
      v: 1,
      designModeOn: this.active,
      selection,
      drafts,
      // t3-fork: no queue ids without the delivery layer — the persisted-sent slot stays
      // empty (the shape survives so lifecycle-store's validator needs no fork edits).
      sent: [],
    })
  }

  /** Replaces the selection with just `el` (plain click / programmatic single-select). */
  select(el: TaggedElement): void {
    this.setSelection([el])
  }

  deselect(): void {
    this.setSelection([])
  }

  /** Shift+click: toggles `el`'s membership in the selection (add if absent, remove if present). */
  private toggleSelection(el: TaggedElement): void {
    const idx = this.selection.indexOf(el)
    const next = idx === -1 ? [...this.selection, el] : this.selection.filter((s) => s !== el)
    this.setSelection(next)
  }

  private setSelection(next: TaggedElement[]): void {
    // wasSingle: read BEFORE the assignment — a single→single hop is the one case the
    // outline tweens (multi-select and first-selection always snap; overlay.ts also
    // refuses a tween from hidden, so single-after-deselect stays a fade-in).
    const wasSingle = this.selection.length === 1
    this.selection = next
    this.layersUi.setSelection(next) // tree highlight rides the ONE selection funnel (P2)
    this.clearRippleState()
    // Tombstones get no outline: a display:none element measures 0×0-at-origin, so an
    // outline "hugging" it is a lie (deleteElements says exactly this, and clicking a
    // struck-through layers row was the way back into that state — PR #45 review). The
    // panel still opens, so Compare/Discard remain reachable, and the row stays highlighted.
    const outlined = this.outlinable(next)
    if (next.length === 0) {
      this.overlay.hideSelectOutline()
      this.overlay.hideSelectOutlines()
      this.panel.hide()
    } else if (next.length === 1) {
      this.overlay.hideSelectOutlines()
      if (outlined.length === 1) this.overlay.showSelectOutline(next[0].getBoundingClientRect(), wasSingle)
      else this.overlay.hideSelectOutline()
      this.panel.show(next[0], buildInspectorData(next[0]))
    } else {
      this.overlay.hideSelectOutline()
      this.overlay.showSelectOutlines(outlined.map((el) => el.getBoundingClientRect()))
      this.panel.show(next, buildInspectorData(next[0]))
    }
    this.placeHandles()
    this.persist()
  }

  /** Resize chrome follows the SELECT outline exactly — same rect, same rules. It rides
   * `outlinable`, so the two cases that get no outline get no handles either: a multi-select
   * (P3 ships single-element resize; the W/H fields still work on a multi-selection) and a
   * delete tombstone (a display:none element measures 0×0-at-origin, so handles would cluster
   * in the page's top-left corner offering to resize a lie). `place` takes the element too —
   * ResizeHandles has to know which element a drag mutates (task-5 divergence). */
  private placeHandles(): void {
    const outlined = this.outlinable(this.selection)
    if (this.selection.length === 1 && outlined.length === 1) {
      this.handles.place(outlined[0].getBoundingClientRect(), outlined[0])
    } else {
      this.handles.place(null)
    }
  }

  /** The one hover-outline painter — the layers tree drives it. */
  private hoverOutline(el: TaggedElement | null): void {
    if (el) this.overlay.showOutline(el.getBoundingClientRect())
    else this.overlay.hideOutline()
  }

  /** Clears all layout-ripple debounce state, including the pending quiet-window timer. */
  private clearRippleState(): void {
    if (this.rippleQuietTimer) clearTimeout(this.rippleQuietTimer)
    this.rippleQuietTimer = null
    this.rippleSnapshots = null
    this.lastEditAt = 0
  }

  private remeasure(): void {
    const outlined = this.outlinable(this.selection)
    if (this.selection.length === 1) {
      if (outlined.length === 1) this.overlay.showSelectOutline(outlined[0].getBoundingClientRect())
      else this.overlay.hideSelectOutline()
    } else if (this.selection.length > 1) {
      this.overlay.showSelectOutlines(outlined.map((el) => el.getBoundingClientRect()))
    }
    // Handles track the same rect on every repaint (scroll, resize, post-edit reflow) —
    // without this they'd stay pinned where the element USED to be, and a drag would
    // then resize from a stale anchor.
    this.placeHandles()
  }

  /** The selection minus its tombstones — see setSelection for why they get no outline.
   * Every outline painter goes through this, so a repaint (scroll, ripple) can't
   * resurrect an outline setSelection deliberately withheld. */
  private outlinable(els: TaggedElement[]): TaggedElement[] {
    return els.filter((el) => this.drafts.structuralOf(el)?.kind !== 'delete')
  }

  /** Panel's pre-hook, called immediately before drafts.apply() for every control edit. */
  private handleBeforeEdit(el: TaggedElement): void {
    const now = Date.now()
    // A quiet gap retires ALL baselines — the next edit starts a new burst. (Belt-and-
    // braces alongside the quiet-window timer below; also what re-baselines after a
    // re-selection whose edits resume within a still-pending timer window.)
    if (!this.rippleSnapshots || now - this.lastEditAt > RIPPLE_DEBOUNCE_MS) {
      this.rippleSnapshots = new Map()
    }
    // Reuse this element's in-flight snapshot while edits keep arriving within the
    // debounce window (a scrub/drag burst) — only the first edit of a burst measures.
    if (!this.rippleSnapshots.has(el)) {
      this.rippleSnapshots.set(el, snapshotRects(el))
    }
    this.lastEditAt = now
    // Reset the quiet-window timer on every edit — it (not the per-frame rAF) is what
    // retires the snapshots, so a burst of edits keeps diffing against the SAME
    // drag-start baselines instead of re-baselining every frame.
    if (this.rippleQuietTimer) clearTimeout(this.rippleQuietTimer)
    this.rippleQuietTimer = setTimeout(() => {
      this.rippleQuietTimer = null
      this.rippleSnapshots = null
      this.lastEditAt = 0
    }, RIPPLE_DEBOUNCE_MS)
  }

  /** Panel's post-hook, called after drafts.apply() for every control edit. */
  private handleEdited(): void {
    this.remeasure()
    if (this.rippleRaf) cancelAnimationFrame(this.rippleRaf)
    this.rippleRaf = requestAnimationFrame(() => {
      this.rippleRaf = 0
      // NOTE: do NOT null rippleSnapshots here — they must survive so the next edit in
      // a burst still diffs against the drag-start baselines. The quiet-window timer in
      // handleBeforeEdit is solely responsible for retiring them.
      const snapshots = this.rippleSnapshots
      if (!snapshots) return
      const changed = new Set<TaggedElement>()
      for (const snapshot of snapshots.values()) {
        for (const moved of diffRects(snapshot)) changed.add(moved)
      }
      // Selected elements are being EDITED, not rippled — each snapshot excludes only
      // its own element, so in multi-select every co-selected element still shows up
      // in the others' scopes and must be dropped here.
      for (const sel of this.selection) changed.delete(sel)
      // Tombstoned elements never ripple: display:none measures 0×0-at-origin (still
      // isConnected, so diffRects reports it as "moved"), and on multi-delete the selection
      // is already empty by the time this rAF runs — the filter above can't exclude
      // co-deleted elements, which drew spurious outlines at the viewport corner
      // (PR #44 review).
      for (const el of Array.from(changed)) {
        if (this.drafts.structuralOf(el)?.kind === 'delete') changed.delete(el)
      }
      if (changed.size > 0) this.overlay.showRipples([...changed].map((moved) => moved.getBoundingClientRect()))
    })
  }

  private flashButton(btn: HTMLButtonElement, label: string, restore: string): void {
    btn.textContent = label
    const existing = this.buttonTimers.get(btn)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      btn.textContent = restore
      this.buttonTimers.delete(btn)
    }, 1500)
    this.buttonTimers.set(btn, timer)
  }

  private onMove = (e: MouseEvent): void => {
    if (this.textEdit.active) return // hover chrome is noise while the user is typing in the page
    // Mid-drag the insertion indicator IS the feedback — a hover outline chasing whatever sibling
    // the pointer happens to be over competes with it and reads as flicker.
    if (this.moveDrag.isDragging()) return
    this.lastMove = e
    if (this.moveRaf) return
    this.moveRaf = requestAnimationFrame(() => {
      this.moveRaf = 0
      const ev = this.lastMove
      if (!this.active || !ev || this.overlay.contains(ev.target)) return
      const el = findTaggedElement(ev.target as Element)
      if (el && !this.selection.includes(el)) this.overlay.showOutline(el.getBoundingClientRect())
      else this.overlay.hideOutline()
    })
  }

  private onClick = (e: MouseEvent): void => {
    if (this.overlay.contains(e.target)) return
    // Mid-edit click policy (caret shield / commit-and-fall-through) lives in TextEditMode.
    if (this.textEdit.handleClick(e) === 'shielded') return
    e.preventDefault()
    e.stopPropagation()
    const el = findTaggedElement(e.target as Element)
    if (el && e.shiftKey) this.toggleSelection(el)
    else if (el) this.select(el)
    else this.deselect()
  }

  /** Double-click on a text-leaf element enters inline text edit (Figma behavior) — gates
   * and session lifecycle live in TextEditMode (text-edit.ts); this handler only owns the
   * event plumbing, so registration/removal stays in setActive beside the other capture
   * handlers. */
  private onDblClick = (e: MouseEvent): void => {
    if (this.overlay.contains(e.target)) return
    const el = this.textEdit.candidate(e.target)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    this.textEdit.begin(el)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.overlay.contains(e.target)) return
    if (this.textEdit.handleKey(e)) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Same typing-surface guard as canvas mode's Space/zoom shortcuts — Del in the
      // composer or any input must never nuke the canvas selection. Carve-out: when the
      // focused control IS in the selection, the intent is deleting the element itself —
      // click-selecting an input also natively focuses it (no mousedown interception here),
      // so without this, form controls are undeletable via the only delete verb P1 ships,
      // and Backspace live-edits the focused input's value instead (PR #44 review).
      const target = e.target as Node | null
      const deletingEditable = target !== null && this.selection.includes(target as TaggedElement)
      if (isEditable(e.target) && !deletingEditable) return
      if (this.selection.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      this.deleteElements([...this.selection])
      return
    }
    const dir = ARROW_DIRS[e.key]
    if (dir) {
      // Same typing-surface rule as Del above and canvas mode's Space/zoom shortcuts — arrows in
      // the composer or any input must move the caret, never the page's elements. No Del-style
      // carve-out here: unlike deleting a focused input, there is no sense in which "nudge the
      // thing I'm typing in" is the intent.
      if (isEditable(e.target)) return
      if (this.selection.length !== 1) return // single-element structural ops in P3 (multi is P5)
      if (this.nudge(this.selection[0], dir, e.shiftKey)) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (this.selection.length > 0) this.deselect()
    else this.setActive(false)
  }

  /** THE arrow-key arbitration (ratified #2: context-sensitive). An out-of-flow element nudges
   * its inset by 1px (Shift 10px, Figma's own step pair); an auto-layout child reorders ±1 along
   * its parent's MAIN axis, and cross-axis arrows do nothing. Both branches live in MoveDrag so
   * the keyboard and the pointer can never disagree about which mechanism owns `left`/`top` or
   * what a reorder index means. Returns whether the key was consumed, so an arrow that means
   * nothing here still scrolls the page instead of being silently swallowed. */
  private nudge(el: TaggedElement, dir: 'left' | 'right' | 'up' | 'down', big: boolean): boolean {
    const step = big ? 10 : 1
    const dx = dir === 'left' ? -step : dir === 'right' ? step : 0
    const dy = dir === 'up' ? -step : dir === 'down' ? step : 0
    // Free-drag routing first: MoveDrag.nudge returns false for anything still in flow, which is
    // exactly the reorder case. Order matters — an absolutely-positioned flex child is out of
    // flow, so its arrows must move it, not reshuffle siblings it no longer sits among.
    if (this.moveDrag.nudge(el, dx, dy)) return true
    return this.moveDrag.reorderStep(el, dir)
  }

  /** The no-drop affordance for ratified #1. MoveDrag deliberately never arms outside a flex/grid
   * parent, so it cannot own this cursor — but a press that does nothing with no feedback reads as
   * a broken tool, so the controller flags the attempt for the life of the press. Deliberately
   * pointer-DOWN, not hover: clicking to select is perfectly valid there, and a permanent
   * not-allowed cursor on every non-auto-layout element would say otherwise.
   *
   * Written as an inline style on <html>, not a class + overlay CSS rule: this stylesheet lives in
   * the overlay's shadow root and cannot style the page's own <html>. CanvasMode is the OTHER
   * owner of that one property (its space-hold grab cursor), so the page's own value is saved and
   * restored verbatim here — and the two can't interleave anyway, because canvas.ts claims
   * pointerdown on WINDOW capture and stopPropagation()s the space/middle-button presses before
   * this document-capture handler ever sees them. */
  private savedPageCursor: string | null = null

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.textEdit.active) return
    if (this.overlay.containsDeep(e.composedPath()[0] ?? e.target)) return
    const el = findTaggedElement(e.target as Element)
    if (!el || this.drafts.structuralOf(el)?.kind === 'delete') return
    // The gate IS MoveDrag's own plan, not a copy of its conditions: this used to test
    // `reorderAxisOf(el.parentElement)`, which disagreed with planFor in both directions — an
    // out-of-flow element free-drags regardless of its parent's display (so a working drag showed
    // not-allowed the whole way), and a flex parent with one styleable child passes the axis test
    // while planFor still bails (so a dead press showed nothing). PR #46 review, major 7 + minor 3.
    if (this.moveDrag.wouldDrag(el)) return // a real drag target — MoveDrag has it
    if (this.savedPageCursor === null) this.savedPageCursor = document.documentElement.style.cursor
    document.documentElement.style.cursor = 'not-allowed'
    window.addEventListener('pointerup', this.clearNoDrop, { once: true })
    window.addEventListener('pointercancel', this.clearNoDrop, { once: true })
  }

  /** Idempotent AND inert when nothing is armed — setActive(false) calls this unconditionally, and
   * an unguarded body would fire removeEventListener for a press that never happened, which the
   * listener-symmetry test reads (correctly) as a leak. */
  private clearNoDrop = (): void => {
    if (this.savedPageCursor === null) return
    document.documentElement.style.cursor = this.savedPageCursor
    this.savedPageCursor = null
    window.removeEventListener('pointerup', this.clearNoDrop)
    window.removeEventListener('pointercancel', this.clearNoDrop)
  }

  /** The one delete routine — canvas Del and the layers tree's row Del share it so the
   * two paths can never drift (P2). Deselect FIRST: a selection outline hugging a
   * display:none tombstone is a lie. Two-phase: every ripple baseline (layout reads)
   * BEFORE any display:none write — interleaving forced one synchronous reflow per
   * element in a single keydown (PR #44 review). */
  private deleteElements(els: TaggedElement[]): void {
    // Already-tombstoned elements drop out here: applyDelete no-ops on them anyway, but the
    // ripple baseline + measurement around it is real work over a guaranteed no-change edit
    // (Del twice on the same row — PR #45 review).
    const fresh = els.filter((el) => this.drafts.structuralOf(el)?.kind !== 'delete')
    if (fresh.length === 0) return
    this.deselect()
    for (const el of fresh) this.handleBeforeEdit(el) // ripple baseline: show which siblings reflow into the gap
    for (const el of fresh) this.drafts.applyDelete(el)
    this.handleEdited()
  }

  private onReflow = (): void => {
    if (this.reflowRaf) return
    this.reflowRaf = requestAnimationFrame(() => {
      this.reflowRaf = 0
      if (!this.active) return
      this.remeasure()
      // hover position is stale after scroll/resize — hide; next mousemove redraws
      this.overlay.hideOutline()
      this.lastMove = null
    })
  }
}
