/* t3-fork: findSelectableElement (was findTaggedElement) — untagged elements are draggable in native-source mode. */
import { findSelectableElement, type TaggedElement } from './source'
import type { DraftStore } from './drafts'
import { marginEdgeOffsets } from './panel-readers'

/** The parent's MAIN axis, as a physical direction. Deliberately NOT four values: `row-reverse`
 * is still the horizontal axis for every geometric question the caller asks (which coordinate
 * do I hit-test, which way does the indicator point), and the one place reversal actually
 * matters — mapping a visual slot back to a DOM index — reads it from the parent itself
 * (see `visuallyReversed` below). Keeping reversal out of this type is what stops every
 * consumer from having to `.startsWith('row')` its way around four cases. */
export type Axis = 'row' | 'column'

/** Arrow-key direction for `reorderStep`. Physical, not axis-relative — the controller passes
 * the key the user actually pressed and this module maps it against the real axis. */
export type ReorderDir = 'left' | 'right' | 'up' | 'down'

/** Pointer travel (VIEWPORT px) before a press becomes a drag. Deliberately unscaled: this is
 * a "did the user's hand move" test about the input device, not about page geometry — dividing
 * by `scale()` would make the arming distance depend on the canvas zoom (at 400% a single page
 * pixel of intent would arm a drag, at 10% the user would have to travel 40 real px). Under the
 * threshold nothing happens at all and index.ts's existing click path selects exactly as it does
 * today, which is also why `onPointerDown` must NOT preventDefault. */
export const DRAG_THRESHOLD_PX = 4

export interface InsertGap {
  left: number
  top: number
  width: number
  height: number
}

// The reorderable-children basis is DraftStore.reorderBasis() (drafts.ts), never a hand-rolled
// filter here: `applyMove`'s `toIndex`, this module's returned index, the `order` preview and the
// verifier's DOM-index check are all indices into that ONE list (the P3 review's finding 12 first
// promoted `styleableChildren` out of drafts.ts for exactly that reason; PR #46's major 5 then
// showed the shared list also has to drop the request's own tombstones — see THE TWO LISTS on
// reorderTargetFor below for why, and why the verifier still reads the raw styleableChildren).

/**
 * THE drag gate (ratified #1): drag-to-reorder is armed only for flex/grid parents, because the
 * `order` preview only works there and a preview that can't show the result is worse than no
 * drag at all. Block/inline/table/anything else → null, and the gesture never starts.
 *
 * Flex reports its own axis. Grid has no `flex-direction`, so `grid-auto-flow` is the honest
 * signal: it is literally "which way do auto-placed items advance", i.e. the direction DOM order
 * runs in — `row` (the CSS default, and jsdom's '') advances along a row, so the horizontal axis;
 * `column`/`column dense` advances down a column. KNOWN LIMIT, documented rather than guessed
 * around: a multi-line grid (or a wrapped flex row) is hit-tested as one linear strip along this
 * axis, so two cells in the same column of different rows are indistinguishable to
 * `reorderTargetFor`. The single-axis rule is what the plan specifies; a 2-D reading-order
 * heuristic would need real layout to be worth anything and jsdom can't test it.
 */
export function reorderAxisOf(parent: Element | null): Axis | null {
  if (!parent) return null
  const cs = getComputedStyle(parent)
  const display = cs.display
  if (display === 'flex' || display === 'inline-flex') {
    return cs.flexDirection.startsWith('column') ? 'column' : 'row'
  }
  if (display === 'grid' || display === 'inline-grid') {
    return cs.gridAutoFlow.trim().startsWith('column') ? 'column' : 'row'
  }
  return null
}

/**
 * True when the parent lays its children out BACKWARDS along `axis` — i.e. DOM order runs
 * against the coordinate we hit-test with. Two independent sources, and they cancel each other:
 * `*-reverse` on flex-direction, and `direction: rtl`, which flips the inline (row) axis for
 * flex AND grid alike. A `column` axis is never affected by writing direction.
 *
 * This is read from the parent rather than encoded in `Axis` on purpose (see Axis's doc), and it
 * has to come from the DECLARED style rather than be sniffed from the rects: with exactly one
 * non-dragged sibling there is no pair of rects to compare, yet the answer still changes the
 * index by one — that is precisely the two-child case the demo app is full of.
 */
function visuallyReversed(parent: Element, axis: Axis): boolean {
  const cs = getComputedStyle(parent)
  const flexReverse = cs.flexDirection.endsWith('-reverse')
  if (axis === 'column') return flexReverse
  return flexReverse !== (cs.direction === 'rtl')
}

function mid(rect: DOMRect, axis: Axis): number {
  return axis === 'row' ? rect.left + rect.width / 2 : rect.top + rect.height / 2
}

