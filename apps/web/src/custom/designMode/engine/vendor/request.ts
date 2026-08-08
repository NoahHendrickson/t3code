import { DraftStore } from './drafts'
import { draftToOps } from './ops'
import { parseSourceAttr, type SourceLocation, type TaggedElement } from './source'
import { readTheme, readTokens, suggestUtility, findExistingUtility, type Theme } from './tokens'
import { isStructuralOpKind, type StructuralOpKind } from './shared/structural-kinds'
// t3-fork: see ../../cssOrigin.ts — proves whether the named utility is really the lever.
import { resolveDeclarationOrigins, type DeclarationOrigin } from '../../cssOrigin'
import { COMPONENT_NAME_ATTR, SOURCE_FILE_ATTR } from '../nativeSource'

export interface ChangeItem {
  property: string
  beforeCss: string
  afterCss: string
  beforeUtility: string | null
  afterUtility: string | null
  tokenExact: boolean
  /** Optional plain-language instruction overriding the literal before→after reading — set by the BUILDER (policy lives at construction), rendered generically. */
  intent?: string
  /** t3-fork: where this property actually resolves from, when it is not the element's own
   * utility class. `kind` records what the probe in cssOrigin.ts was able to establish, so the
   * rendered sentence never claims more than that:
   *   `overrides` — the class was probed and provably is NOT the lever; edit the rule.
   *   `ambiguous` — probe tied (something declares the same value); BOTH are named.
   *   `plain`     — no utility class to probe; the rule is named without any claim about one.
   *   `inline`    — an inline style on the element wins; no stylesheet rule is the lever.
   * The `-unnamed` arms carry the same verdicts when the winning/tying declaration could not
   * be recovered from any accessible stylesheet (cross-origin sheets throw on CSSOM access).
   * They exist so the verdict still reaches the renderer: without an origin the bullet falls
   * through to the change/add utility arms, naming a lever the probe just disproved
   * (PR #67 review). */
  origin?:
    | { kind: 'inline' }
    | { kind: 'overrides' | 'ambiguous' | 'plain'; selectorText: string; stylesheet: string }
    | { kind: 'overrides-unnamed' | 'ambiguous-unnamed' }
}

/** A Figma-pivot structural design op (spec 2026-07-22 §2-3), anchored at its ElementChange's
 * element. Parallel track to `changes` — style deltas keep their exact existing path.
 * insert/reparent arrive in P5; declare only what has shipped. */
export type StructuralOp =
  | { kind: 'text'; before: string; after: string }
  | { kind: 'delete' }
  /** Reorder among the parent's ELEMENT children (the same basis the verifier reads):
   * `toIndex` is the element's FINAL index once moved. `anchor` names the sibling the moved
   * element must land next to — carried instead of relying on `toIndex` alone (P3 delegated
   * call): a DOM parent's children can come from a different file than the parent itself
   * (`App.tsx` renders `<Card/>`, the card's own div is tagged in `Card.tsx`), so "child #2 of
   * the parent" doesn't always name a findable JSX position. The index rides as corroboration.
   *
   * `parent` + `moved` are P3.1's verify basis, and they exist because a reorder INVALIDATES THE
   * MOVED ELEMENT'S OWN ADDRESS: `data-dc-source` is `file:line:col`, and JSX order is what
   * determines line numbers — so after any correct reorder the children's tags are ascending
   * again and `5:9` names whichever sibling shifted up into that position, not the element we
   * moved. (The P3 live E2E hit exactly that: a correctly applied reorder reported "expected
   * index 2, got index 0".) What a child reorder CANNOT change: the parent's own address (its
   * opening tag precedes all its children, so no child permutation moves it), the child set, and
   * each child's content. So the op carries the stable parent address plus a content fingerprint
   * of the moved element, and the verifier asks "is the element with this content now at
   * `toIndex`?" instead of re-locating by an address that has moved on.
   *
   * `parent.index` is WHICH INSTANCE of that address (PR #46 review, major 1): one JSX parent
   * rendered from a `.map()` yields many DOM parents sharing one `data-dc-source`, exactly the way
   * the element leg needs its own `sourceIndex` — an address alone would resolve row 0's container
   * for a reorder inside row 3 and fingerprint-compare the wrong children. Minted by ops.ts
   * through lifecycle-store's `sourceIndex`, the one helper for this. */
  | { kind: 'move'; fromIndex: number; toIndex: number
    ; anchor: { loc: SourceLocation | null; position: 'before' | 'after' } | null
    ; parent: { loc: SourceLocation | null; index: number } | null
    ; moved: MovedFingerprint }
  /** The static→absolute (or absolute→static) TRANSITION only — plain `left`/`top` edits on an
   * element that is already absolute in the code are ordinary css drafts (P3 delegated call #2).
   * `expected` is the verify oracle (computed values to match: `{position:'absolute',
   * left:'24px', top:'40px'}` on, `{position:'static'}` off); the parent's own
   * `{position:'relative'}` rides `parent.needsRelative` instead, since it is measured on a
   * different element. `inset` is null when `on` is false — there is no inset to ask for. */
  | { kind: 'absolute'; on: boolean
    ; inset: { left: number; top: number } | null
    ; expected: Record<string, string>
    ; parent: { loc: SourceLocation | null; needsRelative: boolean } | null }

