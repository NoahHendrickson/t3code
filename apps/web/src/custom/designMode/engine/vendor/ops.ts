import type { StructuralDraft } from './drafts'
import type { MovedFingerprint, StructuralOp } from './request'
import { sourceIndex } from './lifecycle-store'
import { parseSourceAttr, type SourceLocation, type TaggedElement } from './source'
import {
  isStructuralOpKind,
  type StructuralDraftKind,
  type StructuralOpKind,
} from './shared/structural-kinds'

/** The text op's `before` is pure locate-context — the element heading already targets the
 * edit — so it caps; `after` is the ask AND the verifier's textContent oracle, so it must
 * travel exact on both the wire and the markdown (a truncated ask is an unappliable edit). */
export const TEXT_BEFORE_CAP = 200

/** A structural draft of exactly one kind — the per-arm parameter type every registry below uses. */
type DraftOf<K extends StructuralDraftKind> = Extract<StructuralDraft, { kind: K }>
/** A structural op of exactly one kind. */
type OpOf<K extends StructuralOpKind> = Extract<StructuralOp, { kind: K }>

/** THE StructuralDraft → StructuralOp projection. One home on purpose: this mapping used to be
 * hand-inlined in request.ts (structuralOpsFor), changelist.ts (summarizeStructuralDraft's fake
 * op), and drafts.ts (commitStructural's match guard) — three copies that had already diverged
 * on the `before` cap (2026-07-23 review of PR #44). Type-only imports both ways keep this a
 * leaf module with zero runtime dependencies, so every layer can value-import it cycle-free.
 * (P3's value imports — source.ts's parseSourceAttr and lifecycle-store's sourceIndex, added by PR
 * #46 review major 1 — both live in modules whose OWN imports are type-only, so this stays a leaf.
 * shared/structural-kinds.ts, added by the 2026-07-25 registry pass, imports nothing at all.)
 *
 * The TOTAL map is deliberate: a fifth kind added to StructuralDraft must fail to compile here
 * rather than silently project to nothing (an op-less send). Stated honestly (PR #47 review): the
 * exhaustive `switch` this replaced had the IDENTICAL guarantee and paid no cast — the map's real
 * gain here is only that all six layers now key off one list and read alike. A draft kind never
 * arrives as an untrusted runtime string (drafts are minted in-process), which is the case where a
 * map genuinely beats a `never`-guarded switch; that case is IDENTITY_KEYS below and the persisted-op
 * validators, not this one. */
const OP_PROJECTIONS: { [K in StructuralDraftKind]: (s: DraftOf<K>) => StructuralOp[] } = {
  delete: () => [{ kind: 'delete' }],
  text: (s) => [{ kind: 'text', before: s.original.slice(0, TEXT_BEFORE_CAP), after: s.value }],
  move: (s) => {
    // priorOrder is captured in DOM order at mint time, so priorOrder[fromIndex][0] IS the
    // dragged element — anchorFor already relies on that same fact.
    const moved = s.priorOrder[s.fromIndex]?.[0] ?? null
    const parent = moved?.parentElement ?? null
    return [
      {
        kind: 'move',
        fromIndex: s.fromIndex,
        toIndex: s.toIndex,
        anchor: anchorFor(s),
        // The parent's address is the one address a child reorder cannot invalidate (its opening
        // tag precedes every child), which is why the verifier resolves the parent through it
        // and reads content at an index rather than re-locating the moved element (P3.1 — see
        // StructuralOp's move variant for the ascending-line-numbers proof).
        parent: parentRef(parent),
        // A draft with no locatable moved element (empty/short priorOrder — only reachable from
        // a malformed draft) mints an EMPTY fingerprint on purpose: the verifier reads that as
        // "cannot discriminate" and counts the op unproven, never verified.
        moved: moved ? moveFingerprint(moved) : { tag: '', className: '', text: '' },
      },
    ]
  },
  absolute: (s) => [
    {
      kind: 'absolute',
      on: s.on,
      inset: s.on ? { left: s.left, top: s.top } : null,
      // The verify oracle, in computed-value vocabulary (px strings), built HERE so the
      // wire carries the expectation the send actually made — the verifier must never
      // re-derive it from a draft that may have been nudged since (P3 plan §Verification).
      // The on:false direction asserts the INSETS ARE GONE too, not just `position: static`.
      // The ask is "remove its absolute positioning AND inset classes", so an agent that
      // strips `absolute` but leaves `left-6`/`top-10` behind would otherwise verify as a
      // clean 'done' on a half-applied edit — the exact false-done this milestone's verify
      // story exists to prevent (found reviewing the translation task). `auto` is what a
      // static element's left/top compute to, so this is the honest computed-value assertion
      // and not a proxy for "no class present".
      expected: s.on
        ? { position: 'absolute', left: `${s.left}px`, top: `${s.top}px` }
        : { position: 'static', left: 'auto', top: 'auto' },
      parent: s.parent ? { loc: locOf(s.parent.el), needsRelative: s.parent.needsRelative } : null,
    },
  ],
}