/**
 * "This sibling generates no box at all", i.e. there is no geometry to hit-test it by — the
 * ALL-ZERO rect a `display: none` element reports (PR #46 review, major 6). Such a sibling must be
 * counted in the index basis and skipped by the hit test; see THE TWO LISTS below.
 *
 * Read off the rect the caller already took rather than from `getComputedStyle(sib).display`, for
 * two reasons: this runs per sibling per pointermove and a computed-style read per sibling per tick
 * is the expensive half, and `display: none` is only ONE of the ways to generate no box
 * (`content-visibility: hidden`, a `<template>`-like subtree, an ancestor's own none) — the rect is
 * the honest answer for all of them. `visibility: hidden` deliberately does NOT match: it still
 * occupies its slot, still has a real rect, and must still be hit-tested.
 *
 * The left/top terms are load-bearing: a rendered element CAN legitimately be 0×0 (an empty flex
 * child), and it still has a real position to compare a pointer against. Only the degenerate
 * rect that is zero in every term is treated as "no box". A genuinely rendered 0×0 element sitting
 * exactly at the viewport origin is the one false positive, and it costs a slot's worth of
 * precision in a case with no visible target to aim at anyway.
 */
function unrendered(rect: DOMRect): boolean {
  return rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0
}

/** The indicator's box: the gap BETWEEN the two siblings the element would land between,
 * spanning their union on the cross axis. A zero-thickness gap (dropping at the very start or
 * end of the list, or between siblings with no gap at all) is returned as width/height 0 sitting
 * exactly on the shared edge — the controller's stylesheet paints a centered bar inside this box
 * (`::before` at 50%), so a zero-thickness box still renders as a line on the right edge instead
 * of vanishing. */
function gapBetween(before: DOMRect | null, after: DOMRect | null, axis: Axis): InsertGap {
  // At least one side always exists (the caller guarantees a non-empty sibling list), so the
  // main-axis span collapses to the lone edge when the slot is at the head or the tail.
  const mainStart = (r: DOMRect): number => (axis === 'row' ? r.left : r.top)
  const mainEnd = (r: DOMRect): number => (axis === 'row' ? r.right : r.bottom)
  const crossStart = (r: DOMRect): number => (axis === 'row' ? r.top : r.left)
  const crossEnd = (r: DOMRect): number => (axis === 'row' ? r.bottom : r.right)
  const rects = [before, after].filter((r): r is DOMRect => r !== null)
  const start = before ? mainEnd(before) : mainStart(after as DOMRect)
  const end = after ? mainStart(after) : start
  // Clamped rather than signed: siblings can overlap (negative margins, a transform), and a
  // negative-width box would paint nothing at all.
  const thickness = Math.max(0, end - start)
  const cross0 = Math.min(...rects.map(crossStart))
  const cross1 = Math.max(...rects.map(crossEnd))
  return axis === 'row'
    ? { left: start, top: cross0, width: thickness, height: cross1 - cross0 }
    : { left: cross0, top: start, width: cross1 - cross0, height: thickness }
}