/** The wire union's kinds and shared/structural-kinds.ts's canonical list must name the SAME set,
 * in both directions: either alias fails to build (`false` doesn't satisfy `extends true`) if a
 * variant is added to StructuralOp without being declared in the list, or if the list declares a
 * kind the union doesn't have. Type only — zero runtime bytes. Without it the layer maps could stay
 * total against a list that had quietly stopped describing the wire: the extra-kind direction would
 * compile as an arm typed `never`, and the missing-kind direction would only surface wherever an op
 * is indexed by kind. */
type Assert<T extends true> = T
type _EveryWireKindIsDeclared = Assert<StructuralOp['kind'] extends StructuralOpKind ? true : false>
type _EveryDeclaredKindIsOnTheWire = Assert<StructuralOpKind extends StructuralOp['kind'] ? true : false>

/** The moved element's content identity, snapshotted at send time — the move op's verify oracle
 * (P3.1). Content is what survives a reorder unchanged, which is the whole point (see the `move`
 * variant's docs). All three fields are normalized/capped by ops.ts's `moveFingerprint`, the ONE
 * mint site, and compared with the same helpers on the verify side so the two bases cannot drift.
 * Empty strings are legitimate (a bare `<div/>`) and mean "cannot discriminate" — the verifier
 * fails CLOSED on that, counting the op unproven rather than matching on the tag alone. */
export interface MovedFingerprint {
  tag: string
  className: string
  text: string
}

export interface ElementChange {
  tag: string
  source: SourceLocation | null
  className: string
  text: string
  selector: string
  /** t3-fork: the React component that rendered this element, when the host named one. Carries
   * the "where do I edit?" answer that a rejected/absent source location cannot. */
  component?: string
  /** t3-fork: the authored file, when it was known but no position inside it was. */
  sourceFile?: string
  changes: ChangeItem[]
  /** Omitted (never []) when the element has no structural ops — keeps existing JSON stable. */
  ops?: StructuralOp[]
}

export interface ChangeRequest {
  createdAt: string
  viewport: { width: number; height: number }
  tailwind: boolean
  elements: ElementChange[]
}

// Keywords that are safe to pass through verbatim as an "after" value instead of the
// getComputedStyle-measured px/rgb/etc equivalent. Restricted to layout/box-model keywords
// (sizing, flex, alignment, border-style) where the computed value would silently invert the
// user's intent (e.g. Hug width 'auto' -> a hardcoded px). Deliberately excludes color keywords
// like 'red' — those DO round-trip meaningfully through getComputedStyle (-> 'rgb(255, 0, 0)')
// and must be measured, not passed through, once COLOR drafts exist (M2b-2).
export const KEYWORD_PASSTHROUGH = new Set([
  'auto',
  'fit-content',
  'min-content',
  'max-content',
  'flex',
  'inline-flex',
  'row',
  'column',
  'row-reverse',
  'column-reverse',
  'wrap',
  'nowrap',
  'wrap-reverse',
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
  'stretch',
  'baseline',
  'normal',
  'none',
  'solid',
  'dashed',
  'dotted',
  /* t3-fork: size-mode Fill outside a flex parent drafts `100%` — the percentage IS the
   * intent (fill the container), and measuring it would freeze a viewport-dependent size. */
  '100%',
])

export const REMOVE_AUTO_LAYOUT_INTENT = 'remove auto layout (flexbox) from this element; remove flex/inline-flex/flex-row/flex-col/flex-wrap/gap-*/justify-*/items-* classes rather than adding `display: block`'

/** The move op's "the preview is a lie" note — the same load-bearing job REMOVE_AUTO_LAYOUT_INTENT
 * does for `display: flex → block`: the mechanism we use to SHOW the result must never be mistaken
 * for the ask. A reorder previews as explicit inline `order` on every sibling (drafts.ts's move
 * arm) because that is the only reorder a framework-bypassing inline style can express; an agent
 * that "applied" it would have shipped a flexbox trick instead of the requested JSX order — one
 * that silently dies the moment the parent stops being a flex container. */
// The second sentence was added after the P3 live E2E, where a cold agent that looked at the
// running page got the reorder BACKWARDS. The `order` preview means the rendered order and the
// source order genuinely disagree while a move draft is live, so an agent reading positions off
// the page counts a different list than the one these indices describe — and every index in this
// ask is source-order. NO_PREVIEW_GUARDRAIL (shared/guardrails.ts) already tells agents not to
// preview at all, and it rides every delivery wrapper; this is the per-op belt to that braces,
// because move is the ONE op whose preview actively contradicts the source it is asking about
// (a delete preview hides, a text preview shows exactly what was asked for).
export const MOVE_PREVIEW_DISCLAIMER =
  'The inline `order` styles in the preview are NOT the ask; reorder the siblings. Positions above are SOURCE order — do not infer them from the rendered page, whose visual order currently reflects the preview.'