/** The projection's one call site. The cast is the standard cost of dispatching a discriminated
 * union through a map: TS can't narrow `s` and `OP_PROJECTIONS[s.kind]` together, so the arm is
 * widened at the call while each arm's own body stays strictly typed by the map's declared shape
 * (a `move` arm cannot read `s.value`). */
export function draftToOps(s: StructuralDraft): StructuralOp[] {
  return (OP_PROJECTIONS[s.kind] as (draft: StructuralDraft) => StructuralOp[])(s)
}

/** The move fingerprint's text normalizer, used on BOTH sides of the compare (mint here,
 * verify in verifier.ts) — never hand-roll a second one, or a fingerprint recorded through this
 * helper gets compared against a raw `textContent` and can never match.
 *
 * U+00A0 → space is the same treatment verifyText's `denbsp` gives its own compare (a page or a
 * contenteditable session can put a non-breaking space where the source has a plain one, and a
 * fingerprint must not fail on an invisible difference). Whitespace collapse + trim goes one step
 * further than verifyText deliberately: a text OP's `after` is the ask and must travel exact,
 * whereas this is an identity probe whose two readings straddle a source edit — moving JSX
 * re-indents it, so the surrounding newlines/indentation in `textContent` legitimately differ
 * before and after. The cap is the text op's own TEXT_BEFORE_CAP because this is the same kind of
 * value (locate-context, not an ask), and a second cap constant is a second thing to keep in sync. */
export function fingerprintText(raw: string): string {
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_BEFORE_CAP)
}

/** An element's class list as one normalized string. The `typeof className === 'string'` guard is
 * request.ts's (SVGElement.className is an SVGAnimatedString, not a string). */
export function fingerprintClassName(el: Element): string {
  const raw = typeof el.className === 'string' ? el.className : [...el.classList].join(' ')
  return raw.replace(/\s+/g, ' ').trim()
}

/** THE move op's content fingerprint — one mint site, and the verify side compares through the
 * two helpers above so the bases cannot drift (the same discipline styleableChildren enforces for
 * the index basis). See StructuralOp's move variant for WHY content and not the address. */
export function moveFingerprint(el: TaggedElement): MovedFingerprint {
  return {
    tag: el.tagName.toLowerCase(),
    className: fingerprintClassName(el),
    text: fingerprintText(el.textContent ?? ''),
  }
}

/** The parent's element children we can write `order` on. MathML and other exotic element
 * children are skipped — they have no `style` to preview through — so index bases stay
 * consistent between the draft, the preview, and the wire op.
 *
 * And it is THE move op's index basis, which is why it lives here now rather than privately in
 * drafts.ts: `fromIndex`, `toIndex`, the `order` preview's sibling list, the drag's hit-test list
 * and the verifier's DOM-index check are all indices into THIS list — the plan asserts that
 * agreement in three places, but it was an unenforced convention across modules with a hand-rolled
 * copy of the filter in each (review finding 12). ops.ts is the cycle-free leaf every layer can
 * value-import (see draftToOps' note above), and the op this basis belongs to is minted here. */
export function styleableChildren(parent: Element): TaggedElement[] {
  return [...parent.children].filter(
    (child): child is TaggedElement => child instanceof HTMLElement || child instanceof SVGElement
  )
}