/**
 * Pure: the insertion index the pointer implies, plus the gap rect to draw the indicator in.
 * Returns null when there is nothing to reorder against (`dragged` isn't in `basis`, it is the only
 * entry, or no other entry generates a box to aim at).
 *
 * `basis` is supplied by the caller — DraftStore.reorderBasis(parent) — and is deliberately a
 * REQUIRED parameter rather than defaulted to `styleableChildren(parent)`: a caller that forgets it
 * would silently hit-test in a different basis than `applyMove` writes, which is precisely the
 * off-by-one class of bug this whole comment block exists to prevent.
 *
 * ALL VIEWPORT SPACE, and deliberately NO `/scale()` division anywhere: `getBoundingClientRect()`
 * is already canvas-transformed and so are `pointer.x/y` (they come straight off a PointerEvent's
 * clientX/clientY), so the two are directly comparable. Only the absolute free-drag divides, and
 * only because it converts a pointer DELTA into a page-space `left`/`top` value. That asymmetry
 * is the trap this comment exists for.
 *
 * ── THE TWO LISTS (PR #46 review, majors 5 + 6 — filed separately, ONE question) ──
 * "What is the move index basis?" has exactly one answer, and the AGENT sets it, because the op's
 * `toIndex` is an instruction about JSX children:
 *   • the agent counts every element child, INCLUDING page-authored hidden ones — a `display:none`
 *     div is still a JSX child, so a basis that omits it names a different slot than the user aimed
 *     at;
 *   • the agent does NOT count a child the same request DELETES — that child is gone by the time
 *     the reorder lands. Counting it ships an index one too high, and (via ops.ts's `anchorFor`,
 *     which reads the draft's own sibling list) can even name the doomed element as the anchor:
 *     "reorder so it comes immediately after <B>" inside a request that also says to delete <B>.
 *     Post-apply the basis no longer contains B either, so the verifier's index oracle would then
 *     be measured in a different basis than the one that was sent — a systematic false MISMATCH on
 *     a perfectly correct apply (major 5).
 * So the basis is **all styleable element children MINUS the ones this request is deleting**, which
 * is what DraftStore.reorderBasis() returns and is exactly what the raw `styleableChildren` reads
 * POST-apply — which is why the verifier needs no change: by then the tombstone is gone from source.
 *
 * That basis is NOT the list this function can hit-test, and conflating the two WAS major 6: a
 * sibling with no box has an all-zero rect, so `mid = 0 < pointer.x` counted it as "preceding"
 * regardless of its DOM slot. Every hidden sibling sitting DOM-after the drop point inflated the
 * index by one — the preview showed no change (the drop looked silently ignored) while the op
 * shipped the wrong `toIndex` — and `gapBetween` straddled a rect at (0,0), stretching the
 * indicator toward the viewport origin. Two lists, one explicit mapping:
 *   list 1 — `rest`: the basis minus the dragged element. THE RETURNED INDEX IS AN INDEX INTO THIS.
 *   list 2 — `hittable`: the subsequence of list 1 that actually generates a box (see `unrendered`),
 *            each entry carrying its POSITION IN LIST 1.
 * THE MAPPING: only list 2 has geometry, so the pointer's slot is resolved there (how many hittable
 * siblings has it cleared?) and then translated into list 1's coordinates by landing immediately
 * AFTER the last hittable sibling cleared: `hittable[passed - 1].pos + 1`, or 0 when none were
 * cleared. Un-hittable siblings between that anchor and the next hittable one therefore stay on the
 * far side of the drop — the only choice that keeps the answer (and `anchorFor`'s anchor) pinned to
 * a sibling the user could actually see and aim at. In a fully-rendered list the two lists coincide
 * and this reduces exactly to the plain `count(precedes)` it replaced, so the worked examples below
 * are unchanged.
 *
 * ── THE INDEX BASIS (the off-by-one that ships a wrong instruction if it's wrong) ──
 * The returned `index` is the element's FINAL index in that basis — exactly `applyMove`'s
 * `toIndex`, which has lift-out-then-insert semantics: the
 * dragged element is REMOVED first, then spliced into the remaining list at `toIndex`
 * (drafts.ts's `moveSequence`). It is NOT an insertion index in original-list coordinates.
 * So the computation is simply "how many of the OTHER siblings end up before it" — read through the
 * mapping above, over the list with the dragged element excluded.
 *
 *   Example A — [A,B,C], drag A to "before C". rest = [B,C]. The pointer sits past B's midpoint
 *   and short of C's, so count = 1 → index 1. Result [B,A,C]; A's final index IS 1, NOT 2.
 *   Example B — [A,B,C], drag A to the very end. rest = [B,C], pointer past both → count = 2 →
 *   index 2. Result [B,C,A]; A's final index is 2 (= n-1, the top of applyMove's own clamp).
 *   Example C — [A,B,C], drag B and drop it back where it started. rest = [A,C], pointer past A
 *   only → count = 1 = fromIndex, so applyMove collapses the draft to nothing.
 *
 * Reversal (`row-reverse` / rtl) flips which side of the pointer counts, NOT the resulting basis:
 * the non-dragged siblings keep their relative DOM order under both a reversed layout and an
 * in-flight `order` preview (moveSequence only relocates the dragged element), so counting the
 * ones on the far side of the pointer yields the same DOM-order splice index directly.
 */
export function reorderTargetFor(
  parent: Element,
  dragged: Element,
  pointer: { x: number; y: number },
  axis: Axis,
  basis: readonly TaggedElement[]
): { index: number; gap: InsertGap } | null {
  if (!basis.includes(dragged as TaggedElement)) return null
  // LIST 1 — positions in here are what `index` means. A sibling that cannot be hit-tested still
  // occupies its slot, because the agent still counts it in the JSX (see THE TWO LISTS).
  const rest = basis.filter((sib) => sib !== dragged)
  if (rest.length === 0) return null
  // LIST 2 — the hit-testable subsequence, each entry remembering its list-1 position so the
  // mapping back is a lookup and not a re-derivation.
  const hittable = rest
    .map((sib, pos) => ({ pos, rect: sib.getBoundingClientRect() }))
    .filter((entry) => !unrendered(entry.rect))
  // Nothing with geometry to aim at (every other sibling is hidden): no slot, no indicator, and
  // deliberately no draft — an index invented from no visual evidence is the wrong instruction.
  if (hittable.length === 0) return null

  const reversed = visuallyReversed(parent, axis)
  const coord = axis === 'row' ? pointer.x : pointer.y
  // `precedes` is what the reversal flips: forward layouts count siblings the pointer has
  // already passed, reversed layouts count the ones it hasn't reached yet. Either way the cleared
  // set is a PREFIX of list 2 in DOM order (under reversal, "visually beyond the pointer" IS the
  // DOM prefix), which is what makes `hittable[passed - 1]` the last one cleared in both.
  const precedes = (rect: DOMRect): boolean => (reversed ? mid(rect, axis) > coord : mid(rect, axis) < coord)
  const passed = hittable.filter((entry) => precedes(entry.rect)).length
  const index = passed === 0 ? 0 : hittable[passed - 1].pos + 1

  // The visual neighbours of that slot — the pair the indicator straddles, and only ever a pair
  // that HAS geometry. In a reversed layout the visual list is list 2 backwards, so the slot
  // number flips with it.
  const visual = reversed ? hittable.toReversed() : hittable
  const slot = reversed ? hittable.length - passed : passed
  return { index, gap: gapBetween(visual[slot - 1]?.rect ?? null, visual[slot]?.rect ?? null, axis) }
}

