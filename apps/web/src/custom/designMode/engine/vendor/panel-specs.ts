import type { TaggedElement } from './source'
import { DraftStore } from './drafts'
import { UTILITY_PREFIXES, parseColor, type Theme, type Tokens } from './tokens'
import type { ColorEntry, ScaleEntry } from './tokenpicker'
import { elementOffsets, hasDirectText, isFlex, mainAxisProp, marginEdgeOffsets } from './panel-readers'

export interface RowSpec {
  label: string
  props: string[]
  min?: number
  max?: number
  toCss?: (n: number) => string
  fromCss?: (css: string) => number
  /** Non-css row (the Position X/Y pair): `read` supplies the value straight from the element —
   * offsets aren't computed-style properties — so the generic css commit path (which would
   * draft a fake `x` property) never runs; `write` below is the commit instead, and no
   * per-side/token affordances wire up. P3 lifted the "always disabled" half: whether the input
   * is editable is LIVE STATE (see `editable`), re-evaluated on every refresh. */
  readOnly?: boolean
  read?: (el: TaggedElement) => number
  /**
   * Live editability of a `readOnly` row — evaluated on EVERY refresh, never once at build
   * time: P3's Absolute toggle flips X/Y between editable and read-only with a refresh(), not a
   * rebuild, and the row must keep riding the standard field lifecycle (POSITION_ROWS was
   * declared as a RowSpec precisely so refresh/destroy stay on one track). Absent → the row is
   * permanently read-only.
   */
  editable?: (el: TaggedElement, drafts: DraftStore) => boolean
  /**
   * Commit for a `readOnly` row, whose value is not a css property of its own (X/Y are
   * offsets, and their drafting target depends on state — see writeInset). Called by the panel
   * ONLY while `editable` says so, so this never has to re-check the read-only state itself.
   */
  write?: (el: TaggedElement, n: number, drafts: DraftStore) => void
  /** When true (W/H rows), a sizing chevron menu button (Fixed/Hug/Fill, ui/menu.ts) renders
   * next to the field. */
  sizeMode?: boolean
  /** When true (e.g. LH), the field accepts the literal keyword `auto` and displays it via setAuto(). */
  allowAuto?: boolean
  /** Draft value to apply when the user types the `auto` keyword (only meaningful with allowAuto). */
  autoCss?: string
  /**
   * Fired once per prop, immediately before that prop's value is drafted (after onBeforeEdit,
   * before drafts.apply). Used by Stroke's width fields: drafting a border-*-width while the
   * computed border-*-style is 'none' also drafts border-*-style: solid (one-time), so a
   * newly-drafted width is actually visible. Receives the live DraftStore so it can read/write
   * drafts itself (SECTIONS is a module-level const and can't close over a Panel instance).
   */
  onBeforeApply?: (el: TaggedElement, prop: string, drafts: DraftStore) => void
}

export interface SectionSpec {
  title: string
  rows: RowSpec[]
  expandKey?: string
  expandRows?: RowSpec[]
  /** Section renders always (stable DOM order) but is hidden via the `hidden` attribute when this returns false. */
  visible?: (el: TaggedElement, drafts?: DraftStore) => boolean
  /** Custom section body — used by Layout, which isn't a plain row-field grid. */
  custom?: 'layout' | 'typography' | 'fill' | 'stroke'
  /** Tooltip (title attr) on the section title — used where the section name itself needs explaining (Margin). */
  hint?: string
}

const RADIUS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']

const BORDER_WIDTH_PROPS = ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']
const BORDER_STYLE_PROPS = ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']
const BORDER_COLOR_PROPS = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']

// Gap isn't built via buildField/RowSpec (it's a bespoke NumberField inside the Layout
// section's custom body — see buildLayoutSection), but it still needs a RowSpec-shaped
// object so tokenEntriesFor/pillLabelFor (both keyed on `.props`) and the boundTokens map
// (keyed on `.props.join(',')`) can treat it identically to every other token-pickable field.
const GAP_SPEC: RowSpec = { label: 'Gap', props: ['gap'], min: 0 }