/** `el`'s index in its parent's styleableChildren basis; -1 when it has no parent or is not itself
 * in the basis. The read side of styleableChildren — never hand-roll
 * `[...parent.children].indexOf(el)`, which counts children the preview cannot reach. */
export function childIndexOf(el: Element): number {
  const parent = el.parentElement
  if (!parent) return -1
  return styleableChildren(parent).indexOf(el as TaggedElement)
}

function locOf(el: TaggedElement | null | undefined): SourceLocation | null {
  const raw = el?.dataset?.dcSource
  return raw ? parseSourceAttr(raw) : null
}

/** The move op's parent slot: the reorder-stable address PLUS which instance of it (PR #46 review,
 * major 1). One `data-dc-source` can name many DOM elements — `items.map(() => <div class="row"/>)`
 * gives every row the same address — so an address alone makes the verifier resolve row 0 for a
 * reorder inside row 3, fingerprint-compare a foreign child set, and report a correct apply as a
 * terminal mismatch (the P3.1 bug by another route). The index is derived through lifecycle-store's
 * `sourceIndex`, the SAME helper the element leg uses (index.ts's pairsToSeeds, drafts.ts's
 * structuralAddr): never hand-roll a second querySelectorAll+indexOf, or the two bases can drift.
 * A parent with no (or a malformed) source tag has no address to index into — the loc rung is then
 * skipped entirely, so the 0 is inert rather than a claim about instance 0. */
function parentRef(el: TaggedElement | null): Extract<StructuralOp, { kind: 'move' }>['parent'] {
  if (!el) return null
  const raw = el.dataset?.dcSource
  const loc = raw ? parseSourceAttr(raw) : null
  return { loc, index: raw && loc ? sourceIndex(el, raw) : 0 }
}

/** The move op's anchor sibling: the element the moved one must land next to in the JSX. Derived
 * from the draft's own sibling list (priorOrder is captured in DOM order) rather than stored, so
 * healStructural's re-derivation against a freshly-mounted parent updates it for free.
 * `toIndex === 0` has no preceding sibling, so it anchors 'before' the new first element. */
function anchorFor(s: Extract<StructuralDraft, { kind: 'move' }>): Extract<StructuralOp, { kind: 'move' }>['anchor'] {
  const seq = s.priorOrder.map(([el]) => el)
  const moved = seq[s.fromIndex]
  const rest = moved ? seq.filter((el) => el !== moved) : seq
  if (rest.length === 0) return null
  if (s.toIndex <= 0) return { loc: locOf(rest[0]), position: 'before' }
  return { loc: locOf(rest[Math.min(s.toIndex, rest.length) - 1]), position: 'after' }
}

