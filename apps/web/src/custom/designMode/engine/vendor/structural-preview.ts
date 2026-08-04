import type { TaggedElement } from './source'
import type { StructuralDraftKind } from './shared/structural-kinds'

// THE per-kind structural preview layer: what a structural draft IS, how each kind paints and
// un-paints itself, and every other per-kind fact about a preview (commit policy, which (node,
// prop) pairs it owns, which nodes it writes, which inline keys a verifier must strip, how it
// re-derives after a remount). Split out of structural-drafts.ts by the PR #47 review: that file
// had grown to 970 lines carrying BOTH this registry and the store that drives it, P4's ghost-node
// insert preview adds an arm here, and the two are cleanly separable — nothing below knows the
// store exists (it takes what it needs as parameters), which is why this module, like ops.ts, is a
// LEAF with type-only imports. Keep it that way: an import here is an import into every layer that
// previews.
//
// The STORE keeps the oracle's implementation (pagePrior/recordedParent) and every mint site on one
// object — that pairing is the invariant PriorOracle states below and must never be split. What
// moved is the interface and the pure capture helpers, which take the oracle as an argument, so a
// capture site still cannot exist without one.

/** A Figma-pivot structural draft (spec 2026-07-22 §2) — lives BESIDE the css map, never
 * inside it: a delete previews as inline `display:none` but must never surface as a
 * `display` property delta in a change request, and text isn't a css property at all. Same rule
 * for P3's two kinds: a move previews as inline `order` on every sibling and an absolute toggle
 * as inline `position`/`left`/`top` (plus `position: relative` on the parent), none of which are
 * the ask — the ask is "reorder the JSX" / "position this absolutely". */
export type StructuralDraft =
  | { kind: 'text'; original: string; value: string }
  | { kind: 'delete'; priorInlineDisplay: string }
  | {
      kind: 'move'
      /** Index among the parent's styleable element children, at draft time. */
      fromIndex: number
      /** The element's FINAL index once moved — the same basis the verifier reads. */
      toIndex: number
      /** EVERY sibling's prior inline `order`, saved verbatim — reordering one child requires
       * explicit `order` on all of them (default 0), and these writes must never surface as
       * `order` css deltas. Same save-the-page's-own-value-verbatim idiom as MarginPush. */
      priorOrder: Array<[TaggedElement, string]>
    }
  | {
      kind: 'absolute'
      on: boolean
      left: number
      top: number
      priorInline: { position: string; left: string; top: string }
      /** The parent the element is positioned against — carried by the draft (not re-read at
       * send time) because the op names it and the preview may write `position: relative` on
       * it. null when `on` is false: returning to flow needs no positioning context. */
      parent: AbsoluteParent | null
    }

/** The parent record an `absolute` draft carries (named because the prior-state oracle hands the
 * same record back out — see StructuralDraftStore.recordedParent). */
export type AbsoluteParent = { el: TaggedElement; priorInlinePosition: string; needsRelative: boolean }

/** The inline properties an `absolute` draft owns end-to-end. */
export const ABSOLUTE_PROPS = ['position', 'left', 'top'] as const

/** Write-or-remove an inline property. Exported because the css half of the store (drafts.ts)
 * restores its own recorded originals through the same verbatim rule. */
export function writeInline(el: TaggedElement, prop: string, css: string): void {
  if (css) el.style.setProperty(prop, css)
  else el.style.removeProperty(prop)
}

/** THE invariant every capture site below is built on (review findings 1-3, ONE rule):
 * **prior state is never captured from a node whose properties a live structural draft is
 * currently previewing.** `prior.inline(node, prop)` answers "what is the PAGE's own inline value
 * here", which is not what the DOM says while one of our own previews is sitting on it; see
 * StructuralDraftStore.pagePrior for why the answer comes from the owning draft's saved record
 * rather than from restoring/re-applying the DOM. */
export interface PriorOracle {
  inline: (node: TaggedElement, prop: string) => string
  /** An existing live record of `parent` as some absolute draft's positioning context, or null. */
  parentRecord: (parent: TaggedElement) => AbsoluteParent | null
}

export function capturePriorOrder(
  siblings: readonly TaggedElement[],
  prior: PriorOracle
): Array<[TaggedElement, string]> {
  return siblings.map((sib) => [sib, prior.inline(sib, 'order')] as [TaggedElement, string])
}

export function capturePriorInline(
  el: TaggedElement,
  prior: PriorOracle
): { position: string; left: string; top: string } {
  return {
    position: prior.inline(el, 'position'),
    left: prior.inline(el, 'left'),
    top: prior.inline(el, 'top'),
  }
}

