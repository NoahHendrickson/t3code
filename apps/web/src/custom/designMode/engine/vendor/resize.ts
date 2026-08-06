import type { TaggedElement } from './source'
import { DraftStore } from './drafts'
import { marginEdgeOffsets } from './panel-readers'
import { defeatFillIfGrowing, positionStateOf, type PositionState } from './panel-specs'

export type HandleId = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface Box { w: number; h: number; left: number; top: number }

const ALL_HANDLES: HandleId[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const TOUCHES_N = new Set<HandleId>(['n', 'ne', 'nw'])
const TOUCHES_S = new Set<HandleId>(['s', 'se', 'sw'])
const TOUCHES_E = new Set<HandleId>(['e', 'ne', 'se'])
const TOUCHES_W = new Set<HandleId>(['w', 'nw', 'sw'])

/**
 * One axis of a handle drag. 'e'/'s' are the FAR edge of their axis (the opposite edge — w/h
 * at n/w — stays put, size just grows/shrinks with +delta); 'w'/'n' are the NEAR edge (the
 * drag itself moves that edge, so pos moves WITH it and size grows with -delta). Clamped so a
 * drag past the fixed far edge collapses to a zero-size box sitting AT that far edge — never a
 * negative size (ratified #4) and never an overshooting pos. The position is derived from the
 * CLAMPED size delta (`startSize - size`), not the raw pointer delta: using the raw delta would
 * keep sliding the near edge past the fixed far edge once size has already clamped to 0.
 */
function farEdge(startSize: number, delta: number): number {
  return Math.max(0, startSize + delta)
}
function nearEdge(startSize: number, startPos: number, delta: number): { size: number; pos: number } {
  const size = Math.max(0, startSize - delta)
  return { size, pos: startPos + (startSize - size) }
}

/**
 * Pure geometry: the new box from a handle drag. `aspect` = Shift held (ratified #3: a corner
 * drag under Shift preserves `start.w / start.h`). Callers consume only what applies to the
 * dragged element: a flow element only ever writes w/h (left/top here are meaningless for it —
 * it has no coordinate system); an absolute element also writes left/top for n/w-touching
 * handles, since dragging those moves the box's near edge (see nearEdge above).
 */
export function resizeFrom(
  start: { w: number; h: number; left: number; top: number },
  handle: HandleId, dx: number, dy: number, aspect: boolean
): { w: number; h: number; left: number; top: number } {
  let w = start.w
  let left = start.left
  if (TOUCHES_E.has(handle)) w = farEdge(start.w, dx)
  else if (TOUCHES_W.has(handle)) { const r = nearEdge(start.w, start.left, dx); w = r.size; left = r.pos }

  let h = start.h
  let top = start.top
  if (TOUCHES_S.has(handle)) h = farEdge(start.h, dy)
  else if (TOUCHES_N.has(handle)) { const r = nearEdge(start.h, start.top, dy); h = r.size; top = r.pos }

  // Corners only: a single-axis edge handle (n/s/e/w) drags one dimension, and there is no
  // second axis to preserve a ratio AGAINST — Shift is a no-op there (the simple thing, per
  // the plan's own note), rather than inventing a fake perpendicular constraint nobody asked
  // for. `scale` is the larger of the two independently-computed (and already-clamped) axis
  // scale factors — "cover" behavior, matching which edge the pointer visibly dragged furthest
  // — and BOTH w and h are re-derived from that one factor so they can never independently
  // clamp to different effective ratios.
  if (aspect && handle.length === 2) {
    const scaleX = start.w > 0 ? w / start.w : 1
    const scaleY = start.h > 0 ? h / start.h : 1
    const scale = Math.max(scaleX, scaleY)
    w = start.w * scale
    h = start.h * scale
    if (TOUCHES_W.has(handle)) left = start.left + (start.w - w)
    if (TOUCHES_N.has(handle)) top = start.top + (start.h - h)
  }

  return { w, h, left, top }
}

// The out-of-flow gate for also writing left/top on a resize is panel-specs' positionStateOf —
// the ONE predicate shared with the panel's X/Y rows and move-drag's planFor. This module used to
// carry its own `getComputedStyle(el).position` version, which was actively wrong once the
// absolute DRAFT landed: the computed position reads 'absolute' BECAUSE OF OUR OWN PREVIEW, so a
// drafted-absolute element took the css-draft arm and called drafts.apply(el, 'left', …) — which
// DraftStore now refuses outright while an absolute draft owns those props (P3 review finding 8),
// silently making n/w handle drags stop shifting the box. The three states are genuinely different
// mechanisms and only positionStateOf knows which is which (task-1 fix-pass finding 1).

/**
 * The drag-start box, in the SAME real-CSS-px space `resizeFrom` and the drafted W/H/left/top
 * values live in — deliberately NOT `getBoundingClientRect()` (viewport space, scaled by the
 * canvas zoom transform) and NOT `offsetWidth`/`offsetHeight` (always border-box, which would
 * silently mis-size a content-box element that has padding/border). `getComputedStyle`'s
 * width/height is the same "used value" the panel's own W/H fields read (readValue in
 * panel.ts) — CSS transforms are paint-time only and never affect it, so no /scale() needed
 * here either (the plan's asymmetry note — only the pointer DELTAS need dividing by scale()).
 * Draft-aware (`drafts.current(...) ?? computed`) for two reasons: a second resize on the same
 * gesture-session must continue from the LAST drafted size, not revert to the original CSS;
 * and it's what makes this deterministic under jsdom, which never computes real layout —
 * seeding a DraftStore is the only way to test a full simulated drag's numbers.
 */
function startBoxOf(el: TaggedElement, drafts: DraftStore): Box {
  const computed = getComputedStyle(el)
  // The MARGIN-edge basis, not elementOffsets' border edge (PR #46 review finding 2): the inset
  // this seeds is fed straight back out as a css `left`/`top` draft, and CSS resolves those
  // against the element's margin edge — see marginEdgeOffsets' doc for the full distinction. All
  // three inset sites (this one, the absolute seed, the panel's X/Y row) share that one basis, or
  // an n/w drag on a margined element steps the box by its margin on the first tick. Still 0,0
  // for SVG — same guard elementOffsets already applied.
  const offsets = marginEdgeOffsets(el)
  const w = seedFrom(drafts.current(el, 'width'), computed.getPropertyValue('width'))
  const h = seedFrom(drafts.current(el, 'height'), computed.getPropertyValue('height'))
  // Inset base, in priority order: a live absolute DRAFT owns it (its inset lives in the
  // structural draft, NOT the css map, so drafts.current would read empty and a second n/w drag
  // would restart from the element's laid-out offset — visibly snapping back); then a css draft;
  // then the measured offset.
  const structural = drafts.structuralOf(el)
  const inset = structural?.kind === 'absolute' && structural.on ? structural : null
  const left = inset ? inset.left : seedFrom(drafts.current(el, 'left'), String(offsets.x))
  const top = inset ? inset.top : seedFrom(drafts.current(el, 'top'), String(offsets.y))
  return { w, h, left, top }
}

/**
 * One seed value: a draft wins ONLY when it is explicit px, otherwise the measurement does — the
 * `??`-then-parseFloat shape this replaces was PR #46 review finding 3 (MAJOR). Hug mode drafts
 * the literal keyword `auto` (panel-layout.ts's onSizeModeChange), so `drafts.current` returned a
 * non-null 'auto', `??` never fell through to the computed measurement, and
 * `parseFloat('auto') || 0` seeded a ZERO-size box: set W to Hug, drag the E handle +10px, and the
 * element snapped from its natural width to `10px`. Fixed-mode conversion already solved exactly
 * this (panel-layout's `isAutoNow`, which measures the computed size whenever the draft isn't a
 * px number) — this is the same treatment, applied to every seed here rather than just width,
 * since `left: auto`/`height: auto` are just as legal a css draft as `width: auto`, and a percent
 * is intent rather than a px measurement. Non-finite on BOTH sides (jsdom, which computes no
 * layout at all) still falls back to 0.
 */
export function seedFrom(draft: string | null, measured: string): number {
  // Drafted dimensions/insets live in real CSS px. Parsing any merely numeric prefix would
  // turn a percentage intent such as `width: 100%` into `100px` on the next resize/freeze.
  const drafted = draft?.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))px$/)?.[1]
  const draftedPx = drafted === undefined ? Number.NaN : Number.parseFloat(drafted)
  if (Number.isFinite(draftedPx)) return draftedPx
  const fallback = Number.parseFloat(measured)
  return Number.isFinite(fallback) ? fallback : 0
}