/** One wording for the "we had to guess an arbitrary value" caveat, shared by the css-delta
 * bullets and P3's inset ask — the signal must read identically wherever a suggested utility
 * fell off the project's token scale. */
const OFF_SCALE_NOTE = 'off the token scale — arbitrary value; double-check intent'

/* t3-fork: the builder's transition window, shared with verifySession.ts — both measure
 * computed values and neither may mistake a mid-transition frame for a difference. Saves
 * each element's ENTIRE inline cssText and restores it wholesale: value-only save/restore
 * loses `!important` and, when the page authored longhands, a shorthand write destroys
 * them irrecoverably. The callback may make its own inline edits; they are rolled back
 * with the transition. */
export function withTransitionsSuppressed<T>(els: Iterable<TaggedElement>, fn: () => T): T {
  const saved: Array<{ el: TaggedElement; cssText: string }> = []
  for (const el of els) {
    saved.push({ el, cssText: el.style.cssText })
    el.style.setProperty('transition', 'none')
  }
  try {
    return fn()
  } finally {
    for (const { el, cssText } of saved) el.style.cssText = cssText
  }
}

/* t3-fork: exported — verifySession.ts expands a report's collapsed property names back to
 * DraftStore keys through this same table, so the two directions cannot drift. */
export const COLLAPSE: Array<{ into: string; parts: string[] }> = [
  {
    into: 'border-radius',
    parts: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  },
  { into: 'padding-block', parts: ['padding-top', 'padding-bottom'] },
  { into: 'padding-inline', parts: ['padding-left', 'padding-right'] },
  { into: 'margin-block', parts: ['margin-top', 'margin-bottom'] },
  { into: 'margin-inline', parts: ['margin-left', 'margin-right'] },
  {
    into: 'border-width',
    parts: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  },
  {
    into: 'border-style',
    parts: ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  },
  {
    into: 'border-color',
    parts: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  },
]

function collapse(items: Map<string, { beforeCss: string; afterCss: string }>): Map<string, { beforeCss: string; afterCss: string }> {
  const out = new Map(items)
  for (const { into, parts } of COLLAPSE) {
    const present = parts.map((p) => out.get(p))
    if (present.some((v) => v === undefined)) continue
    const [first, ...rest] = present as Array<{ beforeCss: string; afterCss: string }>
    const equal = rest.every((v) => v.beforeCss === first.beforeCss && v.afterCss === first.afterCss)
    if (!equal) continue
    for (const p of parts) out.delete(p)
    out.set(into, first)
  }
  return out
}

/* t3-fork: exported — verifySession.ts compares its reading against the value THIS function
 * measured at send time, so the two reads must be taken identically or a divergence in the
 * reading itself manufactures a false `diverged`. */
export function measureComputed(el: TaggedElement, props: Iterable<string>): Map<string, string> {
  const computed = getComputedStyle(el)
  const out = new Map<string, string>()
  for (const prop of props) out.set(prop, computed.getPropertyValue(prop))
  return out
}

// `CSS.escape` is universally available in real browsers but some jsdom versions used in
// tests don't expose it as a global — fall back to a minimal spec-compliant escape (per the
// CSSOM spec: escape any char outside [a-zA-Z0-9_-] plus the leading-digit/hyphen-digit rules)
// so the selector stays safe either way.
function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)

  let out = value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)

  // CSSOM numeric-escape rule: a leading digit, or a leading '-' followed by a digit, cannot be
  // represented as a literal/backslash-escaped character — it must use the \HH (code point hex)
  // escape form, e.g. CSS.escape('0abc') === '\\30 abc'. Without this, `#0abc` is a syntactically
  // invalid selector even though no "special" characters were present to trigger the regex above.
  const leadMatch = /^(-?)([0-9])/.exec(out)
  if (leadMatch) {
    const [, hyphen, digit] = leadMatch
    const hex = digit.codePointAt(0)!.toString(16)
    out = `${hyphen}\\${hex} ${out.slice(hyphen.length + 1)}`
  }

  return out
}

/** Strip backticks + collapse whitespace. Everything this touches is interpolated into
 * `-wrapped code spans in the change-request markdown, and markdown ignores backslash escapes
 * inside code spans — so page-controlled content (e.g. a user-generated class attribute, whose
 * backtick CSS.escape merely backslash-prefixes) could otherwise close the span and inject
 * instruction lines the agent reads as part of the request (2026-07-10 security review).
 * `text` has always had this policy; className/selector get the identical treatment. */