/**
 * What the Position X/Y pair means for one element right now — THREE states, not two (the P3
 * plan's §Panel says "editable when the element has an `absolute` draft or its computed
 * position is absolute/fixed", which collapses two genuinely different write targets into one
 * and mis-reads the off direction):
 *
 * - `'draft'` — an `absolute` draft with `on: true` owns position/left/top as its preview, so
 *   an X/Y edit is a move of THAT draft's inset (drafts.setAbsoluteInset), never a css draft
 *   that would fight the preview for the same inline properties.
 * - `'code'` — already absolute/fixed in the app's own code, with no draft saying otherwise: an
 *   X/Y edit is a plain `left`/`top` css draft and needs no structural op at all (P3 delegated
 *   call #2 — a bare inset delta is only an incoherent ask across the static↔absolute
 *   *transition*, which is what the `absolute` op is for).
 * - `'flow'` — in normal flow: X/Y are READ-ONLY offsets, exactly P1's behavior.
 *
 * The `on: false` trap (why `structuralOf(el)?.kind === 'absolute'` is the wrong test): an
 * `absolute` draft with `on: false` is the absolute→FLOW direction. Kind alone would report that
 * element as absolute — inverting both the toggle's pressed state and X/Y's editability for the
 * one gesture whose whole point is leaving absolute behind.
 */
export type PositionState = 'draft' | 'code' | 'flow'

export function positionStateOf(el: TaggedElement, drafts: DraftStore): PositionState {
  const s = drafts.structuralOf(el)
  if (s?.kind === 'absolute') {
    // While comparing, the element shows the CODE's own reality (the structural preview is
    // restored) — so the draft must not claim 'draft' here, the same "a draft speaks only while
    // it's being previewed" rule the css readers follow via `isComparing ? null : current(...)`.
    // It reads 'flow' rather than falling through to the computed position (PR #46 review finding
    // 7): on an `on: false` draft the element IS still absolute in the code, so the computed read
    // answered 'code' and left X/Y ENABLED — but DraftStore.apply refuses position/left/top while
    // any absolute draft lives (drafts.ts's ABSOLUTE_PROPS guard), so every typed value silently
    // vanished. Compare is a read-only view of the code by definition; both directions of the
    // draft now disable the fields, which is what the on:true case already did by accident of the
    // preview being restored to `static`.
    if (drafts.isComparing(el)) return 'flow'
    return s.on ? 'draft' : 'flow'
  }
  const position = getComputedStyle(el).position
  return position === 'absolute' || position === 'fixed' ? 'code' : 'flow'
}

/** Effectively out of flow — the Absolute toggle's pressed state AND the `.flex-child-controls`
 * hide gate (an out-of-flow child has no flex-child alignment, same as Figma). One predicate so
 * the toggle can never claim "absolute" while the align strip still offers align-self. */
export function isEffectivelyAbsolute(el: TaggedElement, drafts: DraftStore): boolean {
  return positionStateOf(el, drafts) !== 'flow'
}

/**
 * The X/Y commit, routed by state (see positionStateOf). Never called in the `'flow'` state —
 * the panel gates on `RowSpec.editable` first, which is what keeps this from drafting a `left`
 * on an in-flow element (a no-op the user couldn't see and an ask the agent couldn't honor).
 */
function writeInset(el: TaggedElement, axis: 'left' | 'top', n: number, drafts: DraftStore): void {
  const s = drafts.structuralOf(el)
  if (s?.kind === 'absolute' && s.on) {
    // setAbsoluteInset takes the PAIR (the op carries both insets), so the axis the user didn't
    // touch has to ride along at its current value rather than being reset to 0.
    drafts.setAbsoluteInset(el, axis === 'left' ? n : s.left, axis === 'top' ? n : s.top)
    return
  }
  // 'code' state: an ordinary css draft on the real property, so token mapping (left-6/top-10),
  // Compare, the changelist and the verifier all need no new cases.
  drafts.apply(el, axis, `${n}px`)
}