export interface MoveDragOpts {
  drafts: DraftStore
  /** canvas.scale() — divides the absolute free-drag's pointer deltas ONLY (see the asymmetry
   *  note on reorderTargetFor). Reorder hit-testing never touches it. */
  scale: () => number
  /** Caller policy — true when another gesture owner (text-edit, canvas, a modifier-gated
   *  mode) has claimed this pointerdown, so this module must not compete for it. Takes the
   *  press itself because policy may live on the event's own modifiers rather than tracked
   *  keyboard state. */
  blocked: (e: PointerEvent) => boolean
  overlayContains: (t: EventTarget | null) => boolean
  /** Crossing the threshold selects the element, Figma-style. */
  onSelect: (el: TaggedElement) => void
  /** index.ts's post-edit refresh path. */
  onEdited: () => void
}

/** Reorder inside an auto-layout parent — the parent, axis AND index basis are frozen at
 *  pointerdown (nothing moves DOM nodes or mints a delete draft mid-drag, so none of the three can
 *  change). Carrying the basis is what keeps the hit test and `applyMove` in ONE basis for the whole
 *  gesture (PR #46 review, majors 5 + 6). */
interface ReorderPlan {
  mode: 'reorder'
  parent: Element
  axis: Axis
  basis: readonly TaggedElement[]
}

/** Free 2-D drag of an out-of-flow element. `viaDraft` picks WHICH write path (see planFor). */
interface FreePlan {
  mode: 'free'
  viaDraft: boolean
  left: number
  top: number
}

type DragPlan = ReorderPlan | FreePlan

/** composedPath()[0] over e.target — shadow DOM retargets, so a press inside the overlay's own
 *  shadow tree reports the HOST as e.target and `overlayContains` (containsDeep) would never
 *  match it. Same convention as canvas.ts's realTarget and ui/menu. */
function realTarget(e: Event): EventTarget | null {
  return e.composedPath?.()[0] ?? e.target
}

/** The page-level properties this module suppresses text selection with. Deliberately NOT `cursor`:
 *  index.ts owns `documentElement.style.cursor` (the no-drop affordance) and canvas.ts writes it too
 *  for its grab cursors, so a third writer on that one property would fight them (PR #46 review's
 *  explicit constraint). `user-select` has no other writer anywhere in src/client — the overlay's
 *  own `user-select: none` rules live inside the shadow stylesheet (overlay.ts), which cannot reach
 *  `<html>`. The `-webkit-` alias rides along for Safari < 17; jsdom silently drops it, which is
 *  harmless in both directions because save and restore are symmetric. */
const SELECT_PROPS = ['user-select', '-webkit-user-select'] as const

/**
 * Suppresses native HTML drag-and-drop for the duration of one gesture, and returns its teardown.
 *
 * THE E2E-CLASS GAP (PR #46 review): dragging an `<img>` or an `<a href>` flex child starts a native
 * drag, and the browser fires `pointercancel` at us the moment it does — so images and links in a
 * gallery row were simply not reorderable, with no error and no indicator. `onPointerDown`
 * deliberately never preventDefault()s (a sub-threshold press must stay an ordinary click for
 * index.ts's click-to-select path), and nothing substituted once the threshold crossed.
 *
 * Armed at POINTERDOWN, not at the threshold, and that is load-bearing: the browser starts a native
 * drag after a couple of pixels of travel — i.e. BEFORE our 4px threshold — so a preventer armed at
 * the crossing would arrive after the `pointercancel` that already killed the gesture. Cancelling
 * `dragstart` is not the same thing as cancelling `pointerdown`: the click path is untouched by it.
 */
function preventNativeDrag(): () => void {
  const onDragStart = (e: Event): void => {
    e.preventDefault()
    e.stopPropagation()
  }
  document.addEventListener('dragstart', onDragStart, true)
  return () => document.removeEventListener('dragstart', onDragStart, true)
}

/**
 * Defeats live text selection for the duration of a drag, and returns its teardown.
 *
 * The other half of the E2E-class gap: a drag across text-bearing elements painted a live selection
 * over the page (seen in the P3 live E2E screenshot). Armed at the THRESHOLD rather than at
 * pointerdown, so a press that never becomes a drag leaves the user's ordinary ability to select
 * text in the app completely alone.
 *
 * `user-select: none` only stops the selection from GROWING, so the couple of px selected before the
 * threshold are collapsed once, here. Save/restore is the house verbatim idiom (canvas.ts's style
 * stash, margin-push.ts's saved margin): whatever inline value the page itself had on `<html>` comes
 * back byte-for-byte, and an absent property is removed rather than set to ''.
 */
function suppressSelection(): () => void {
  const root = document.documentElement
  const saved = SELECT_PROPS.map((prop) => [prop, root.style.getPropertyValue(prop)] as const)
  for (const prop of SELECT_PROPS) root.style.setProperty(prop, 'none')
  window.getSelection()?.removeAllRanges()
  return () => {
    for (const [prop, value] of saved) {
      if (value) root.style.setProperty(prop, value)
      else root.style.removeProperty(prop)
    }
  }
}

