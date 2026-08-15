/**
 * The Sidebar V2 list's leading column and vertical rhythm — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Sibling to `sidebarV2TrailingColumn`, and the same idea from the other edge:
 * that module owns where trailing controls land, this one owns where content
 * starts and how far apart rows sit. Both exist because the numbers are
 * derived from each other rather than chosen, and a derivation spelled out at
 * three call sites is a derivation that drifts at two of them.
 *
 * ## The 34px edge
 *
 * A card's prompt and a project header's label start at the same x, and that
 * is the whole point of the leading column — the eye runs down one edge
 * whether it is crossing cards or headers. The two sides reach it differently,
 * which is exactly why neither can be retuned alone:
 *
 * - card:   list pad 8 + card px-1 4 + `statusBox` 16 + `titleGap` 6 = 34
 * - header: list pad 8 + `headerMarkBox` 24 + `headerGap` 2          = 34
 *
 * `repoIndent` is deliberately NOT on that edge. The design puts the repo
 * line's content at 20px inside the card (32 absolute), two pixels left of the
 * prompt, so the branch glyph's own optical inset brings its ink back under
 * the text rather than under the prompt's first stem. Setting it to 22 to
 * "match" pushes the ink visibly right.
 *
 * ## The vertical rhythm
 *
 * The list `ul` supplies the only gap between rows, so a project header buys
 * the rest of its own spacing out of its margins:
 *
 * - card to card:          `listGap` 2
 * - header to first card:  `listGap` 2 + `headerTrail` 2  = 4
 * - card to next header:   `listGap` 2 + `headerLead` 18  = 20
 *
 * The project header is not the only row that pays into this. Two other
 * list-level separators sit on the same gap and were tuned against it when it
 * was 4px, so they are derived here too rather than left to drift by the
 * difference:
 *
 * - pinned divider:        `listGap` 2 + `pinnedDividerMargin` 8  = 10 a side
 * - shelf header, above:   `listGap` 2 + `shelfHeaderLead` 14     = 16
 * - shelf header, below:   `listGap` 2 + `shelfHeaderTrail` 6     = 8
 *
 * Those three totals are deliberately unchanged from before the card retune —
 * the design says nothing about shelves or the pinned divider, so halving the
 * gap out from under them would have been a side effect rather than a
 * decision. Change `listGap` and all five margins have to be re-derived.
 *
 * Class names rather than numbers: the values have to reach the DOM as
 * Tailwind utilities, and a px→utility lookup at each call site would be one
 * more place to get it wrong. The guard asserts the arithmetic against these
 * exports, so the derivation is checked rather than merely described.
 */
export const SIDEBAR_V2_CARD_ALIGNMENT = {
  /** The card's leading status box. The marks inside keep their own sizes —
      the rain is 14px tall, a status dot 8px — and centre in it. */
  statusBox: "size-4",
  /** Status box to prompt on the title line. */
  titleGap: "gap-1.5",
  /** The repo line's indent inside the card. Two pixels left of the prompt;
      see the note above before "fixing" it. */
  repoIndent: "pl-5",
  /** The project header's folder/chevron box — 24px, so its 16px glyph shares
      the status box's 20px centre. */
  headerMarkBox: "size-6",
  /** Header mark to label. */
  headerGap: "gap-0.5",
  /** The list ul's gap — the only vertical space between rows. */
  listGap: "gap-0.5",
  /** What a header adds above itself, on top of `listGap`, to reach 20. */
  headerLead: "mt-[18px]",
  /** What a header adds below itself, on top of `listGap`, to reach 4. */
  headerTrail: "mb-0.5",
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
  cardPad: 4,
  statusBox: 16,
  titleGap: 6,
  repoIndent: 20,
  headerMarkBox: 24,
  headerGap: 2,
  listGap: 2,
  headerLead: 18,
  headerTrail: 2,
  pinnedDividerMargin: 8,
  shelfHeaderLead: 14,
  shelfHeaderTrail: 6,
} as const;

/** Where a card's prompt starts, measured from the panel's edge. */
export function sidebarV2PromptEdge(): number {
  const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
  return px.listPad + px.cardPad + px.statusBox + px.titleGap;
}

/** Where a project header's label starts, measured from the panel's edge.
    Equal to `sidebarV2PromptEdge()` — that equality is the invariant. */
export function sidebarV2HeaderLabelEdge(): number {
  const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
  return px.listPad + px.headerMarkBox + px.headerGap;
}