/**
 * The X/Y rows' reader — the same basis those rows WRITE, which is the whole point (PR #46 review
 * finding 2). `writeInset` produces a CSS `left`/`top` (or the identically-defined inset of an
 * `absolute` draft), and CSS resolves those against the element's MARGIN edge, while
 * offsetLeft/offsetTop report its BORDER edge. Reading through elementOffsets therefore made the
 * field non-convergent on any element with a left/top margin: type 40 into X on a card with
 * `ml-4`, and the very next refresh() read 56 back out and displayed that — the number visibly
 * drifted away from what the user typed, once per edit.
 *
 * Out-of-flow is the gate, and reading the COMPUTED position is deliberately the right test here
 * (unlike resize.ts's writeBox, which needs positionStateOf's three-way split): the question is
 * only "is a CSS left/top currently placing this box", and in the `draft` state our own preview
 * genuinely is doing exactly that. An in-flow element keeps elementOffsets verbatim — P1's
 * read-only display legitimately wants offsetParent/border semantics, and no inset is being
 * written there to converge with.
 */
function positionRead(el: TaggedElement, axis: 'x' | 'y'): number {
  const position = getComputedStyle(el).position
  const outOfFlow = position === 'absolute' || position === 'fixed'
  const offsets = outOfFlow ? marginEdgeOffsets(el) : elementOffsets(el)
  return axis === 'x' ? offsets.x : offsets.y
}

/** Position block rows (Figma pivot P1, spec §5): Figma's header X/Y pair above Size — offsets
 * read through positionRead above (offsetParent-relative via elementOffsets in flow, exactly P1's
 * behavior; margin-edge once out of flow, so the field converges with what it writes — review
 * finding 2). Declared HERE like every other row (PR #44 follow-up) so the block rides
 * the standard field lifecycle — refresh and destroy on one track — instead of bespoke panel DOM
 * with its own copies of both. P3 made them CONDITIONALLY editable through that same machinery:
 * `editable` is the live gate, `write` the per-axis commit. */
export const POSITION_ROWS: RowSpec[] = [
  {
    label: 'X',
    props: ['x'],
    readOnly: true,
    read: (el) => positionRead(el, 'x'),
    editable: isEffectivelyAbsolute,
    write: (el, n, drafts) => writeInset(el, 'left', n, drafts),
  },
  {
    label: 'Y',
    props: ['y'],
    readOnly: true,
    read: (el) => positionRead(el, 'y'),
    editable: isEffectivelyAbsolute,
    write: (el, n, drafts) => writeInset(el, 'top', n, drafts),
  },
]

// Tailwind's numeric spacing scale (padding/margin/gap/width/height) — each step n maps to
// n * theme.spacingBasePx. Kept as a flat literal list (not generated) so the exact set —
// including the half-steps (0.5, 1.5, ...) and the post-12 non-uniform stride (14, 16, 20, ...) —
// is easy to eyeball against Tailwind's own docs.
const SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64,
  72, 80, 96,
]

// RowSpec.props arrays with length > 1 that correspond to a single Tailwind synthetic/shorthand
// utility prefix not derivable from any individual longhand's own UTILITY_PREFIXES entry (e.g.
// ['padding-left','padding-right'] should resolve to 'px', not 'pl' from props[0]). Keyed by the
// joined prop list (order matches each RowSpec's own `props` array above). Stroke's W field
// (BORDER_WIDTH_PROPS) has no entry here — border-width isn't part of Tailwind's linear spacing
// scale (see tokens.ts's own separate BORDER_WIDTH_SCALE) and tokenEntriesFor returns null for
// it, so buildField never wires onTokenOpen for that field (no icon, `=` inert) and pillLabelFor is
// never reached for it either.
const MULTI_PROP_SYNTHETIC: Record<string, string> = {
  [['padding-left', 'padding-right'].join(',')]: 'padding-inline',
  [['padding-top', 'padding-bottom'].join(',')]: 'padding-block',
  [['margin-left', 'margin-right'].join(',')]: 'margin-inline',
  [['margin-top', 'margin-bottom'].join(',')]: 'margin-block',
  [RADIUS.join(',')]: 'border-radius',
}