export interface ResizeHandlesOpts {
  drafts: DraftStore
  /** canvas.scale() — divides the drag's pointer deltas only (see startBoxOf's doc). */
  scale: () => number
  onEdited: () => void
}

/**
 * Figma-style 8-point resize chrome. Its own overlay layer, NOT part of `#select-outline`
 * (which is `pointer-events: none` and must stay that way — resize needs the opposite). The
 * controller (index.ts) owns when `place()`/`start()`/`stop()` are called; this module owns
 * nothing about selection state beyond the one element `place()` most recently pointed it at.
 */
export class ResizeHandles {
  root: HTMLElement
  private target: TaggedElement | null = null
  private active = false

  /** Live drag teardown, same idiom as CanvasMode.dragTeardown (canvas.ts) — lets stop() kill
   *  an in-flight drag's window listeners; without it, a mid-drag stop() (design mode toggled
   *  off, selection cleared) leaves them alive and the next pointermove writes a draft onto an
   *  element the chrome no longer even points at. */
  private dragTeardown: (() => void) | null = null

  /** The armed once:true click squelch, tracked for the same reason CanvasMode tracks its own
   *  (see canvas.ts's clickSquelch doc): a squelch that never fires (design mode/selection
   *  changed before the browser's click landed) must not outlive the gesture — a zero-idle-
   *  overhead violation if it's still listening after stop(). */
  private clickSquelch: ((e: MouseEvent) => void) | null = null