/** The parent record for an `absolute` draft. `needsRelative` is COMPUTED-position driven: a
 * parent that already establishes a containing block (relative/absolute/fixed/sticky) must not
 * be touched — and must not be named as an edit in the ask (ratified #4). jsdom reports '' for
 * an unstyled element, which is `static` for our purposes.
 *
 * Both reads consult the prior oracle FIRST (review finding 3). When a live absolute draft already
 * records this same parent — including the outgoing draft healStructural is rebinding — that record
 * was taken from the untouched page, while `getComputedStyle` now reports the `relative` our own
 * preview wrote. Re-deriving through our own write answered "no positioning context needed" and
 * shipped an op that OMITS the parent edit, so after the agent applies the element's `absolute`
 * classes it positions against a distant ancestor and lands in the wrong place — a wrong
 * instruction to the agent, and the parent's verbatim restore was lost with it. */
export function parentRecordFor(parent: TaggedElement, prior: PriorOracle): AbsoluteParent {
  const recorded = prior.parentRecord(parent)
  if (recorded) {
    return { el: parent, priorInlinePosition: recorded.priorInlinePosition, needsRelative: recorded.needsRelative }
  }
  const computed = getComputedStyle(parent).position
  return {
    el: parent,
    priorInlinePosition: prior.inline(parent, 'position'),
    needsRelative: computed === '' || computed === 'static',
  }
}

/** The sibling order a move draft previews: the DOM-order sibling list with the dragged element
 * lifted out and re-inserted at `toIndex`, so the element's final position IS `toIndex`. */
function moveSequence(s: Extract<StructuralDraft, { kind: 'move' }>): TaggedElement[] {
  const seq = s.priorOrder.map(([el]) => el)
  const moved = seq[s.fromIndex]
  if (!moved) return seq
  const rest = seq.filter((el) => el !== moved)
  rest.splice(Math.max(0, Math.min(s.toIndex, rest.length)), 0, moved)
  return rest
}

/** A structural draft of exactly one kind — each PreviewSpec arm's parameter type. */
type DraftOf<K extends StructuralDraftKind> = Extract<StructuralDraft, { kind: K }>

/** What `commit()` does with a kind's preview once the code owns the result (P3 plan). Three
 * policies, and which one a kind takes is a product decision, not an implementation detail:
 * - `restore`: strip the preview by restoring it (`move`, `absolute`). Our inline
 *   `order`/`position`+inset would double-apply against the classes the agent just wrote — an
 *   element that is absolute in the code AND carries our stale inline `left` lands in the wrong
 *   place.
 * - `keep`: leave the preview standing (`delete`). The JSX is gone from source, so a surviving
 *   stale node must stay `display:none` until the framework drops it — un-hiding it would flash a
 *   ghost of the deleted element.
 * - `leave`: touch nothing (`text`). HMR re-rendered the DOM from source already. */
type CommitPolicy = 'restore' | 'keep' | 'leave'

/** One kind's preview: how it paints, how it un-paints, what commit does with it, and — the two
 * halves of the prior-state oracle — which (node, prop) pairs it owns and which nodes it writes. */