function sanitizeInline(value: string): string {
  return value.replace(/[`]/g, '').replace(/\s+/g, ' ').trim()
}

/** Locate-context text cap. One helper for BOTH context-text sites (elementContext and
 * attachOps' original-repoint) so page-controlled text always gets the identical
 * sanitize+cap treatment — two hard-coded 80s kept "the same treatment" in sync by luck
 * (PR #44 review; the policy itself is the 2026-07-10 injection-hardening review's). */
const CONTEXT_TEXT_CAP = 80
function contextText(raw: string): string {
  return sanitizeInline(raw).slice(0, CONTEXT_TEXT_CAP)
}

/** `file:line:col` for the markdown. `data-dc-source` is page-controlled — any element in the
 * served DOM can carry an attacker-authored one — so every location that reaches the request
 * text gets the same treatment as className/selector. parseSourceAttr's anchored regex already
 * makes a newline impossible (so no line can be injected), but a backtick could still open a
 * code span and swallow the rest of the ask (2026-07-10 security review's threat model).
 * P3's move/absolute asks name OTHER elements' locations (the anchor sibling, the parent), so
 * this is now three sites, not one — hence a helper rather than three interpolations. */
function sourceRef(loc: SourceLocation): string {
  return sanitizeInline(`${loc.file}:${loc.line}:${loc.col}`)
}

/** Element identity/context block shared by the precise and prompt builders — tag, source,
 * classes, trimmed text, selector. `changes` is the caller's: measured deltas for the precise
 * flow, always [] for prompts. */
function elementContext(el: TaggedElement, changes: ChangeItem[]): ElementChange {
  const className = typeof el.className === 'string' ? el.className : [...el.classList].join(' ')
  return {
    tag: el.tagName.toLowerCase(),
    source: el.dataset.dcSource ? parseSourceAttr(el.dataset.dcSource) : null,
    className: sanitizeInline(className),
    text: contextText(el.textContent ?? ''),
    selector: sanitizeInline(cssPath(el)),
    // t3-fork: written by nativeSource.ts's COMPONENT_NAME_ATTR, independently of the source tag.
    ...(el.getAttribute(COMPONENT_NAME_ATTR)
      ? { component: sanitizeInline(el.getAttribute(COMPONENT_NAME_ATTR)!) }
      : {}),
    ...(el.getAttribute(SOURCE_FILE_ATTR)
      ? { sourceFile: sanitizeInline(el.getAttribute(SOURCE_FILE_ATTR)!) }
      : {}),
    changes,
  }
}

// Definitions (and their why-comments) moved to src/shared/guardrails.ts so the server's
// Cursor deeplink augmentation can share them without importing client code; SCOPE_GUARDRAIL
// stays re-exported for existing importers.
import { SCOPE_GUARDRAIL, NO_PREVIEW_GUARDRAIL } from './shared/guardrails'
export { SCOPE_GUARDRAIL }

export function cssPath(start: TaggedElement): string {
  const parts: string[] = []
  let el: Element | null = start
  let depth = 0
  while (el && depth < 4) {
    const tag = el.tagName.toLowerCase()
    if (el.id) {
      parts.unshift(`${tag}#${escapeCssIdent(el.id)}`)
      break
    }
    const parent: Element | null = el.parentElement
    if (parent) {
      const siblings = [...parent.children].filter((c) => c.tagName === el!.tagName)
      const index = siblings.indexOf(el) + 1
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    } else {
      parts.unshift(tag)
    }
    el = parent
    depth++
  }
  return parts.join(' > ')
}

/** Attach a structural-drafted element's ops (via ops.ts's shared draft→op projection) AND
 * repoint a text-drafted element's locate-context `text` at the ORIGINAL — the DOM shows the
 * drafted text, but the agent greps the source file, which still holds the before text;
 * drafted context would mislead the selector/text fallback. A no-op text draft (original ===
 * value) attaches nothing — belt-and-braces beside applyText's own collapse: a 'Text: "X" →
 * "X"' ask must never reach the wire (PR #44 review). */
function attachOps(elementChange: ElementChange, drafts: DraftStore, el: TaggedElement): void {
  const s = drafts.structuralOf(el)
  if (!s) return
  if (s.kind === 'text' && s.original === s.value) return
  elementChange.ops = draftToOps(s)
  if (s.kind === 'text') elementChange.text = contextText(s.original)
}

