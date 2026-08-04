import type { TaggedElement } from './source'
import { DraftStore } from './drafts'
import { parseColor as parseColorLocal } from './tokens'

const px = (n: number): string => `${n}px`
const fromPx = (css: string): number => Math.round(Number.parseFloat(css) || 0)

/**
 * Walks up from `el` (starting at el itself) for the first ancestor whose (draft-or-computed)
 * background-color has alpha > 0 — the color a Text/Stroke swatch would actually be seen
 * against. Falls back to white when no ancestor paints a background (the page's default canvas).
 */
function effectiveBackground(el: TaggedElement, drafts: DraftStore): string {
  let node: Element | null = el
  while (node) {
    const draft = drafts.isComparing(node as TaggedElement) ? null : drafts.current(node as TaggedElement, 'background-color')
    const css = draft ?? getComputedStyle(node).getPropertyValue('background-color')
    const parsed = parseColorLocal(css)
    if (parsed && parsed.a > 0) return css
    node = node.parentElement
  }
  return '#fff'
}

function isFlex(el: TaggedElement): boolean {
  const d = getComputedStyle(el).display
  return d === 'flex' || d === 'inline-flex'
}

/**
 * Normalizes a computed justify-content keyword to the matrix's flex-start|center|flex-end
 * vocabulary. Display-only: drafts still store whatever canonical keyword the user clicked.
 * An untouched flex container reports 'normal' (real browsers) or '' (jsdom) rather than
 * 'flex-start', so without this the matrix would show zero active dots by default.
 */
export function normalizeJustify(justify: string): string {
  if (justify === 'normal' || justify === 'start' || justify === 'left' || justify === '') return 'flex-start'
  if (justify === 'end' || justify === 'right') return 'flex-end'
  return justify
}

/**
 * Normalizes a computed align-items keyword the same way as normalizeJustify, except
 * 'stretch' is intentionally left as-is (not mapped to a matrix keyword) — stretch is
 * represented by the child's W/H size mode being Fill, not a matrix position, so it must
 * continue to produce no active dot.
 */
export function normalizeAlign(align: string): string {
  if (align === 'normal' || align === 'start' || align === '') return 'flex-start'
  if (align === 'end') return 'flex-end'
  return align
}

/** True when `el` has a direct child text node with non-whitespace content (element children don't count). */
export function hasDirectText(el: Element): boolean {
  return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
}

/** The inline-text-edit gate: a pure text LEAF — non-whitespace direct text AND zero element
 * children. hasDirectText alone admits mixed content (`<button><svg/>Buy</button>`), whose
 * flat-textContent draft model would destroy the element children on commit (`el.textContent =
 * value` replaces ALL child nodes) and could only ever restore a flattened string on discard —
 * an unrecoverable live-page corruption React may then crash reconciling (PR #44 review). */
export function isTextLeaf(el: Element): boolean {
  return el.childElementCount === 0 && hasDirectText(el)
}

/** Offset from the offsetParent's padding edge — the ONE derivation behind both
 * InspectorData.x/y and the panel's Position header refresh. Two inline copies of this
 * expression shipped in P1 with zero consumers of the canonical one; when P3's Absolute
 * toggle changes what X/Y means, this is the only place to change (PR #44 review).
 * 0 for SVG and other non-HTMLElements, which have no offset model.
 *
 * P3 took that note up and landed BESIDE this rather than inside it (review finding 4): the
 * Absolute toggle needs offsets from the *parent*, which is a different question — see
 * insetWithinParent below. This function is unchanged on purpose, because P1's read-only X/Y
 * display legitimately still wants offsetParent semantics. */
export function elementOffsets(el: Element): { x: number; y: number } {
  if (!(el instanceof HTMLElement)) return { x: 0, y: 0 }
  return { x: Math.round(el.offsetLeft), y: Math.round(el.offsetTop) }
}

/** The element's own used left/top margins in px. An unset margin (and jsdom's '' for any
 * margin) reads as 0 — the same empty-means-default convention every reader in this file uses. */
function usedMargins(el: HTMLElement): { left: number; top: number } {
  const cs = getComputedStyle(el)
  return {
    left: Number.parseFloat(cs.getPropertyValue('margin-left')) || 0,
    top: Number.parseFloat(cs.getPropertyValue('margin-top')) || 0,
  }
}