interface PreviewSpec<K extends StructuralDraftKind> {
  /** Paint the preview. Idempotent for every kind — repaintOverlapping relies on that. */
  write(el: TaggedElement, s: DraftOf<K>): void
  /** THE original side, restored VERBATIM (a page-authored inline `order`/`position` survives a
   * discard byte-for-byte, same discipline as MarginPush's saved margin). Paired with `write`;
   * keep the two in step. */
  restore(el: TaggedElement, s: DraftOf<K>): void
  onCommit: CommitPolicy
  /** "Is this draft previewing `prop` on `node`, and if so what did it find there?" — the per-kind
   * half of pagePrior's oracle; null when the draft doesn't own that (node, prop) pair. `owner` is
   * the drafted element, which a StructuralDraft doesn't carry itself (`structural` is keyed by it).
   * Exhaustive by construction, like write/restore: a fifth kind must state which inline properties
   * it previews, on which nodes, or it cannot compile. */
  priorOf(owner: TaggedElement, s: DraftOf<K>, node: TaggedElement, prop: string): string | null
  /** The nodes a live structural draft's preview WRITES to — the ownership map `priorOf` reads
   * from, in the other direction. One total registry arm again (a fifth kind must declare its
   * preview targets or fail to compile), and the only consumer is repaintOverlapping: "did
   * restoring draft X just clobber draft Y's preview?" is exactly a question about overlapping
   * target sets.
   *
   * `owner` for text/delete because each previews only the drafted element itself; a `move` writes
   * `order` on every sibling in its own list; an `absolute` writes the element AND (preview-only)
   * the parent it made into a positioning context. */
  targets(owner: TaggedElement, s: DraftOf<K>): TaggedElement[]
  /** The inline-style keys THIS kind's preview owns on the drafted element — the list a
   * computed-style oracle has to strip before it can measure anything (see structuralInlineKeys,
   * the one reader of this arm, and the two deliberate silences on the `delete` and `move` arms
   * below). Declared per kind rather than derived from `write`: what a preview writes and what a
   * verifier must neutralize are NOT the same question, and `delete` is the proof — its preview
   * writes `display`, and listing it here would defeat its own commit policy. */
  inlineKeys: readonly string[]
  /**
   * Re-derives this draft against the freshly-mounted node `next` (see heal). Returns null when the
   * draft became meaningless on the new node and must be pruned. The position-dependent kinds
   * re-derive from the LIVE tree on purpose: healing N stale sibling / parent references is
   * unbounded guesswork, while the fresh parent IS the source truth.
   *
   * "Live tree" is NOT "live inline styles" though (review findings 2 & 3): a remount replaces the
   * drafted node, but the nodes our preview WROTE to — a move's siblings, an absolute's parent —
   * routinely survive it still carrying our `order`/`position`. So every capture here goes through
   * the same prior oracle the mint path uses, and the outgoing draft is still in `structural` while
   * this runs (see heal) precisely so the oracle can consult its saved values.
   *
   * `basis` is StructuralDraftStore.reorderBasis, threaded in rather than hand-rolling
   * `styleableChildren` here: the healed move's indices must live in the SAME tombstone-free basis
   * the mint path used, or a heal silently re-derives the very off-by-one PR #46's major 5 fixed.
   *
   * KNOWN LIMIT (review finding 7, deferred by the plan): a move draft whose ELEMENT survived while
   * the sibling set changed around it is not re-derived at all — heal only fires for a
   * disconnected drafted node — so its indices (and its preview) can describe a parent that no
   * longer exists. The restore side is still safe (priorOrder holds real node refs). The plan's
   * stated position: accept, and if the E2E shows it, fix by re-deriving on the drafts flush rather
   * than inside the drag.
   */
  rebind(
    next: TaggedElement,
    s: DraftOf<K>,
    prior: PriorOracle,
    basis: (parent: Element) => TaggedElement[]
  ): StructuralDraft | null
}

/** THE structural preview registry — the PREVIEW layer's single declaration site (one of six across
 * the codebase; see shared/structural-kinds.ts for the full list and what the guarantee actually
 * is). Four kinds previewing in four separate per-kind branches (applyX, restoreStructural,
 * writeAll, healStructural) is exactly where a fifth kind gets silently missed, so every site
 * delegates here through the verbs below (P3 plan, internal refactor).
 *
 * Total over the canonical kind list, and it grew to cover every per-kind preview decision in three
 * passes: the 2026-07-25 registry pass folded in the commit policy (a `s.kind === 'move' ||
 * s.kind === 'absolute'` test buried in commitPreview); the same day's store split folded in
 * previewedPrior and previewTargets (now `priorOf`/`targets`); and the PR #47 review found the two
 * that had been left OUTSIDE while the commit message claimed otherwise — heal's per-kind
 * re-derivation and the verifier's per-kind neutralize list, now the `rebind` and `inlineKeys` arms.
 * A fifth kind must declare all seven members here or fail to compile, and there is no longer a
 * `switch (s.kind)` anywhere else in this module or in verifier.ts. */