/** Resolves a RowSpec's `props` array to its Tailwind utility prefix (e.g. 'px', 'rounded', 'w'). */
function utilityPrefixFor(props: string[]): string | undefined {
  if (props.length === 1) return UTILITY_PREFIXES[props[0]]
  const synthetic = MULTI_PROP_SYNTHETIC[props.join(',')]
  return synthetic ? UTILITY_PREFIXES[synthetic] : undefined
}

/**
 * Tooltip text bridging a row to its CSS props and Tailwind utility ("padding-left,
 * padding-right → px-*"). Derived via utilityPrefixFor from the same UTILITY_PREFIXES map
 * request.ts emits from, so a hint that names a utility can never drift from what request.ts
 * emits; rows the utility map doesn't cover (font-size, stroke width) fall back to the bare
 * CSS prop list.
 */
export function cssHintFor(spec: { props: string[] }): string {
  // font-size maps to text-* on the request path via a special case in tokens.ts (the 'text'
  // prefix is shared with color utilities, so it can't live in UTILITY_PREFIXES) — mirror it
  // here so the S field's tooltip names the utility the request will actually emit.
  if (spec.props.includes('font-size')) return 'font-size → text-*'
  const css = spec.props.join(', ')
  const prefix = utilityPrefixFor(spec.props)
  return prefix ? `${css} → ${prefix}-*` : css
}

const RADIUS_PROP_SET = new Set(RADIUS)

/**
 * Scale source for the `=` token picker (B5), keyed by RowSpec.props. Spacing props (padding/
 * margin/gap/width/height) resolve through Tailwind's numeric scale x theme.spacingBasePx;
 * radius props through theme.radiusScale; font-size through the text scale; everything else
 * (e.g. opacity) has no token picker and returns null.
 */
export function tokenEntriesFor(spec: { props: string[] }, theme: Theme, tokens: Tokens): ScaleEntry[] | null {
  if (spec.props.some((p) => p === 'font-size')) {
    const entries = tokens.textScale.map((t) => ({ label: t.name, px: t.px }))
    return entries.length === 0 ? null : entries
  }
  if (spec.props.some((p) => RADIUS_PROP_SET.has(p))) {
    const entries = Object.entries(theme.radiusScale).map(([label, px]) => ({ label, px }))
    return entries.length === 0 ? null : entries
  }
  const prefix = utilityPrefixFor(spec.props)
  const isSpacingProp = prefix !== undefined && prefix !== 'opacity' && prefix !== 'border'
  if (isSpacingProp) {
    if (theme.spacingBasePx === null) return null
    const base = theme.spacingBasePx
    return SPACING_SCALE.map((n) => ({ label: String(n), px: n * base }))
  }
  return null
}

/** Named color-token entries for the color rows' `{ }` icon — null when the theme defines
 * no (parseable) color tokens, which suppresses the icon entirely (spec: no empty dropdowns). */
export function colorTokenEntries(tokens: Tokens): ColorEntry[] | null {
  const entries = tokens.colors
    .filter((t) => parseColor(t.value) !== null)
    .map((t) => ({ label: t.name, color: t.value }))
  return entries.length === 0 ? null : entries
}

/** border-top-width -> border-top-style (matches each width longhand to its side's style longhand). */
function styleForWidthProp(widthProp: string): string {
  return widthProp.replace('-width', '-style')
}

/**
 * Drafting a border width only becomes visible if the side actually has a style — a computed
 * `border-style: none` swallows any width. So the FIRST time a width is drafted while the
 * computed style for that side is 'none', also draft that side's style to 'solid' (one-time —
 * a later width edit while style is already something else must not stomp a user-chosen style).
 */