  constructor(private opts: ResizeHandlesOpts) {
    this.root = document.createElement('div')
    this.root.className = 'resize-handles'
    this.root.hidden = true
    for (const id of ALL_HANDLES) {
      const handle = document.createElement('div')
      handle.className = 'resize-handle'
      handle.dataset.handle = id
      // The root sits at pointer-events:none in the controller's stylesheet (same convention
      // as #outline/#select-outline — a chrome box must never block clicks THROUGH it to the
      // page beneath); only these 8 squares opt back in, so this is the one style this module
      // is allowed to own directly rather than leaving to the controller's CSS (task contract).
      handle.style.pointerEvents = 'auto'
      this.root.appendChild(handle)
    }
  }

  /** Follows the select outline. `rect` is VIEWPORT coordinates (`getBoundingClientRect()`,
   *  already canvas-transformed, same space `overlay.ts`'s own `place()` uses for
   *  `#select-outline`) — written straight through, no /scale() math (the asymmetry the plan
   *  calls out: only the in-flight drag's pointer deltas divide by scale(), never a rect that's
   *  already post-transform). `null` hides the chrome (multi-select, tombstones) — `el` is a
   *  DIVERGENCE from the plan's bare `place(rect)` signature: the class has to know WHICH
   *  element a drag mutates, and the plan's constructor carries no target field, so `place` is
   *  the only call the controller makes on every selection change and is the natural place to
   *  also hand over the target. Defaults to null so `place(null)` alone still reads as "hide". */
  place(rect: DOMRect | null, el: TaggedElement | null = null): void {
    this.target = el
    if (!rect) {
      this.root.hidden = true
      return
    }
    this.root.hidden = false
    this.root.style.left = `${rect.left}px`
    this.root.style.top = `${rect.top}px`
    this.root.style.width = `${rect.width}px`
    this.root.style.height = `${rect.height}px`
  }

  /** Zero idle overhead (hard product constraint): no listener exists until this is called. */
  start(): void {
    if (this.active) return
    this.active = true
    this.root.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('blur', this.onBlur)
  }