/**
 * `elementOffsets` translated from the BORDER-edge basis into the MARGIN-edge basis that CSS
 * `left`/`top` actually use — PR #46 review finding 2 (MAJOR), and the reason three call sites
 * (this file's insetWithinParent, resize.ts's startBoxOf, panel-specs' X/Y row read) all route
 * through here instead of elementOffsets.
 *
 * THE DISTINCTION, spelled out because it is exactly the kind of thing that gets "simplified"
 * back: `offsetLeft`/`offsetTop` report where the element's **border** edge sits relative to its
 * offsetParent's padding edge. CSS `left`/`top` on an out-of-flow element place its **margin**
 * edge relative to the containing block's padding edge — the used margin then pushes the border
 * edge a further margin-left/margin-top along. So `left: offsetLeft` on an element with
 * `margin-left: 16px` renders its border edge 16px further right than it was standing. Seeding a
 * card with `mt-4` that way jumped it 16px down on the one gesture whose documented contract is
 * "the element stays EXACTLY where it is" — and every safety net agreed with the wrong number,
 * because the op ships this seed and the verifier's `expected` is minted from the same seed.
 *
 * SUBTRACT THE MARGIN rather than zero the margins in the preview (the other available fix): the
 * agent's applied code keeps the element's margin utilities — we ask it for `absolute left-6
 * top-10`, never for the removal of `mt-4`, and margins are deliberately invisible to the
 * designer in the Figma pivot (spec §5) — so the seed has to be expressed in the same basis the
 * shipped code will resolve. Zeroing them in the preview would make the preview disagree with
 * the end state instead.
 *
 * KNOWN LIMIT (noted, not worked around): an in-flow element's margin can COLLAPSE with a
 * sibling's or its parent's, and getComputedStyle reports the uncollapsed computed margin — so a
 * collapsed margin-top over-corrects by the collapsed amount. Computed styles carry no
 * collapsing signal (the same inherent limit minMaxRowVisible's authorship note describes), and
 * an absolute element's margins never collapse, so the error only exists across the transition
 * itself. Non-HTMLElements (SVG) keep elementOffsets' {0,0} answer.
 */
export function marginEdgeOffsets(el: Element): { x: number; y: number } {
  if (!(el instanceof HTMLElement)) return { x: 0, y: 0 }
  const offsets = elementOffsets(el)
  const margins = usedMargins(el)
  return { x: Math.round(offsets.x - margins.left), y: Math.round(offsets.y - margins.top) }
}

/** The inset an element needs to STAY EXACTLY WHERE IT IS once it becomes `position: absolute`
 * inside `parent` — offsets from the PARENT's padding box, which is the box a CSS `left`/`top`
 * resolves against once the parent is the containing block. THE seed for P3's Absolute toggle.
 *
 * elementOffsets above cannot answer this (review finding 4). It is offsetParent-relative, and
 * offsetParent is the nearest POSITIONED ancestor — so precisely when the answer matters (a
 * `static` parent, i.e. the case where the toggle has to make the parent `relative`) the parent is
 * by definition NOT the offsetParent, and those offsets measure against a distant ancestor,
 * usually `<body>`. Seeding from them wrote the element's whole PAGE position into `left`/`top`:
 * the preview jumped hundreds of px out of its parent, and the op shipped that number to the agent
 * as "px from the parent's left" — with a matching `expected`, so the verifier confirmed the wrong
 * number.
 *
 * The fix is the ORDER OF OPERATIONS, not different math: establish the containing block on
 * `parent` first (restoring the parent's own inline value verbatim afterwards — the MarginPush
 * save-verbatim idiom; the caller's preview writes it again for real), which re-parents the
 * element's offset model onto `parent`, and only THEN read the offsets. Deliberately NOT
 * getBoundingClientRect deltas: canvas mode scales the whole page through a `<body>` transform, so
 * two scaled rects differ by scale × the true offset and a 200% zoom would seed a 2× inset.
 * offsetLeft/offsetTop are layout values and are immune to that.
 *
 * The BASIS is the second half of the answer (PR #46 review finding 2): offsets are read through
 * marginEdgeOffsets, not elementOffsets, because `left`/`top` place the MARGIN edge while
 * offsetLeft/offsetTop report the BORDER edge — see marginEdgeOffsets for the full why. Getting the
 * reference BOX right (finding 4, below) and the reference EDGE right (finding 2) are two
 * independent corrections to the same seed; both are required for "the element stays exactly where
 * it is" to hold.
 *
 * KNOWN LIMIT (review finding 11, noted not worked around): SVG children have no offset model, so
 * elementOffsets returns {0,0} for them and so does this — an SVG child would snap to the parent's
 * corner. The gesture gates exclude SVG in practice (layers.ts treats `svg` as opaque). */
export function insetWithinParent(el: Element, parent: HTMLElement): { x: number; y: number } {
  // Already a containing block (relative/absolute/fixed/sticky) ⇒ it already IS the offsetParent,
  // so the offsets are the inset as they stand. jsdom reports '' for an unstyled element, which is
  // `static` for our purposes (the same reading as drafts.ts's needsRelative).
  const position = getComputedStyle(parent).position
  if (position !== '' && position !== 'static') return marginEdgeOffsets(el)
  const saved = parent.style.getPropertyValue('position')
  parent.style.setProperty('position', 'relative')
  try {
    return marginEdgeOffsets(el)
  } finally {
    if (saved) parent.style.setProperty('position', saved)
    else parent.style.removeProperty('position')
  }
}