export function buildChangeRequestWithElements(
  drafts: DraftStore,
  theme: Theme = readTheme()
): { request: ChangeRequest; elements: Map<TaggedElement, ElementChange> } {
  const elementList: ElementChange[] = []
  const elements = new Map<TaggedElement, ElementChange>()
  const tokens = readTokens()

  // ONE walk of the drafted-element union (css + structural) — draftedElements() is the
  // DraftStore's own canonical iteration; the old shape (entries() loop + a second
  // structural-only sweep) re-implemented the union here and again in changelist.ts, and the
  // two copies had already diverged on their isConnected filters (PR #44 review).
  for (const el of drafts.draftedElements()) {
    if (!el.isConnected) continue
    const props = drafts.entries().get(el)
    const changes: ChangeItem[] = []
    if (props) {
      const wasComparing = drafts.isComparing(el)
      const inlineTransition = el.style.getPropertyValue('transition')
      el.style.setProperty('transition', 'none')

      let raw: Map<string, { beforeCss: string; afterCss: string }>
      // t3-fork: collapsed here rather than at the bullet loop below, because origin probing
      // has to run against the property names the bullets actually use (`padding-inline`, not
      // the `padding-left`/`padding-right` drafts it collapses from) AND while the original
      // cascade is still showing.
      let collapsed: Map<string, { beforeCss: string; afterCss: string }>
      const origins = new Map<string, DeclarationOrigin>()
      try {
        // measure "after" (drafted) computed values
        if (wasComparing) drafts.compare(el, false)
        const afterCss = measureComputed(el, props.keys())

        // measure "before" (original) computed values
        drafts.compare(el, true)
        const beforeCss = measureComputed(el, props.keys())

        raw = new Map<string, { beforeCss: string; afterCss: string }>()
        for (const [prop, draft] of props) {
          // A drafted layout keyword (e.g. 'auto' for Hug width/height) never round-trips through
          // the computed style — getComputedStyle resolves it to a px measurement, which would
          // silently invert the user's intent (Hug -> a hardcoded px). Pass such keywords through
          // verbatim as the "after" value; "before" stays a real measurement. Restricted to an
          // explicit allowlist (KEYWORD_PASSTHROUGH) rather than a keyword-shape regex, so that
          // color keywords like 'red' are NOT passed through — those must be measured, since
          // getComputedStyle legitimately resolves them to 'rgb(...)'.
          const isKeyword = KEYWORD_PASSTHROUGH.has(draft.value.toLowerCase())
          raw.set(prop, {
            beforeCss: beforeCss.get(prop)!,
            afterCss: isKeyword ? draft.value : afterCss.get(prop)!,
          })
        }
        // t3-fork: still inside `compare(el, true)` — the element is showing its ORIGINAL
        // cascade, which is the only state where "does this class control the property?"
        // has the right answer. Probing after the draft is restored would measure the draft
        // (applied inline, so it outranks every class) and call every utility inert.
        collapsed = collapse(raw)
        const probeClassName =
          typeof el.className === 'string' ? el.className : [...el.classList].join(' ')
        const changedProps = [...collapsed]
          .filter(([, v]) => v.beforeCss !== v.afterCss)
          .map(([property]) => property)
        // One CSSOM walk for every changed property, and the already-measured `beforeCss`
        // reused as the probe's baseline — on a Tailwind dev sheet the walk dominates, and
        // re-measuring would double the forced style recalcs for no new information.
        const measured = new Map(changedProps.map((property) => [property, collapsed.get(property)!.beforeCss]))
        for (const [property, origin] of resolveDeclarationOrigins(
          el,
          changedProps,
          measured,
          (property) => (theme.spacingBasePx === null ? null : findExistingUtility(probeClassName, property)),
        )) {
          origins.set(property, origin)
        }
        drafts.compare(el, wasComparing)
      } finally {
        if (inlineTransition) el.style.setProperty('transition', inlineTransition)
        else el.style.removeProperty('transition')
      }

      // t3-fork: the class list is derived once inside the compare window as `probeClassName`
      // (the probe needs it there anyway); this loop no longer reads it at all now that the
      // dead findExistingUtility fallback is gone.
      for (const [property, v] of collapsed) {
        // A draft scrubbed back to its original value survives in the DraftStore (apply() keeps
        // it), so it reaches here as a genuine no-op. Dropping it HERE — not just its markdown
        // bullet — keeps empty sections out of the agent's request and lets the caller skip the
        // send entirely when nothing actually changed.
        if (v.beforeCss === v.afterCss) continue
        const suggestion = suggestUtility(property, v.afterCss, theme, tokens)
        // t3-fork: the probe replaces the class-list scan as the source of `beforeUtility` —
        // a scan only proves a prefix-matching class is present, the probe proves it is the
        // lever. Every property reaching here was probed above under the same no-op skip, so
        // there is no unprobed path to fall back for.
        const origin = origins.get(property)!
        const item: ChangeItem = {
          property,
          beforeCss: v.beforeCss,
          afterCss: v.afterCss,
          beforeUtility: origin.utilityWins || origin.ambiguous ? origin.utilityClass : null,
          afterUtility: suggestion?.utility ?? null,
          tokenExact: suggestion?.tokenExact ?? false,
        }
        // The phrasing has to match what was actually established. Only a probe that MOVED the
        // value licenses "the utility is overridden"; a tie licenses "both declare this"; no
        // probe at all licenses nothing beyond naming the rule.
        if (origin.inlineStyle) {
          item.origin = { kind: 'inline' }
        } else if (origin.culprit) {
          item.origin = {
            kind: origin.ambiguous ? 'ambiguous' : origin.utilityClass === null ? 'plain' : 'overrides',
            selectorText: origin.culprit.selectorText,
            stylesheet: origin.culprit.stylesheet,
          }
        } else if (origin.ambiguous) {
          // t3-fork: a tie whose partner no accessible sheet names (cross-origin CSS). The
          // verdict must still ship — origin-less fallthrough would print the confident
          // "change `x` → `y`" the probe just declined to license (PR #67 review).
          item.origin = { kind: 'ambiguous-unnamed' }
        } else if (origin.utilityClass !== null && !origin.utilityWins) {
          // t3-fork: the value probe proved the utility lost, but the winner is not in any
          // accessible sheet. Suggesting add/change of a class in the same losing layer would
          // repeat the exact no-op this probe exists to prevent (PR #67 review).
          item.origin = { kind: 'overrides-unnamed' }
        }
        // 'display: flex → block' is never the literal ask — it is the panel's deterministic
        // preview of REMOVING auto layout. Stamp the intent here at construction so the agent
        // edits classes (removes the flex family); the renderer prints it without owning policy.
        if (item.property === 'display' && (item.beforeCss === 'flex' || item.beforeCss === 'inline-flex') && item.afterCss === 'block') {
          item.intent = REMOVE_AUTO_LAYOUT_INTENT
        }
        changes.push(item)
      }
    }

    const elementChange = elementContext(el, changes)
    attachOps(elementChange, drafts, el)
    // every drafted property was a no-op — nothing to request… unless a structural op
    // rides on this element, which must survive a zero-css-delta send on its own. The
    // ops check reads what attachOps actually attached (not structuralOf) so a collapsed
    // no-op text draft can't keep an empty section alive.
    if (changes.length === 0 && !elementChange.ops) continue
    elementList.push(elementChange)
    elements.set(el, elementChange)
  }

  // No client-side id: the queue item's server-generated id (Queue.add) is the request's one
  // identity everywhere — markdown reminders, mark_applied, /status, the SentRegistry.
  const request: ChangeRequest = {
    createdAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    tailwind: theme.spacingBasePx !== null,
    elements: elementList,
  }

  return { request, elements }
}