export const PREVIEW_SPECS: { [K in StructuralDraftKind]: PreviewSpec<K> } = {
  text: {
    write: (el, s) => {
      el.textContent = s.value
    },
    restore: (el, s) => {
      el.textContent = s.original
    },
    onCommit: 'leave',
    priorOf: () => null, // previews textContent — never an inline property
    targets: (owner) => [owner],
    inlineKeys: [], // textContent again: there is no inline property for a neutralizer to strip
    rebind: (next, s) => {
      // Re-capture original from the fresh node — it renders the source truth; the stale
      // original described a node that no longer exists. A fresh original equal to the
      // drafted value means the draft became a no-op — don't re-mint it.
      const original = next.textContent ?? ''
      if (original === s.value) return null
      return { kind: 'text', original, value: s.value }
    },
  },
  delete: {
    write: (el) => el.style.setProperty('display', 'none'),
    restore: (el, s) => writeInline(el, 'display', s.priorInlineDisplay),
    onCommit: 'keep',
    priorOf: (owner, s, node, prop) => (node === owner && prop === 'display' ? s.priorInlineDisplay : null),
    targets: (owner) => [owner],
    // `delete`'s `display: none` must NOT be listed. structuralInlineKeys' list also drives
    // commit(el, props), and stripping `display` there would defeat delete's commit policy — the
    // tombstone KEEPS display:none so a surviving stale node can't flash a ghost of the deleted
    // element.
    inlineKeys: [],
    rebind: (next, _s, prior) =>
      // Through the oracle like every other capture, even though a freshly-mounted node carries
      // the code's own styles: "every capture site reads the page's value" is the invariant, and a
      // site that opts out is the one a future kind's preview quietly poisons.
      ({ kind: 'delete', priorInlineDisplay: prior.inline(next, 'display') }),
  },
  move: {
    // Explicit `order` on EVERY sibling, not just the moved one: `order` defaults to 0, so
    // moving one child to `order: 2` while its siblings stay implicit changes nothing (ties
    // fall back to DOM order). See the draft's priorOrder docs.
    write: (_el, s) => moveSequence(s).forEach((sib, i) => sib.style.setProperty('order', String(i))),
    restore: (_el, s) => {
      for (const [sib, prior] of s.priorOrder) writeInline(sib, 'order', prior)
    },
    onCommit: 'restore',
    priorOf: (_owner, s, node, prop) => {
      if (prop !== 'order') return null
      const saved = s.priorOrder.find(([sib]) => sib === node)
      return saved ? saved[1] : null
    },
    targets: (_owner, s) => s.priorOrder.map(([sib]) => sib),
    // `move`'s `order` needs no stripping either: verifyMove's oracle is the CONTENT at a DOM child
    // index (P3.1), and its preview writes neither text nor classes — nothing it reads can be
    // forged by an inline style (see its own note in verifier.ts).
    inlineKeys: [],
    rebind: (next, s, prior, basis) => {
      const parent = next.parentElement
      if (!parent) return null
      const siblings = basis(parent)
      const fromIndex = siblings.indexOf(next)
      if (fromIndex === -1) return null
      const toIndex = Math.max(0, Math.min(s.toIndex, siblings.length - 1))
      if (toIndex === fromIndex) return null // the remount already put it where the user wanted it
      return { kind: 'move', fromIndex, toIndex, priorOrder: capturePriorOrder(siblings, prior) }
    },
  },
  absolute: {
    write: (el, s) => {
      if (!s.on) {
        el.style.setProperty('position', 'static')
        return
      }
      el.style.setProperty('position', 'absolute')
      el.style.setProperty('left', `${s.left}px`)
      el.style.setProperty('top', `${s.top}px`)
      // Preview-only, and deliberately NOT a second Changes row (ratified #4): the parent edit
      // rides the element's own op, which names the parent's file:line:col.
      if (s.parent?.needsRelative) s.parent.el.style.setProperty('position', 'relative')
    },
    restore: (el, s) => {
      writeInline(el, 'position', s.priorInline.position)
      writeInline(el, 'left', s.priorInline.left)
      writeInline(el, 'top', s.priorInline.top)
      if (s.parent) writeInline(s.parent.el, 'position', s.parent.priorInlinePosition)
    },
    onCommit: 'restore',
    priorOf: (owner, s, node, prop) => {
      if (node === owner && (ABSOLUTE_PROPS as readonly string[]).includes(prop)) {
        return s.priorInline[prop as (typeof ABSOLUTE_PROPS)[number]]
      }
      // The PARENT's `position` is ours whenever the preview established the containing block —
      // the write that made finding 3 possible.
      if (prop === 'position' && s.parent?.el === node) return s.parent.priorInlinePosition
      return null
    },
    targets: (owner, s) => (s.parent ? [owner, s.parent.el] : [owner]),
    // The one kind that contributes: an `absolute` preview's inline position/left/top sit on the
    // very element verifyAbsolute measures, so without stripping them it reads OUR OWN preview back
    // — a false 'done', followed by commit() visibly snapping the page back. Same list the write
    // arm above paints, off the same constant.
    inlineKeys: ABSOLUTE_PROPS,
    rebind: (next, s, prior) => {
      // The same "the code already adopted it" prune the `move` and `text` arms do (review
      // finding 10): the remount may be the agent's own edit landing, and a draft that asks for
      // the state the fresh node ALREADY has is a no-op ask — it would inflate the pill and ship
      // "make this absolute" for something already absolute (and terminally land 'unverified'
      // only after a round trip). Reads computed, not inline: the fresh node carries the code's
      // styles, and the class the agent wrote is exactly what we must see.
      const computed = getComputedStyle(next).position
      const isAbsolute = computed === 'absolute' || computed === 'fixed'
      if (s.on === isAbsolute) return null
      const parent = next.parentElement
      return {
        kind: 'absolute',
        on: s.on,
        left: s.left,
        top: s.top,
        priorInline: capturePriorInline(next, prior),
        parent: s.on && parent ? parentRecordFor(parent, prior) : null,
      }
    },
  },
}