/**
 * Figma-style move: drag a child to reorder it inside its auto-layout parent (with a live
 * insertion indicator), or drag an out-of-flow element freely. Its own overlay chrome
 * (`.insert-indicator`) and its own ONE capture-phase pointerdown listener — nothing exists
 * until `start()` (zero idle overhead is a hard product constraint).
 *
 * Deliberately registered on `document` capture, not `window`: canvas.ts's pan triggers listen on
 * window capture and `stopPropagation()` themselves, so a space-drag or middle-drag is already
 * consumed before this handler is reached. `blocked()` is the belt to that braces.
 */
export class MoveDrag {
  root: HTMLElement

  private active = false
  private dragging = false

  /** Per-gesture write memo: the last index / inset actually pushed into the store, so a
   *  pointermove that resolves to the same target costs nothing. `applyMove`/`setAbsoluteInset`
   *  already no-op on an unchanged value, but `onEdited()` does not — it refreshes the panel and
   *  re-measures the outlines, which at pointermove rate is the expensive half. */
  private lastIndex = -1
  private lastInset: { left: number; top: number } | null = null

  /** Live drag teardown, same idiom as CanvasMode.dragTeardown (canvas.ts) — lets stop() kill an
   *  in-flight drag's window listeners. Without it a mid-drag stop() (design mode toggled off)
   *  leaves them alive and the next pointermove drafts a move on a page the overlay left. */
  private dragTeardown: (() => void) | null = null

  /** The armed once:true click squelch, tracked for the same reason CanvasMode and ResizeHandles
   *  track theirs: a squelch that never consumed (design mode went off before the browser's click
   *  landed) must not outlive the gesture, or it eats one unrelated page click later. */
  private clickSquelch: ((e: MouseEvent) => void) | null = null

  constructor(private opts: MoveDragOpts) {
    this.root = document.createElement('div')
    this.root.className = 'insert-indicator'
    this.root.hidden = true
  }

  /** Zero idle overhead (hard product constraint): no listener exists until this is called. */
  start(): void {
    if (this.active) return
    this.active = true
    document.addEventListener('pointerdown', this.onPointerDown, true)
    window.addEventListener('blur', this.onBlur)
  }

  /** Idempotent, tears down an in-flight drag, and hides the indicator — stop() is what
   *  design-mode-off calls, and an insertion bar left painted over a page with no overlay on it
   *  is the same class of bug as a selection outline hugging a tombstone. */
  stop(): void {
    if (!this.active) return
    this.active = false
    this.dragTeardown?.()
    this.hideIndicator()
    document.removeEventListener('pointerdown', this.onPointerDown, true)
    window.removeEventListener('blur', this.onBlur)
    if (this.clickSquelch) {
      window.removeEventListener('click', this.clickSquelch, true)
      this.clickSquelch = null
    }
  }

  /** True from the moment the 4px threshold is crossed until the pointer is released. The
   *  TRAILING click is not covered by this (it fires after release) — that one is eaten by the
   *  once:true squelch armed in finish(). */
  isDragging(): boolean {
    return this.dragging
  }

  /**
   * Would a press on `el` arm a drag at all? THE predicate behind the controller's no-drop cursor
   * affordance (ratified #1: outside an auto-layout parent the drag doesn't start, and the user is
   * told so) — exposed rather than re-derived because index.ts's own gate used to check only
   * `reorderAxisOf(el.parentElement)`, which disagreed with this module in BOTH directions
   * (PR #46 review, major 7 + minor 3):
   *
   * - false negative: an out-of-flow element free-drags fine regardless of its parent's display,
   *   so `absolute right-4` inside a plain block parent dragged correctly while the page sat under
   *   `cursor: not-allowed` for the whole gesture;
   * - false positive: a flex parent with only one styleable child, or a text-drafted element, has
   *   an auto-layout parent but `planFor` still bails — a dead press with zero feedback, which is
   *   the exact case the affordance exists to prevent.
   *
   * This is the divergent-predicate class this module's own writeInset comment warns about, so the
   * cursor gate is now literally `!wouldDrag(el)`. One owner: planFor.
   */
  wouldDrag(el: TaggedElement): boolean {
    return this.planFor(el) !== null
  }