// marginSectionVisible (and its MARGIN_PROPS) died with the Margin section in the
// 2026-07-22 Figma pivot — margins are invisible to the designer now (spec §5).

/**
 * Min/max row disclosure (spec M-D): a constraint row shows when the user opened it this
 * selection, a draft is live, or the computed value is non-default. Defaults: min-* '', '0px',
 * 'auto'; max-* '', 'none' (jsdom '' counts as default, same convention as marginSectionVisible).
 * KNOWN LIMIT: an authored `min-width: 0` computes to the same '0px' as the true default, so it
 * cannot auto-disclose — computed styles carry no authorship signal (same inherent limit as an
 * authored `margin: 0`). Pinned by test.
 */
export function minMaxRowVisible(prop: string, computed: string, hasDraft: boolean, opened: boolean): boolean {
  if (opened || hasDraft) return true
  const defaults = prop.startsWith('min-') ? ['', '0px', 'auto'] : ['', 'none']
  return !defaults.includes(computed)
}

/**
 * Align-self row disclosure (2026-07-06 layout-polish spec): the row's toggle reads ON when
 * the user opened it this selection, a draft is live, or the computed value is non-default —
 * an off toggle must never mask a real align-self from the app's CSS or from cross-axis
 * size-mode Fill (which writes align-self: stretch). Defaults: '', 'auto', 'normal'
 * (jsdom '' counts as default, same convention as minMaxRowVisible).
 */
export function alignSelfRowOn(computed: string, draft: string | null, opened: boolean): boolean {
  if (opened) return true
  const defaults = new Set(['', 'auto', 'normal'])
  // A live draft speaks for the element (it masks the stylesheet value beneath): a drafted
  // auto/normal reads as default so the toggle can actually turn OFF over app CSS — the
  // pending "follow parent" edit still rides in the Changes list (final-review finding).
  if (draft !== null) return !defaults.has(draft)
  return !defaults.has(computed)
}

/** Snaps a computed font-weight keyword/number to one of the 9 named-weight values. */
function snapWeight(css: string): string {
  if (css === 'normal') return '400'
  if (css === 'bold') return '700'
  const n = Number.parseFloat(css)
  if (!Number.isFinite(n)) return '400'
  // Snap to the nearest named weight (100-900, step 100).
  return String(Math.min(900, Math.max(100, Math.round(n / 100) * 100)))
}

/** Unquotes a computed font-family's first entry for display (e.g. `"Georgia"` -> `Georgia`). */
function firstFamily(computedFontFamily: string): string {
  const first = computedFontFamily.split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '')
}

/** Quotes a family name for use in a font-family CSS value if it contains whitespace. */
function cssFamilyValue(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name
}

/** Enumerates unique font families from document.fonts, feature-detecting its absence (jsdom). */
function documentFontFamilies(): string[] {
  const fonts: unknown = (document as unknown as { fonts?: Iterable<{ family: string; status?: string }> }).fonts
  if (!fonts || typeof (fonts as Iterable<unknown>)[Symbol.iterator] !== 'function') return []
  const seen = new Set<string>()
  for (const face of fonts as Iterable<{ family: string; status?: string }>) {
    if (face.status !== undefined && face.status !== 'loaded') continue
    seen.add(face.family.replace(/^['"]|['"]$/g, ''))
  }
  return [...seen]
}

/** Direction the SIZE dimension corresponds to on the parent's flex axis. */
function mainAxisProp(direction: string): 'width' | 'height' {
  return direction === 'column' ? 'height' : 'width'
}

/**
 * A fill "exists" only when it paints: alpha 0 (and jsdom's '' for an unset background)
 * reads as empty — the same rule colorDisplay uses to claim the `transparent` keyword.
 */
export function fillIsEmpty(css: string): boolean {
  const parsed = parseColorLocal(css)
  return !parsed || parsed.a === 0
}

/**
 * A stroke "exists" only when some side paints: style ≠ none AND width > 0 — the same
 * never-rendered predicate groupSelectionColors applies to border-top-color, but checked
 * on ALL four sides so a lone border-bottom divider still counts as a stroke. `read` is
 * draft-aware at the call site (Panel passes currentValue), keeping this a pure function.
 * jsdom reports '' for unset style/width — same "no visible border" reading as none/0.
 */
export function strokeIsEmpty(read: (prop: string) => string): boolean {
  return ['top', 'right', 'bottom', 'left'].every((side) => {
    const style = read(`border-${side}-style`)
    if (style === 'none' || style === '') return true
    const width = Number.parseFloat(read(`border-${side}-width`))
    return !Number.isFinite(width) || width === 0
  })
}

export { px, fromPx, effectiveBackground, isFlex, snapWeight, firstFamily, cssFamilyValue, documentFontFamilies, mainAxisProp }