/** The registry's call verbs. The cast is the standard cost of dispatching a discriminated
 * union through a map (the same one ops.ts's draftToOps pays): each spec's own body stays strictly
 * typed by the map's declared shape — a `move` arm cannot read `s.value`. */
function specFor(s: StructuralDraft): PreviewSpec<StructuralDraftKind> {
  return PREVIEW_SPECS[s.kind] as PreviewSpec<StructuralDraftKind>
}

/** THE structural preview writer — every paint site's one entry point. */
export function writePreview(el: TaggedElement, s: StructuralDraft): void {
  specFor(s).write(el, s)
}

/** THE structural preview undo — every un-paint site's one entry point. */
export function restorePreview(el: TaggedElement, s: StructuralDraft): void {
  specFor(s).restore(el, s)
}

/** Per-kind COMMIT policy, read off the registry (see CommitPolicy for what each one means and
 * why). `keep` and `leave` are both "do nothing here" today and are still declared separately:
 * they are different promises — `keep` says the preview must SURVIVE (delete's tombstone), `leave`
 * says the DOM is no longer ours to touch (text's re-render) — and a kind that later needs an
 * explicit teardown for one of them must not silently inherit the other's arm. */
export function commitPreview(el: TaggedElement, s: StructuralDraft): void {
  if (specFor(s).onCommit === 'restore') restorePreview(el, s)
}

/** The per-kind prior-state read, off the registry — see PreviewSpec.priorOf. */
export function previewedPrior(
  owner: TaggedElement,
  s: StructuralDraft,
  node: TaggedElement,
  prop: string
): string | null {
  return specFor(s).priorOf(owner, s, node, prop)
}

/** The per-kind preview-target set, off the registry — see PreviewSpec.targets. */
export function previewTargets(owner: TaggedElement, s: StructuralDraft): TaggedElement[] {
  return specFor(s).targets(owner, s)
}

/** The per-kind heal re-derivation, off the registry — see PreviewSpec.rebind for the shared
 * invariant, the injected `basis`, and the known limit. */
export function rebindStructural(
  next: TaggedElement,
  s: StructuralDraft,
  prior: PriorOracle,
  basis: (parent: Element) => TaggedElement[]
): StructuralDraft | null {
  return specFor(s).rebind(next, s, prior, basis)
}

/** The inline-style keys a structural draft's PREVIEW owns, and that a computed-style oracle
 * therefore has to strip before measuring — read off the registry's `inlineKeys` arms, where the
 * per-kind reasoning (including the two deliberate silences) lives. Unioned into a send's
 * `draftProps` at the one construction site (index.ts's pairsToSeeds), which otherwise builds that
 * list from the CSS draft map alone — and `absolute`'s preview lives in the STRUCTURAL draft, so
 * without this the element's own inline position/left/top survive neutralization and verifyAbsolute
 * measures OUR OWN preview: a false 'done', followed by commit() visibly snapping the page back.
 * draftProps exists for exactly this kind of divergence (see SentEntry.elements[].draftProps in
 * lifecycle.ts).
 *
 * It lives HERE, beside the previews whose writes it describes, rather than in verifier.ts where it
 * was born (2026-07-25 registry follow-up): its parameter is a StructuralDraft, so it was per-kind
 * draft knowledge sitting one module away from the kind registry — the last of the two switches
 * that made "one declaration site" untrue. verifier.ts re-exports it, so its consumers (index.ts,
 * the verifier suite) import it from exactly where they always did. A fresh array per call because
 * `draftProps` is a mutable `string[]` the send path builds on. */
export function structuralInlineKeys(draft: StructuralDraft | null | undefined): string[] {
  if (!draft) return []
  return [...specFor(draft).inlineKeys]
}