  /** Idempotent, and tears down an in-flight drag too (see dragTeardown's doc). Also HIDES the
   *  chrome and drops the target: stop() is what design-mode-off calls, and 8 interactive
   *  squares left painted over the page after the overlay goes quiet is the same class of bug
   *  as a selection outline hugging a tombstone — the module must not depend on the controller
   *  remembering a matching place(null) (task-5 review). */
  stop(): void {
    if (!this.active) return
    this.active = false
    this.dragTeardown?.()
    this.place(null)
    this.root.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('blur', this.onBlur)
    if (this.clickSquelch) {
      window.removeEventListener('click', this.clickSquelch, true)
      this.clickSquelch = null
    }
  }

  private onBlur = (): void => {
    // Backstop for a pointerup delivered to a different window entirely (Cmd+Tab mid-drag) —
    // same rationale as CanvasMode.onBlur: with the pointer gone, no pointermove arrives either,
    // so onMove's own buttons===0 self-heal can never fire.
    this.dragTeardown?.()
  }

  private onPointerDown = (e: PointerEvent): void => {
    const targetNode = e.target
    const handleEl = targetNode instanceof Element ? targetNode.closest<HTMLElement>('[data-handle]') : null
    const handle = handleEl?.dataset.handle as HandleId | undefined
    if (!handle || !this.target) return
    // ONE gesture at a time (PR #46 review finding 6). `dragTeardown` is a single field, so a
    // second pointer's press used to OVERWRITE the first gesture's teardown and orphan it: the
    // first drag's window pointermove/pointerup listeners then belonged to nobody, and stop()
    // (design mode off, selection cleared) could no longer kill them — they stayed live, writing
    // drafts onto an element the chrome no longer points at. That is a zero-idle-overhead
    // violation (hard product constraint), touch-only but mechanically real.
    //
    // IGNORE the new pointer rather than tearing the live one down first: a resize is a
    // single-pointer gesture, and everything below is frozen against the pointer that started it
    // (the start box, the handle, the pointerId) — handing the box to a second finger mid-gesture
    // would re-anchor it and visibly jump. The event is still swallowed, because it landed on our
    // own chrome and must not reach the page beneath as a click-to-select.
    if (this.dragTeardown) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const el = this.target
    e.preventDefault()
    e.stopPropagation()

    // Frozen at drag-start — deliberately UNLIKE CanvasMode's pan (canvas.ts onPointerDown),
    // which folds each tick's delta onto LIVE shared state because a wheel-zoom can interleave
    // with the pan gesture and must be respected mid-drag. Nothing else writes this element's
    // box while a resize is in flight, so recomputing from one frozen anchor each tick is safe
    // — and it's what keeps Shift's aspect ratio locked to the ORIGINAL box instead of drifting
    // once a clamp-to-0 tick would otherwise corrupt a live running ratio. `scale()` is still
    // read fresh on every tick below, so a live zoom change mid-drag is still honored.
    const start = startBoxOf(el, this.opts.drafts)
    const posState = positionStateOf(el, this.opts.drafts)
    const downX = e.clientX
    const downY = e.clientY
    const dragPointerId = e.pointerId
    let moved = false

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== dragPointerId) return
      // Self-heal a lost pointerup/pointercancel (canvas.ts's onMove idiom): an app-switch
      // mid-drag can deliver the release to a different window, so this gesture never sees
      // pointerup at all — the next pointermove we DO get still reports live button state.
      if (ev.buttons === 0) { finish(false); return }
      moved = true
      const scale = this.opts.scale()
      const dx = (ev.clientX - downX) / scale
      const dy = (ev.clientY - downY) / scale
      const box = resizeFrom(start, handle, dx, dy, ev.shiftKey)
      this.writeBox(el, box, posState, handle, ev.shiftKey)
    }

    const finish = (installSquelch: boolean): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      this.dragTeardown = null
      // The click that follows a resize drag would otherwise land as a click-to-select
      // somewhere else on the page (the pointer is rarely still over the handle at release) —
      // squelch exactly one, same once:true idiom as CanvasMode's finish(). No squelch on a
      // no-op click-without-drag (handles are dedicated drag affordances, not buttons — a bare
      // click on one selects nothing new and needs nothing eaten) or on pointercancel (the
      // browser never fires a click for a gesture whose pointerup it never delivered).
      if (installSquelch && moved) {
        if (this.clickSquelch) window.removeEventListener('click', this.clickSquelch, true)
        const squelch = (ce: MouseEvent): void => {
          ce.stopPropagation()
          ce.preventDefault()
          this.clickSquelch = null
        }
        this.clickSquelch = squelch
        window.addEventListener('click', squelch, { capture: true, once: true })
      }
    }

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== dragPointerId) return
      finish(true)
    }
    const onCancel = (ev: PointerEvent): void => {
      if (ev.pointerId !== dragPointerId) return
      finish(false)
    }
    this.dragTeardown = () => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  /** Every W/H write goes through `defeatFillIfGrowing` THEN `drafts.apply` — the exact path
   *  the panel's own W/H number fields use (panel.ts's commit), so token mapping, Compare, and
   *  the changelist need zero new cases for resize (ratified #3: a handle drag always writes
   *  Fixed px). left/top are a DIFFERENT, simpler path — `defeatFillIfGrowing` is specifically
   *  about flex main-axis sizing and has nothing to say about position, and only fires at all
   *  when the element is already out of flow (a flow element has no coordinate system to write
   *  left/top INTO — the plan's own "no new op" note: absolute X/Y are plain css drafts).
   *
   *  ONLY the axes the handle actually touches are written (Shift on a corner touches both).
   *  Writing the untouched axis too — which this did before the task-5 review — pins an
   *  explicit px size on an axis the user never dragged: it defeats that axis's Hug in the
   *  live preview, counts a phantom change in the composer pill, and (the actually-shipping
   *  harm) lets defeatFillIfGrowing draft flex-grow:0/flex-basis:auto off a cross-axis drag,
   *  which is NOT a no-op and would ride the request to the agent. The size delta itself was
   *  invisible on the wire only because request.ts drops no-op css deltas at send time. */
  private writeBox(el: TaggedElement, box: Box, posState: PositionState, handle: HandleId, aspect: boolean): void {
    const corner = handle.length === 2
    const touchesX = TOUCHES_E.has(handle) || TOUCHES_W.has(handle) || (aspect && corner)
    const touchesY = TOUCHES_N.has(handle) || TOUCHES_S.has(handle) || (aspect && corner)
    if (touchesX) {
      defeatFillIfGrowing(el, 'width', this.opts.drafts)
      this.opts.drafts.apply(el, 'width', `${Math.round(box.w)}px`)
    }
    if (touchesY) {
      defeatFillIfGrowing(el, 'height', this.opts.drafts)
      this.opts.drafts.apply(el, 'height', `${Math.round(box.h)}px`)
    }
    // The near-edge handles move the box's origin, so an out-of-flow element also needs its inset
    // rewritten — through whichever mechanism OWNS that inset, which is the whole point of
    // positionStateOf: a live absolute draft owns position/left/top end-to-end and takes
    // setAbsoluteInset (the ONE structural op stays coherent, ratified #4), while an element
    // already absolute in the code takes plain css drafts (delegated call #2). A 'flow' element
    // has no coordinate system to write an inset into and gets neither.
    if (posState !== 'flow' && (TOUCHES_W.has(handle) || TOUCHES_N.has(handle))) {
      const left = Math.round(box.left)
      const top = Math.round(box.top)
      if (posState === 'draft') {
        // setAbsoluteInset takes the PAIR — the untouched axis rides along at its current value,
        // which resizeFrom already carried through unchanged for a single-axis handle.
        this.opts.drafts.setAbsoluteInset(el, left, top)
      } else {
        if (TOUCHES_W.has(handle)) this.opts.drafts.apply(el, 'left', `${left}px`)
        if (TOUCHES_N.has(handle)) this.opts.drafts.apply(el, 'top', `${top}px`)
      }
    }
    this.opts.onEdited()
  }
}
