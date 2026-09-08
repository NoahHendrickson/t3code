/**
 * The Sidebar V2 list's edges and vertical rhythm — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Sibling to `sidebarV2TrailingColumn`, and the same idea from the other edge:
 * that module owns where trailing controls land, this one owns where content
 * starts and how far apart rows sit. Both exist because the numbers are
 * derived from each other rather than chosen, and a derivation spelled out at
 * three call sites is a derivation that drifts at two of them.
 *
 * ## The 20px edge
 *
 * A card's prompt, its repo line, and a project header's folder mark all start
 * at the same x. The card reaches it through its own inline padding and the
 * header through its label button's — the same 12px, on top of the list's 8:
 *
 * - card:   list pad 8 + `cardPad` 12   = 20
 * - header: list pad 8 + `headerPad` 12 = 20
 *
 * The component set (Figma 364:17299, "thread card v3") draws the status mark
 * on the *trailing* end of the title line, so nothing leads the prompt any
 * more and the repo line needs no indent of its own — both rows share the
 * card's padding and nothing else.
 *
 * ## The card's height
 *
 * 54px, drawn: `cardPadY` 8 + `titleLine` 18 + `rowGap` 4 + `metaLine` 16 +
 * 8. `sidebarV2CardHeight()` is that sum, and the row's contain-intrinsic-size
 * hint reads it, so a retune of any term moves the hint with it.
 *
 * ## The vertical rhythm
 *
 * The list `ul` supplies the only gap between rows, so a project header buys
 * the rest of its own spacing out of its margins:
 *
 * - card to card:            `listGap` 2
 * - header to first card:    `listGap` 2 + `headerTrail` 0            = 2
 * - card to next header:     `listGap` 2 + `headerLead` 22            = 24
 * - closed header to header: `listGap` 2 + `headerLeadCollapsed` 6    = 8
 *
 * The design stacks the first card flush under its header (364:18052); the
 * list pitch is the floor, so 2 is as close as a header can get without a
 * negative margin. 24 above a header is the design's gap between groups —
 * and it is the *open* group's, spent below its last card: a header that
 * follows a closed group (or one that painted nothing) takes the compact
 * lead instead, so a run of closed projects reads as a list rather than as
 * a column of gaps.
 *
 * Two other list-level separators sit on the same gap and were tuned against
 * it, so they are derived here too rather than left to drift by the
 * difference:
 *
 * - pinned divider:        `listGap` 2 + `pinnedDividerMargin` 8  = 10 a side
 * - shelf header, above:   `listGap` 2 + `shelfHeaderLead` 14     = 16
 * - shelf header, below:   `listGap` 2 + `shelfHeaderTrail` 6     = 8
 *
 * Those three totals are deliberately unchanged from before the card retune —
 * the design says nothing about shelves or the pinned divider, so moving the
 * gap out from under them would have been a side effect rather than a
 * decision. Change `listGap` and all five margins have to be re-derived.
 *
 * Class names rather than numbers: the values have to reach the DOM as
 * Tailwind utilities, and a px→utility lookup at each call site would be one
 * more place to get it wrong. The guard asserts the arithmetic against these
 * exports, so the derivation is checked rather than merely described.
 */
export const SIDEBAR_V2_CARD_ALIGNMENT = {
  /** The card's inline padding — the design's 12px, and what puts the prompt
      on the 20px edge. */
  cardPad: "px-3",
  /** The card's block padding, 8px each side of the two rows. */
  cardPadY: "py-2",
  /** Title row to repo row. */
  rowGap: "gap-1",
  /** Prompt to the trailing group (actions, pin, status mark) — the design's
      16px, which is what keeps the mark from crowding a long title. */
  titleGap: "gap-4",
  /** Between the members of the trailing group. */
  trailingGap: "gap-1.5",
  /** The status box on the trailing end of the title line. Height is the
      rain's 14px; width is the 12px Phosphor glyph whose inked circle is the
      design's 9.75px. The marks inside keep their own sizes — a dot is 10px,
      the rain 14 tall — and centre in it. Where the box sits relative to the
      trailing axis is `sidebarV2TrailingColumn`'s `cardStatus`. */
  statusBox: "h-[14px] w-[12px]",
  /** The project header's label button's inline padding — the same 12 as
      `cardPad`, which is the whole invariant. */
  headerPad: "px-3",
  /** The header's folder/chevron box: the design's 16px glyph, no box of its
      own beyond that. */
  headerMarkBox: "size-4",
  /** Header mark to label. */
  headerGap: "gap-1.5",
  /** The list ul's gap — the only vertical space between rows. */
  listGap: "gap-0.5",
  /** What a header adds above itself, on top of `listGap`, to reach 24 —
      when the section above it painted cards. */
  headerLead: "mt-[22px]",
  /** What a header adds above itself, on top of `listGap`, to reach 8 —
      when the section above it is closed or empty. */
  headerLeadCollapsed: "mt-1.5",
  /** What a header adds below itself, on top of `listGap`: nothing. */
  headerTrail: "mb-0",
  /** The pinned block's hairline, each side, on top of `listGap`, to reach 10. */
  pinnedDividerMargin: "my-2",
  /** A snoozed/settled shelf header above, on top of `listGap`, to reach 16. */
  shelfHeaderLead: "mt-3.5",
  /** A snoozed/settled shelf header below, on top of `listGap`, to reach 8. */
  shelfHeaderTrail: "mb-1.5",
} as const;

/** The px behind each class above, so the guard can check the arithmetic
    instead of restating the strings. Kept beside the classes deliberately: a
    retune that changes one and not the other fails the guard, which is the
    only way a class-name constant can be held to a derivation at all. */
export const SIDEBAR_V2_CARD_ALIGNMENT_PX = {
  listPad: 8,
  cardPad: 12,
  cardPadY: 8,
  rowGap: 4,
  titleLine: 18,
  metaLine: 16,
  titleGap: 16,
  trailingGap: 6,
  statusBoxWidth: 12,
  statusBoxHeight: 14,
  headerPad: 12,
  headerMarkBox: 16,
  headerGap: 6,
  listGap: 2,
  headerLead: 22,
  headerLeadCollapsed: 6,
  headerTrail: 0,
  pinnedDividerMargin: 8,
  shelfHeaderLead: 14,
  shelfHeaderTrail: 6,
} as const;

/** Where a card's prompt starts, measured from the panel's edge. */
export function sidebarV2PromptEdge(): number {
  const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
  return px.listPad + px.cardPad;
}

/** Where a project header's folder mark starts, measured from the panel's
    edge. Equal to `sidebarV2PromptEdge()` — that equality is the invariant. */
export function sidebarV2HeaderMarkEdge(): number {
  const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
  return px.listPad + px.headerPad;
}

/** A card's drawn height, which its contain-intrinsic-size hint has to match
    or the scrollbar lies by the difference on every row it skips. */
export function sidebarV2CardHeight(): number {
  const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
  return px.cardPadY * 2 + px.titleLine + px.rowGap + px.metaLine;
}