function draftSolidIfNone(el: TaggedElement, widthProp: string, drafts: DraftStore): void {
  const styleProp = styleForWidthProp(widthProp)
  const draftStyle = drafts.current(el, styleProp)
  // jsdom reports '' rather than the spec default 'none' for an unset border-style — treat
  // both as "no visible border yet" so the auto-solid behavior works in tests and browsers alike.
  const computedStyle = draftStyle ?? getComputedStyle(el).getPropertyValue(styleProp)
  if (computedStyle === 'none' || computedStyle === '') drafts.apply(el, styleProp, 'solid')
}

/**
 * Typing/scrubbing/token-picking a main-axis size means Fixed intent; on an app-CSS `flex-1`
 * element the number would otherwise be a silent no-op (basis 0% + grow still win the main-axis
 * sizing over an authored width). This is the same defeat onSizeModeChange's Fixed/Hug branches
 * perform (panel-layout.ts) — kept as ONE shared implementation, exported here and called from
 * both places, rather than two copies that could drift.
 */
export function defeatFillIfGrowing(el: TaggedElement, prop: string, drafts: DraftStore): void {
  // An out-of-flow element has NO flex-child semantics — its flex parent doesn't lay it out, so
  // there is no fill left to defeat (PR #46 review finding 8, the same predicate refreshFlexChild
  // and sizeMenuItems gate on, never a third hand-rolled copy). Without this, resizing an
  // absolute element that carries app-CSS `flex-1` drafted `flex-grow: 0` + `flex-basis: auto`
  // and shipped them on the same request as the absolute op — a contradictory ask, and NOT a
  // no-op on the wire (request.ts only drops no-op deltas, and these differ from the app's CSS).
  // Exactly the pollution the task-5 review killed for the cross-axis case.
  if (isEffectivelyAbsolute(el, drafts)) return
  const parent = el.parentElement
  if (!parent || !isFlex(parent as TaggedElement)) return
  const direction = getComputedStyle(parent).flexDirection.startsWith('column') ? 'column' : 'row'
  if (prop !== mainAxisProp(direction)) return
  const grow = Number.parseFloat(drafts.current(el, 'flex-grow') ?? getComputedStyle(el).getPropertyValue('flex-grow') ?? '0')
  if (grow >= 1) {
    drafts.apply(el, 'flex-grow', '0')
    drafts.apply(el, 'flex-basis', 'auto')
  }
}

const WEIGHTS: Array<[value: string, label: string]> = [
  ['100', 'Thin'],
  ['200', 'Extra Light'],
  ['300', 'Light'],
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600', 'Semibold'],
  ['700', 'Bold'],
  ['800', 'Extra Bold'],
  ['900', 'Black'],
]

// Canonical option tables for the panel's selects — panel.ts and the Storybook select
// stories both import these, so the catalog can't drift from the shipped dropdowns.
const STROKE_STYLES: Array<[value: string, label: string]> = [
  ['none', 'None'],
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
]

const SIZE_MODES: Array<[value: string, label: string]> = [
  ['fixed', 'Fixed'],
  ['hug', 'Hug'],
  ['fill', 'Fill'],
]

// The W/H specs — rendered as the first two rows of the unified Layout section body
// (spec M-C). Exported so panel.ts's buildBody layout branch can compose them directly.
const SIZE_ROWS: RowSpec[] = [
  { label: 'W', props: ['width'], min: 0, sizeMode: true, onBeforeApply: defeatFillIfGrowing },
  { label: 'H', props: ['height'], min: 0, sizeMode: true, onBeforeApply: defeatFillIfGrowing },
]

// The padding H/V specs — rendered inside the padding block of the unified Layout section
// body (spec M-C; reordered 2026-07-06 layout-polish spec), after the auto-layout cluster
// and before the align block. Exported so panel.ts's buildBody layout branch can compose
// them directly.
const PADDING_ROWS: RowSpec[] = [
  { label: 'H', props: ['padding-left', 'padding-right'], min: 0 },
  { label: 'V', props: ['padding-top', 'padding-bottom'], min: 0 },
]