export function buildChangeRequest(drafts: DraftStore, theme: Theme = readTheme()): ChangeRequest {
  return buildChangeRequestWithElements(drafts, theme).request
}

/** The reorder ask. Positions read 1-based — the designer counts from 1, and so does the
 * changelist's row label (`Move <div> to position 3`) and, since PR #46 review (minor 2), the
 * verifier's mismatch note (`expected position 3, got position 1`); the op's own indices stay 0-based
 * DOM element-child indices, the basis the verifier measures. Both ride the line: the anchor is the
 * findable half (P3's delegated call — a parent's children can be tagged in a different file
 * than the parent itself, so "child #3 of the parent" doesn't always name a JSX position), and
 * the indices corroborate it. */
function moveAsk(op: Extract<StructuralOp, { kind: 'move' }>): string {
  const anchorLoc = op.anchor?.loc ?? null
  // Two legitimate ways to have nothing to point at: `anchor: null` (the parent has no OTHER
  // element child to anchor against) and an anchor sibling with no `data-dc-source` (untagged
  // — e.g. rendered by a node_modules component). Both must still produce an actionable ask
  // rather than "immediately after undefined", so fall back to the index — which whoever can
  // see the parent's JSX can act on — and say WHY there's no anchor, so the agent doesn't go
  // hunting for a file:line:col that was never sent.
  // The fallback STATES ITS BASIS (PR #46 review, minor 2): with no anchor to point at, a bare
  // "position 3" leaves the agent counting JSX children by eye, and an agent that counts text nodes
  // or `{expr}` children lands one off. Positions count ELEMENT children only — the same
  // styleableChildren basis the draft, the preview and the verifier use — so say so. The anchored
  // branch needs no such clause: the file:line:col is unambiguous on its own.
  const where = anchorLoc
    ? `so it comes immediately ${op.anchor!.position} the element at ${sourceRef(anchorLoc)}`
    : "so it sits at that position counting only the parent's ELEMENT children (text and `{expression}` children don't count) — no source-tagged sibling to anchor against"
  return `Move this element to position ${op.toIndex + 1} of its parent (it is currently position ${op.fromIndex + 1}) — reorder the JSX ${where}. ${MOVE_PREVIEW_DISCLAIMER}`
}

/** The static↔absolute transition ask (ratified #4 — the toggle owns the parent too, as ONE op,
 * so ONE line carries both halves). */
