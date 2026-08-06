/**
 * The Sidebar V2 trailing column — see
 * `.fork/customizations.yaml#sidebar-v2-row-action-hit-area`.
 *
 * One file owns two things that were previously spelled out at every call site:
 * the box every icon-only control in the list is drawn in, and the offsets that
 * put their glyphs on a single vertical axis.
 *
 * ## The axis
 *
 * Everything trailing centres 24px in from the panel's content edge, and the
 * chrome rows are what set that number: they end at pe-3 (12px), and a 24px
 * button flush there centres its glyph 12px further — 24. Everything else in
 * the column measures itself against that centre: each card's runtime glyph
 * (card content edge 12px in, 24px box — same as the hover actions — with the
 * 14px mark centred inside), the hover actions on both row variants, the
 * shelf chevrons, and the project header's plus. (The status mark used to
 * sit in this column too; it now leads the title line, and the lower card
 * rows indent under the title text instead.)
 *
 * The rows do NOT share a right edge, which is what makes this worth writing
 * down once. The list rows end 8px in where the chrome rows end 12; a card's
 * own px-1 closes that gap, so a 24px box flush with the card's content edge
 * is already on the axis — but a box flush with a row that has no such
 * padding (the header, a slim row's right-0 overlay) sits 4px too far right
 * and spends me-1 to get back. An earlier revision derived these against
 * "both columns end at the same place", which was 4px wrong at the source,
 * and every offset inherited the error — visibly, once the marks stacked.
 *
 * Each offset below is derived from the inset of the edge its control is
 * flush against. They are not interchangeable and none of them is a taste
 * value: change a row's padding and its offset has to be re-derived, or that
 * row's mark steps out of the column on its own.
 */
import { cn } from "~/lib/utils";

/** The shared box for every icon-only control in the thread list: the row hover
 *  actions (snooze, settle, un-settle, wake) and the project header's plus.
 *
 * These carry no label, so the button box IS the target. Sized from padding
 * around a 12px glyph they came out 24x18 and 28x18, two different shapes both
 * under the 24px minimum, on a row where the pointer is already travelling. A
 * uniform 24px square fixes the aim, and the hover fill fixes the other half of
 * the problem: on a transparent button you cannot see where the target ends, so
 * a near miss looks identical to a hit.
 *
 * `bg-foreground/10` rather than `bg-accent`: this sits on top of the row's own
 * hover fill (`--sidebar-row-hover` in both themes), and a foreground alpha is
 * the one value that stays a step brighter than the row under it in dark and a
 * step darker in light.
 *
 * 24px is the *visual* box. On a coarse pointer an invisible child grows the
 * tappable area to 44px without moving anything — upstream's trick, carried by
 * `ui/button` and by the chrome rows' trailing buttons, and this box is the one
 * place it can be spent once for every icon-only control in the list. The row
 * actions are hover-gated and so never reach a touch device at all; the project
 * header's plus is always rendered, and its own handler closes the mobile
 * drawer, which is the code conceding it is reachable there. 24px is exactly
 * the WCAG 2.5.8 floor for a fine pointer, and that is a design-wide stance
 * rather than this box's private compromise: the Figma card-v2 chrome draws
 * every icon-only control — the always-on trailing buttons included — at the
 * same 24px, and the margin everywhere comes from the coarse-pointer child,
 * not the visual box.
 *
 * `focus-visible` for the same reason the hover fill exists: on a transparent
 * button you cannot see where the target ends, and that is as true of keyboard
 * focus as of the pointer. Ring offset against the sidebar because that is
 * the surface these sit on. Offset 1, not TRAILING_BUTTON's 2, and the
 * difference is clipping, not taste: these buttons sit inside the row
 * surface's overflow-hidden, and their right edge is 4px in from the clip
 * boundary (flush with a card's px-1 content edge; me-1 on the bare-edge
 * rows). ring-2 + offset-2 is 4px of shadow outside the button — its outer
 * edge exactly on the boundary, so the ring rendered clipped. offset-1 keeps
 * the full ring with 1px to spare; the chrome buttons are unclipped and keep
 * their 2.
 *
 * A constant rather than a component, because the call sites need to be five
 * different elements — a plain button, a popover trigger's render prop, an
 * absolutely positioned overlay — and only the box is common to them. */
export const SIDEBAR_V2_ICON_BUTTON_CLASS =
  "relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11";

/**
 * What each row spends to reach the axis. Derived, never tuned — the comment on
 * each is the arithmetic, and the numbers only hold against the padding named.
 *
 * An empty string is a derivation, not an omission: it records that the row's
 * own geometry already lands its control on the axis, and the guard pins it so
 * a nudge cannot creep back in. Do not delete the "empty" entries — the module
 * is the derivation, and a call site with no entry has no derivation.
 */
export const SIDEBAR_V2_TRAILING_OFFSET = {
  /** Card hover actions. List pad 8 + card px-1 puts the card's content edge
   *  12px in — the same inset as the chrome rows' pe-3 — so a flush 24px
   *  button centres at 24 with nothing to correct. */
  cardActions: "",
  /** Slim-row hover actions. The overlay is `absolute right-0`, which lands on
   *  the row's border box — the list's 8px inset, padding notwithstanding — so
   *  a flush 24px button centres at 20. me-1 walks it the 4px back. */
  slimActions: "me-1",
  /** The project header's plus. The header has no own horizontal pad, so its
   *  edge is the list's 8px inset: same 4px as the slim overlay. */
  headerPlus: "me-1",
  /** Shelf header chevrons. px-2.5 on the shelf button makes an 18px inset,
   *  and a flush 12px glyph centres 6px further — 24 exactly. Nothing owed. */
  shelfChevron: "",
  /** The chrome rows' trailing inset — the pe-3 that defines the axis. The
   *  24px button is flush with it, so nothing here either. */
  chromeRow: "",
} as const;

/**
 * The three slim-row actions — settle, un-settle, wake — are one control in
 * three branches of a ternary, differing only in label, icon and handler. They
 * were three copies of this string; the copies are how the set drifted apart
 * the first time.
 *
 * Absolutely positioned rather than in flow, which is also why slim rows never
 * had the card's paint-order bug: an opacity-induced stacking context on the
 * time label they swap with lands in the same layer as this button, and DOM
 * order decides.
 */
export const SIDEBAR_V2_SLIM_ROW_ACTION_CLASS = cn(
  SIDEBAR_V2_ICON_BUTTON_CLASS,
  "absolute inset-y-0 right-0 opacity-0 focus-visible:opacity-100 group-hover/v2-row:opacity-100",
  SIDEBAR_V2_TRAILING_OFFSET.slimActions,
);