// M-D min/max sizing (spec M-D): disclosure rows under W/H, derived from the size row they
// constrain (rather than a positional slice of a flat 4-entry array) so W and H can never
// desync from their own min/max pair. Typing `auto` clears the constraint — autoCss carries
// each property's CSS initial value (min-*: auto, max-*: none), so the request says "remove
// the constraint" in keywords, never a measured px.
// Labels are axis-qualified (Min W / Max H) because the rows sit below the side-by-side W|H
// pair (2026-07-06 size-pair spec), no longer nested under their axis.
export function minMaxRowsFor(sizeSpec: RowSpec): RowSpec[] {
  const p = sizeSpec.props[0] // 'width' | 'height'
  return [
    { label: `Min ${sizeSpec.label}`, props: [`min-${p}`], min: 0, allowAuto: true, autoCss: 'auto' },
    { label: `Max ${sizeSpec.label}`, props: [`max-${p}`], min: 0, allowAuto: true, autoCss: 'none' },
  ]
}

// Section ORDER is fixed forever: Layout -> Typography -> Fill -> Stroke -> Appearance.
// The Margin section was REMOVED (not hidden) in the 2026-07-22 Figma pivot, superseding
// the margin half of panel-patterns decision #1: margins are a code concept the designer
// never sees — the translation layer may still read/write them, but no panel control does.
const SECTIONS: SectionSpec[] = [
  {
    title: 'Layout',
    rows: [],
    custom: 'layout',
    expandKey: 'padding',
    expandRows: [
      { label: 'T', props: ['padding-top'], min: 0 },
      { label: 'R', props: ['padding-right'], min: 0 },
      { label: 'B', props: ['padding-bottom'], min: 0 },
      { label: 'L', props: ['padding-left'], min: 0 },
    ],
    // Unified UI3 section (spec M-C; reordered 2026-07-06 layout-polish spec): W/H rows ->
    // auto-layout cluster -> padding block -> align block, one fixed order, flex or not. The
    // cluster alone is single-select-only (B6); rows keep multi relative-delta behavior.
  },
  {
    title: 'Typography',
    rows: [],
    custom: 'typography',
    visible: hasDirectText,
  },
  {
    title: 'Fill',
    rows: [],
    custom: 'fill',
  },
  {
    title: 'Stroke',
    rows: [],
    custom: 'stroke',
    expandKey: 'stroke',
    expandRows: [
      { label: 'T', props: ['border-top-width'], min: 0, onBeforeApply: draftSolidIfNone },
      { label: 'R', props: ['border-right-width'], min: 0, onBeforeApply: draftSolidIfNone },
      { label: 'B', props: ['border-bottom-width'], min: 0, onBeforeApply: draftSolidIfNone },
      { label: 'L', props: ['border-left-width'], min: 0, onBeforeApply: draftSolidIfNone },
    ],
  },
  {
    title: 'Appearance',
    expandKey: 'radius',
    rows: [
      { label: 'R', props: RADIUS, min: 0 },
      {
        label: 'O',
        props: ['opacity'],
        min: 0,
        max: 100,
        toCss: (n) => String(n / 100),
        fromCss: (css) => {
          const n = Number.parseFloat(css)
          return Math.round((Number.isFinite(n) ? n : 1) * 100)
        },
      },
    ],
    expandRows: [
      { label: 'TL', props: ['border-top-left-radius'], min: 0 },
      { label: 'TR', props: ['border-top-right-radius'], min: 0 },
      { label: 'BR', props: ['border-bottom-right-radius'], min: 0 },
      { label: 'BL', props: ['border-bottom-left-radius'], min: 0 },
    ],
  },
]

export {
  RADIUS,
  BORDER_WIDTH_PROPS,
  BORDER_STYLE_PROPS,
  BORDER_COLOR_PROPS,
  GAP_SPEC,
  SPACING_SCALE,
  MULTI_PROP_SYNTHETIC,
  utilityPrefixFor,
  RADIUS_PROP_SET,
  styleForWidthProp,
  draftSolidIfNone,
  WEIGHTS,
  STROKE_STYLES,
  SIZE_MODES,
  SIZE_ROWS,
  PADDING_ROWS,
  SECTIONS,
}