function absoluteAsk(op: Extract<StructuralOp, { kind: 'absolute' }>, theme: Theme): string {
  if (!op.on) {
    // The flow-return direction carries neither inset nor parent (drafts.ts's applyAbsolute
    // records neither for `on: false`), and deliberately does NOT ask for the parent's
    // `relative` to come off: other absolute children may still depend on it.
    return 'Return this element to normal flow: remove its absolute positioning and inset classes.'
  }
  // ONLY when the parent still needs it: naming a parent that is already a positioning context
  // is noise that invites a pointless diff on a file the edit has no business touching. An
  // unlocatable parent (no source tag) still gets asked for — without `relative` somewhere up
  // the tree the inset resolves against the wrong ancestor, so the ask can't be dropped, only
  // made vaguer.
  const parentClause = op.parent?.needsRelative
    ? ` Make the parent element${op.parent.loc ? ` at ${sourceRef(op.parent.loc)}` : ''} a positioning context (\`relative\`) if it isn't already.`
    : ''
  // Defensive: draftToOps always pairs `on: true` with an inset, but renderMarkdown also accepts
  // hand-built requests (tests, future callers) — ask for the position change rather than
  // inventing a 0,0 inset the user never drafted.
  if (!op.inset) return `Position this element absolutely.${parentClause}`

  const left = suggestUtility('left', `${op.inset.left}px`, theme)
  const top = suggestUtility('top', `${op.inset.top}px`, theme)
  const px = `${op.inset.left}px from the parent's left, ${op.inset.top}px from its top`
  // Token-first, exactly like the css deltas: the ask speaks the project's own vocabulary
  // (`left-6 top-10`) with the px measurement alongside as the unambiguous truth. A non-Tailwind
  // theme (spacingBasePx null) gets no utilities at all — suggestUtility returns null for both
  // and the px clause carries the whole ask.
  let line =
    left && top
      ? `Position this element absolutely at \`${left.utility} ${top.utility}\` (${px})`
      : `Position this element absolutely: ${px}`
  if ((left && !left.tokenExact) || (top && !top.tokenExact)) line += ` — ${OFF_SCALE_NOTE}`
  return `${line}.${parentClause}`
}

/** THE structural-op → markdown ask mapping, total by construction: a NEW kind added to the union
 * has no arm here and fails to compile — the same guard draftToOps carries, and the one this
 * renderer was missing. It mattered: P3's move/absolute ops shipped on the wire while
 * renderMarkdown's open-ended `else` arm rendered no line for them at all — an op with no ask
 * beside it. (It was an exhaustive `switch` with the identical guarantee until the 2026-07-25
 * registry pass keyed every layer off shared/structural-kinds.ts.) */
const OP_ASKS: { [K in StructuralOpKind]: (op: Extract<StructuralOp, { kind: K }>, theme: Theme) => string } = {
  delete: () => 'Delete this element: remove its JSX (and children) from the source.',
  // JSON.stringify escapes quotes AND newlines — page-controlled text stays a single
  // quoted line and can never inject instruction lines into the request (same threat
  // model as sanitizeInline, which can't be used here: the ask must stay verbatim).
  text: (op) => `Text: ${JSON.stringify(op.before)} → ${JSON.stringify(op.after)}`,
  move: (op) => moveAsk(op),
  absolute: (op, theme) => absoluteAsk(op, theme),
}

/** The ask map's one call site. renderMarkdown also accepts hand-built ChangeRequests (tests,
 * future callers), so an op whose kind isn't in the map at all is possible at runtime — it renders
 * no ask rather than throwing (the switch this replaced fell off its end and rendered a literal
 * `- undefined` bullet instead — never intended, and the suite forbids the word in markdown), and
 * the verifier counts such an op unproven regardless (see verifier.ts's VERIFY_ARMS). The guarded
 * lookup is isStructuralOpKind's: an unguarded `OP_ASKS[kind]` can resolve to Object.prototype on a
 * runtime-supplied string. */
function opAsk(op: StructuralOp, theme: Theme): string | null {
  if (!isStructuralOpKind(op.kind)) return null
  return (OP_ASKS[op.kind] as (o: StructuralOp, t: Theme) => string)(op, theme)
}

/** `theme` is a parameter (same default-to-readTheme() idiom as buildChangeRequest) because P3's
 * inset ask token-maps at RENDER time: the `absolute` op's payload is px (it's also the verify
 * oracle), and its type is fixed — there is no field to stash a suggested utility in at build
 * time the way ChangeItem.afterUtility does. The theme is stable for the life of a dev session,
 * so render-time and build-time mapping agree. */