  /**
   * The arrow-key verb (ratified #2): move the element ±1 sibling along its parent's MAIN axis.
   * Returns false — never throws, never silently no-ops — when there is no move to make, so the
   * controller can decide whether to preventDefault: no auto-layout parent (the ratified #1 gate
   * again), a cross-axis direction, another structural kind already owning the element, or
   * already at the end of the range. Cross-axis routing (an absolute element's X/Y nudge) is the
   * controller's business; this method only ever reorders.
   */
  reorderStep(el: TaggedElement, dir: ReorderDir): boolean {
    const parent = el.parentElement
    const axis = reorderAxisOf(parent)
    if (!parent || !axis) return false
    const along = axis === 'row' ? dir === 'left' || dir === 'right' : dir === 'up' || dir === 'down'
    if (!along) return false
    // One structural draft per element (drafts.ts's blockedByOtherStructural): applyMove would
    // refuse a tombstoned / text-edited / absolute-drafted element, so report "not handled"
    // instead of pretending the key did something.
    const s = this.opts.drafts.structuralOf(el)
    if (s && s.kind !== 'move') return false
    // Same basis as the drag and as applyMove — reorderBasis, never a raw styleableChildren read
    // (majors 5 + 6): a tombstoned sibling must not lend the range an extra step either.
    const siblings = this.opts.drafts.reorderBasis(parent)
    const fromIndex = siblings.indexOf(el)
    if (fromIndex === -1 || siblings.length < 2) return false
    // A reversed parent lays DOM order out backwards, so the key the user pressed points the
    // other way through the index basis — pressing Right in a `row-reverse` row visibly moves
    // the element right, which is one step EARLIER in the DOM.
    const forward = dir === 'right' || dir === 'down'
    const sign = (forward ? 1 : -1) * (visuallyReversed(parent, axis) ? -1 : 1)
    // Step from where the element currently APPEARS, not from its DOM index: with a live move
    // draft the preview already relocated it, and stepping from the DOM index would make the
    // second arrow press undo the first.
    const base = s?.kind === 'move' ? s.toIndex : fromIndex
    const next = base + sign
    if (next < 0 || next > siblings.length - 1) return false
    this.opts.drafts.applyMove(el, next)
    this.opts.onEdited()
    return true
  }

  /**
   * The OTHER arrow-key verb (ratified #2): nudge an out-of-flow element's inset by `dx`/`dy`
   * page px. Returns false when the element isn't free-draggable, so the controller's key handler
   * can fall through to reorderStep and then to "not ours" with one predicate per branch.
   *
   * Lives here rather than in index.ts specifically so the free-drag routing has ONE owner:
   * `planFor` already decides draft-inset vs plain-css-inset vs not-free-at-all, and a second
   * copy of that three-way decision in the key handler is exactly the divergence the task-6
   * review flagged between this module and panel-specs' positionStateOf (a keyboard nudge that
   * disagreed with a mouse drag about which mechanism owns `left` would mint two competing
   * asks for one element). No `scale()` division here — a keystroke is already in page px,
   * unlike a pointer delta.
   */
  nudge(el: TaggedElement, dx: number, dy: number): boolean {
    const plan = this.planFor(el)
    if (!plan || plan.mode !== 'free') return false
    this.writeInset(el, plan, plan.left + dx, plan.top + dy) // writeInset fires onEdited itself
    return true
  }

  private onBlur = (): void => {
    // Backstop for a pointerup delivered to a different window entirely (Cmd+Tab mid-drag) —
    // same rationale as CanvasMode.onBlur: with the pointer gone no pointermove arrives either,
    // so onMove's own buttons===0 self-heal can never fire.
    this.dragTeardown?.()
  }