/** THE structural-op identity key: the fields that ARE the ask, per kind. `opsIdentical` compares
 * two ops by comparing these element-wise with `===` (never JSON — a stringified compare would
 * quietly make two NaN indices "identical"), so a kind's identity rule is this one arm.
 *
 * Total by construction, which is the upgrade over the per-kind `if` chain this replaced: a fifth
 * kind must state its identity here or fail to compile. It used to be able to have no arm at all
 * and fall through to a full-payload (JSON) compare — fail CLOSED, because 'same kind ⇒ identical'
 * would silently swallow a payload-carrying future kind's re-send (P3 move to a different toIndex)
 * as a duplicate, and no exhaustiveness check would flag it (2026-07-23 review of PR #44). `delete`
 * was the only kind that landed there, and it has no payload, so the JSON compare degenerated to
 * kind-equality — which is exactly what its EMPTY key below says outright.
 *
 * ONE POLICY, EVERY KIND: **locate-context never enters identity.** Identity is the ASK; every field
 * that exists only so the verifier can re-find something is excluded, because those fields are
 * RE-DERIVED FROM THE LIVE DOM at compare time (`draftToOps` runs against the page as it is now, not
 * as it was at send) and the live DOM is precisely what the applied edit just changed. A field that
 * moves when the edit lands makes `commitStructural` refuse the commit for its own success, and the
 * draft then outlives the edit it asked for: phantom pill count, stale changelist row, a re-send
 * shipping a no-op ask, and nothing self-heals (the node is connected, so `healStructural` never
 * fires). Concretely:
 *
 * - MOVE keys on `fromIndex`/`toIndex` only — `moved` and `parent` are ignored for exactly the
 *   reason text's `before` is. The P3 live E2E is why: after the agent applies a reorder, React
 *   (keyless) mutates the existing child nodes in place rather than moving them, so the drafted node
 *   survives but now renders a DIFFERENT sibling's content — and `draftToOps` re-derives the
 *   fingerprint from that node. Comparing the whole payload therefore saw "Recovery" where the send
 *   recorded "Vitality", concluded the user had re-edited, and REFUSED `commitStructural`; the draft
 *   kept previewing inline `order` over correct source, so the page visibly reordered cards the user
 *   never touched.
 * - ABSOLUTE keys on `on` / `inset` / the parent's `needsRelative` — the whole ask, and nothing but.
 *   `parent.loc` is excluded for the same reason (PR #46 review, major 4): it is re-derived via
 *   `locOf(s.parent.el)`, so one line-shifting edit above the parent in the same file re-tags it,
 *   the address the draft now projects differs from the one that was sent, and a correctly applied
 *   absolute op refuses to commit. `expected` needs no mention: it is a pure function of `on` +
 *   `inset`, already compared.
 * - `needsRelative` is normalized THROUGH a missing parent (`?? false`): "no parent" and "a parent
 *   that already is a positioning context" render the identical ask (absoluteAsk's parentClause is
 *   empty for both), so treating them as different asks would be the same false-refusal by a third
 *   route.
 *
 * Every call site is element-scoped (see lifecycle's `sameEl` guard, changelist's
 * `row.seed.el !== el`, and commitStructural's `el`), so within one element these fields fully
 * describe the ask and nothing is lost by ignoring the rest. */
const IDENTITY_KEYS: { [K in StructuralOpKind]: (op: OpOf<K>) => readonly unknown[] } = {
  // A re-edit to DIFFERENT text is a genuinely new request (same rule as css deltas); `before` is
  // deliberately ignored — it's locate-context, not the ask.
  text: (op) => [op.after],
  // Kind alone. `delete` carries no payload, so two delete ops on the same element ARE the same ask.
  delete: () => [],
  move: (op) => [op.fromIndex, op.toIndex],
  absolute: (op) => [
    op.on,
    op.inset?.left ?? null,
    op.inset?.top ?? null,
    op.parent?.needsRelative ?? false,
  ],
}

/** Structural-op identity for the duplicate window: same kinds in order, then IDENTITY_KEYS above
 * decides what "the same ask" means per kind — that map carries the full policy and the review
 * history behind every arm, and is where a new kind states its own rule.
 *
 * A kind that isn't in the map at all (not in the union either — a version-skewed persisted op read
 * back by a stale cached client) still falls through to the full-payload JSON compare it always
 * had: fail CLOSED, the same rule the map's doc explains. A kind that IS in the union can no longer
 * reach that path, because the map is total. */
export function opsIdentical(a: StructuralOp[] | undefined, b: StructuralOp[] | undefined): boolean {
  const aLen = a?.length ?? 0
  const bLen = b?.length ?? 0
  if (aLen !== bLen) return false
  if (!a || !b) return true
  return a.every((op, i) => {
    const other = b[i]
    if (op.kind !== other.kind) return false
    // The lookup is guarded rather than indexed raw — see isStructuralOpKind: an unguarded
    // `IDENTITY_KEYS[kind]` on a runtime-supplied string can resolve to Object.prototype.
    if (!isStructuralOpKind(op.kind)) return JSON.stringify(op) === JSON.stringify(other)
    const key = IDENTITY_KEYS[op.kind] as (o: StructuralOp) => readonly unknown[]
    const mine = key(op)
    const theirs = key(other)
    // Element-wise `===`, never a stringified compare: JSON would fold two NaN indices into
    // "null" and call a pair of malformed ops identical.
    return mine.length === theirs.length && mine.every((v, j) => v === theirs[j])
  })
}