export function renderMarkdown(req: ChangeRequest, theme: Theme = readTheme()): string {
  const lines: string[] = []
  lines.push('# Design change request')
  lines.push('')
  lines.push(
    `Apply the following visual edits EXACTLY as specified. Do not restyle anything else. Drafted at viewport ${req.viewport.width}×${req.viewport.height}.`
  )
  lines.push('')

  req.elements.forEach((el, i) => {
    const loc = el.source ? sourceRef(el.source) : '(no source tag — locate by selector/text)'
    lines.push(`## ${i + 1}. <${el.tag}> — ${loc}`)
    // t3-fork: the fallback names a selector, so PRINT it — every ElementChange carries one
    // (elementContext's sanitized cssPath) and it used to stop at the guest, leaving an
    // untagged element addressed by nothing but its text and classes. On a page with no
    // source mapping at all (protocol.ts's `selector-only` mode) that is EVERY element,
    // so the whole request arrived unanchored. Tagged elements skip it: the file:line:col
    // is the better address, and a second one is noise.
    if (!el.source && el.selector) lines.push(`Selector: \`${el.selector}\``)
    // t3-fork: printed before text/classes — when the location was rejected this is the
    // strongest address the request carries, and the agent should read it first.
    // Only when there is no resolved location — otherwise the heading already names the file
    // and a "(line not resolvable)" line beside it contradicts it.
    if (!el.source && (el.component || el.sourceFile)) {
      const where = el.sourceFile ? ` in ${el.sourceFile} (line not resolvable)` : ''
      lines.push(`Rendered by: ${el.component ? `\`<${el.component}>\`` : 'unknown component'}${where}`)
    } else if (el.source && el.component) {
      lines.push(`Rendered by: \`<${el.component}>\``)
    }
    if (el.text) lines.push(`Text: "${el.text}"`)
    if (el.className) lines.push(`Current classes: \`${el.className}\``)
    lines.push('')
    for (const c of el.changes) {
      // Defense-in-depth: buildChangeRequestWithElements already drops no-ops at the source,
      // but renderMarkdown also accepts hand-built ChangeRequests (tests, future callers) —
      // a no-op bullet must never reach the agent regardless of who built the request.
      if (c.beforeCss === c.afterCss) continue
      let line = `- ${c.property}: ${c.beforeCss} → ${c.afterCss}`
      // t3-fork: a named origin means the class layer provably is NOT the lever here — say so
      // and point at the rule, instead of suggesting a utility edit that resolves to nothing.
      if (c.origin?.kind === 'inline') {
        line += ` — currently set by an inline style on the element; that wins over every stylesheet rule, so change it where the style is applied`
      } else if (c.origin?.kind === 'overrides') {
        line += ` — set by \`${c.origin.selectorText}\` in ${c.origin.stylesheet}, which outranks this element's utility classes; edit that rule`
      } else if (c.origin?.kind === 'plain') {
        line += ` — set by \`${c.origin.selectorText}\` in ${c.origin.stylesheet}; edit that rule`
      } else if (c.origin?.kind === 'ambiguous' && c.beforeUtility) {
        line += ` — \`${c.beforeUtility}\` and \`${c.origin.selectorText}\` (${c.origin.stylesheet}) both declare this at the same value, so removing either alone changes nothing; check which one wins before editing`
      } else if (c.origin?.kind === 'ambiguous-unnamed' && c.beforeUtility) {
        line += ` — \`${c.beforeUtility}\` ties with another declaration of the same value that could not be traced to an accessible stylesheet; check which one wins before editing`
      } else if (c.origin?.kind === 'overrides-unnamed') {
        line += ` — overridden by a rule that could not be traced to an accessible stylesheet; this element's utility classes are not the lever, so find where this property is really set`
      } else if (c.afterUtility) {
        line += c.beforeUtility
          ? ` — change \`${c.beforeUtility}\` → \`${c.afterUtility}\``
          : ` — add \`${c.afterUtility}\``
        line += c.tokenExact ? '' : ` (${OFF_SCALE_NOTE})`
      }
      if (c.intent) line += ` — intent: ${c.intent}`
      lines.push(line)
    }
    for (const op of el.ops ?? []) {
      const ask = opAsk(op, theme)
      if (ask) lines.push(`- ${ask}`)
    }
    lines.push('')
  })

  // No scope/no-preview guardrails here (2026-07-10 cost review): queue-delivered markdown
  // always arrives inside an instruction wrapper that already carries them once per delivery
  // (DESIGN_COMMAND/WATCH_COMMAND/PULL_TURN_TEXT/Cursor augmentation — see the placement map
  // in src/shared/guardrails.ts), so repeating them per item was pure token cost. Wrapper-less
  // paths must use renderStandaloneMarkdown below instead.
  return lines.join('\n')
}

/** Markdown + guardrails, for paths where the request travels with NO instruction wrapper of
 * its own — today that's the Copy-for-agent clipboard payload, pasted into an arbitrary agent
 * with no command text in context. Queue-delivered markdown stays lean (see renderMarkdown's
 * closing comment). */
export function renderStandaloneMarkdown(req: ChangeRequest, theme: Theme = readTheme()): string {
  return `${renderMarkdown(req, theme)}\n${SCOPE_GUARDRAIL}\n${NO_PREVIEW_GUARDRAIL}`
}
/** Rebuilds a single-element request + markdown from a failed seed for resend() — the one
 * place that reconstructs the shape `buildChangeRequestWithElements` produces fresh, so a
 * future change to the request's fields only needs updating here, not separately in
 * resend(). (This used to also rebuild kind:'prompt' requests for prompt-marked seeds — that
 * whole request kind died with the composer consolidation: free-form text rides POST
 * /session/say as a chat turn now, and lifecycle-store drops any pre-consolidation persisted
 * prompt seed at the load boundary, so no prompt seed can reach resend() anymore.) */
export function rebuildRequestFromSeed(seed: { change: ElementChange }): {
  request: ChangeRequest
  markdown: string
} {
  // ONE theme read for both the `tailwind` flag and the render (P3: renderMarkdown now
  // token-maps insets, so it needs the same theme this flag is derived from — two reads could
  // only ever disagree, never help).
  const theme = readTheme()
  const request: ChangeRequest = {
    createdAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    tailwind: theme.spacingBasePx !== null,
    elements: [seed.change],
  }
  return { request, markdown: renderMarkdown(request, theme) }
}