  /**
   * Which drag (if any) this element gets. Returning null means the gesture never arms at all —
   * the ratified no-drop case — rather than arming a drag that provably cannot mint a draft.
   */
  private planFor(el: TaggedElement): DragPlan | null {
    const drafts = this.opts.drafts
    const s = drafts.structuralOf(el)
    // ONE structural draft per element is the data model: applyMove/applyAbsolute REFUSE an
    // element another kind already owns (drafts.ts's blockedByOtherStructural), so a drag on a
    // tombstone or a text-edited element would silently do nothing. Bail before arming.
    if (s && s.kind !== 'move' && s.kind !== 'absolute') return null
    if (s?.kind === 'absolute') {
      // `on: false` is the absolute→static direction: the element is drafted back INTO flow, so
      // there is no inset to move (setAbsoluteInset is a no-op for it) and a move draft would be
      // refused as a second kind. No gesture rather than a dead one.
      if (!s.on) return null
      // An `on: true` absolute draft owns position/left/top end-to-end — its inset moves through
      // setAbsoluteInset, which keeps the ONE structural op coherent (ratified #4).
      return { mode: 'free', viaDraft: true, left: s.left, top: s.top }
    }
    const position = drafts.current(el, 'position') ?? getComputedStyle(el).position
    if (position === 'absolute' || position === 'fixed') {
      // Already absolute IN THE CODE with no absolute draft — the ratified routing (delegated
      // call #2) is plain `left`/`top` css drafts, no structural op and no parent edit. This arm
      // must NOT reach for setAbsoluteInset, which is deliberately draft-only and would no-op.
      //
      // The seed is measured through the store's prior-state oracle (`measureAtPagePrior`), not off
      // the live DOM (PR #46 review, minor 5 — the same family as the ratified capture-through-
      // preview invariant, drafts.ts's PriorOracle). `elementOffsets` is offsetParent-relative, and
      // a SIBLING's absolute draft previews `position: relative` on the shared parent, which makes
      // that parent the offsetParent for THIS element too. When our `left` is `auto` in the code —
      // `absolute right-4`, or a bare `absolute` — the element does not visibly move but its
      // offsetLeft jumps by the parent's own offset within the real containing block, so the seed
      // (and every `left` the drag then writes) was off by that amount. Neutralizing our own
      // preview first reads the number the code's `left` actually resolves against.
      //
      // And the read is marginEdgeOffsets, NOT elementOffsets: `left`/`top` place the element's
      // MARGIN edge while offsetLeft/offsetTop report its BORDER edge, so a dragged element with
      // an `ml-*`/`mt-*` utility would be seeded — and then written — off by its own margin
      // (PR #46 review, major 2). The two fixes for this compose: the oracle says WHEN to measure,
      // marginEdgeOffsets says in WHICH basis. resize.ts's startBoxOf and panel-specs' X/Y read use
      // the same basis; all three must agree or a drag and a typed value fight each other.
      const offsets = drafts.measureAtPagePrior(el, () => marginEdgeOffsets(el))
      return {
        mode: 'free',
        viaDraft: false,
        left: Number.parseFloat(drafts.current(el, 'left') ?? String(offsets.x)) || 0,
        top: Number.parseFloat(drafts.current(el, 'top') ?? String(offsets.y)) || 0,
      }
    }
    const parent = el.parentElement
    const axis = reorderAxisOf(parent)
    if (!parent || !axis) return null // ratified #1: no flex/grid parent, no drag at all
    const basis = drafts.reorderBasis(parent)
    if (basis.length < 2) return null // nothing to reorder against
    return { mode: 'reorder', parent, axis, basis }
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Left button only. Middle is canvas.ts's pan (and its window-capture handler has already
    // stopped propagation by the time we'd see it), right is the context menu's.
    if (e.button !== 0) return
    if (this.opts.blocked(e)) return
    const target = realTarget(e)
    if (this.opts.overlayContains(target)) return
    const el = findSelectableElement(target instanceof Element ? target : null)
    if (!el) return
    // ONE gesture in flight at a time (PR #46 review, minor 6). There is a single `dragTeardown`
    // slot per instance, so a second pointer's press used to OVERWRITE the first gesture's teardown
    // and orphan its window listeners: stop() could no longer reach them, and they kept writing
    // drafts on a page the overlay had already left — a zero-idle-overhead violation (hard product
    // constraint). Touch/pen-only in practice, mechanically real. The in-flight pointer keeps the
    // gesture and the newcomer is ignored entirely; `finish()` clears the slot, so a completed
    // gesture never blocks the next press. (ResizeHandles carries the same guard for its own
    // gesture — same spirit, deliberately not shared code across the two modules.)
    if (this.dragTeardown) return
    const plan = this.planFor(el)
    if (!plan) return

    // NO preventDefault / stopPropagation here, on purpose: under the 4px threshold this press
    // must remain an ordinary click and reach index.ts's click-to-select path untouched. Native
    // drag-and-drop is suppressed by cancelling `dragstart` instead — see preventNativeDrag.
    const releaseNativeDrag = preventNativeDrag()
    let releaseSelection: (() => void) | null = null
    const downX = e.clientX
    const downY = e.clientY
    // The drag belongs to ONE pointer — on pen/touch hardware a second pointer's stream
    // interleaves with it, and a hovering pen reports buttons===0 on its own moves, which would
    // trip the self-heal below and silently end a live mouse drag (canvas.ts's lesson).
    const dragPointerId = e.pointerId
    this.lastIndex = -1
    this.lastInset = null
    let crossed = false

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== dragPointerId) return
      // Self-heal a lost pointerup/pointercancel (canvas.ts's onMove idiom): an app-switch
      // mid-drag can deliver the release to a different window, so this gesture never sees
      // pointerup — the next pointermove we DO get still reports the live button state.
      if (ev.buttons === 0) {
        finish(false)
        return
      }
      const dx = ev.clientX - downX
      const dy = ev.clientY - downY
      if (!crossed) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        crossed = true
        this.dragging = true
        // The threshold is where a press becomes a drag, so it is where live text selection stops
        // being wanted (see suppressSelection). Every teardown path funnels through finish(), which
        // is what guarantees the verbatim restore.
        releaseSelection = suppressSelection()
        // Figma-style: the drag takes the element over, so it becomes THE selection. index.ts's
        // select() is idempotent, so no `isSelected` opt has to be threaded in just to skip it.
        this.opts.onSelect(el)
      }
      if (plan.mode === 'free') this.writeFree(el, plan, dx, dy)
      else this.writeReorder(el, plan, ev.clientX, ev.clientY)
    }

    const finish = (installSquelch: boolean): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      // THE single teardown funnel — pointerup, pointercancel, the buttons===0 self-heal, blur and
      // stop() all arrive here, which is why the page-level suppressions are released in exactly
      // one place. Idempotent: a second finish() (blur then a late pointerup) sees them nulled.
      releaseNativeDrag()
      releaseSelection?.()
      releaseSelection = null
      this.dragTeardown = null
      this.dragging = false
      this.hideIndicator()
      // The click that follows a drag would land as a click-to-select — squelch exactly one,
      // canvas.ts's proven once:true idiom. Nothing is armed for a press that never crossed the
      // threshold (that click is exactly the selection the user asked for) or for pointercancel /
      // a forced teardown, where the browser never fires a click for this gesture at all.
      if (installSquelch && crossed) {
        // A prior drag's squelch that never consumed must not accumulate as an orphan only the
        // tracked reference can reach — disarm before arming, so at most one ever exists.
        if (this.clickSquelch) window.removeEventListener('click', this.clickSquelch, true)
        const squelch = (ce: MouseEvent): void => {
          ce.stopPropagation()
          ce.preventDefault()
          this.clickSquelch = null // consumed — the once:true listener already removed itself
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

  private writeReorder(el: TaggedElement, plan: ReorderPlan, x: number, y: number): void {
    const target = reorderTargetFor(plan.parent, el, { x, y }, plan.axis, plan.basis)
    if (!target) {
      this.hideIndicator()
      return
    }
    // The indicator tracks the pointer even when the index didn't change (the gap it straddles
    // moves as the live `order` preview reflows the siblings), but the store write and the
    // onEdited refresh are memoized on the index.
    this.showIndicator(target.gap, plan.axis)
    if (target.index === this.lastIndex) return
    this.lastIndex = target.index
    this.opts.drafts.applyMove(el, target.index)
    this.opts.onEdited()
  }

  private writeFree(el: TaggedElement, plan: FreePlan, dx: number, dy: number): void {
    // The ONE place a pointer delta is divided by the canvas scale: this converts viewport
    // travel into a page-space `left`/`top` VALUE, unlike reorder hit-testing which compares
    // two already-transformed viewport quantities (see reorderTargetFor's asymmetry note).
    const scale = this.opts.scale() || 1
    this.writeInset(el, plan, Math.round(plan.left + dx / scale), Math.round(plan.top + dy / scale))
  }

  /** The single inset writer, shared by the pointer drag and the keyboard nudge — which
   *  mechanism owns `left`/`top` (the structural draft's inset vs plain css drafts) is decided
   *  once, in planFor, and executed once, here. Two copies would let a nudge and a drag mint
   *  competing asks for the same element (task-6 review's divergent-predicate finding).
   *  `lastInset` memoizes per gesture (pointerdown resets it), so a pointermove that resolves to
   *  the same rounded px costs nothing; a nudge re-reads its base through planFor every call, so
   *  successive keypresses always advance. */
  private writeInset(el: TaggedElement, plan: FreePlan, left: number, top: number): void {
    if (this.lastInset && this.lastInset.left === left && this.lastInset.top === top) return
    this.lastInset = { left, top }
    if (plan.viaDraft) {
      // KNOWN LIMIT, deliberately not worked around here: the structural `absolute` draft owns
      // exactly `position`/`left`/`top` (drafts.ts's ABSOLUTE_PROPS) and its verify oracle
      // (`expected`, minted in ops.ts) asserts that same trio, so this direction cannot defeat an
      // opposing inset without widening both — and the static→absolute transition is the case where
      // a page-authored `right`/`bottom` is least likely (they have no effect on a static element,
      // so nobody writes them there). If a real page proves otherwise, the fix is ABSOLUTE_PROPS +
      // `expected`, not a second inset writer here.
      this.opts.drafts.setAbsoluteInset(el, left, top)
    } else {
      // Defeat the OPPOSING inset before binding this one (PR #46 review, minor 4). An element that
      // is absolute in the code via `right-4`/`bottom-2` already has that edge bound: adding `left`
      // over-constrains the box, both edges pin, and the element stretches instead of moving — and
      // the agent then bakes the over-constrained pair into the source. Same shape of policy as
      // panel-specs' `defeatFillIfGrowing` (a write that cannot take effect unless a surviving
      // declaration is explicitly overridden must carry that override as part of the ask).
      this.defeatOpposingInset(el, 'right')
      this.defeatOpposingInset(el, 'bottom')
      this.opts.drafts.apply(el, 'left', `${left}px`)
      this.opts.drafts.apply(el, 'top', `${top}px`)
    }
    this.opts.onEdited()
  }

  /** Drafts `<prop>: auto` when — and only when — the page actually binds that edge, so a free drag
   *  never mints a no-op `auto → auto` change the pill would count. Idempotent across a gesture:
   *  once the draft exists, `current()` reports 'auto' and this returns immediately. */
  private defeatOpposingInset(el: TaggedElement, prop: 'right' | 'bottom'): void {
    const drafted = this.opts.drafts.current(el, prop)
    if (drafted !== null) return // already ours (either 'auto' from a prior tick, or a user's edit)
    const computed = getComputedStyle(el).getPropertyValue(prop)
    if (!computed || computed === 'auto') return
    this.opts.drafts.apply(el, prop, 'auto')
  }

  /** Inline geometry only — every other pixel of the indicator's look (thickness, colour,
   *  z-index, the centered `::before` bar keyed off `data-axis`) belongs to the controller's
   *  stylesheet, same division of labour as ResizeHandles. */
  private showIndicator(gap: InsertGap, axis: Axis): void {
    this.root.hidden = false
    this.root.dataset.axis = axis
    this.root.style.left = `${gap.left}px`
    this.root.style.top = `${gap.top}px`
    this.root.style.width = `${gap.width}px`
    this.root.style.height = `${gap.height}px`
  }

  private hideIndicator(): void {
    this.root.hidden = true
  }
}
