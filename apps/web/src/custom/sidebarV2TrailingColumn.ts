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
 * Everything trailing centres on the card's content edge minus 8px: the two
 * chrome icons above the list, each card's runtime glyph, the hover actions on
 * both row variants, the shelf chevrons, and the project header's plus. (The
 * status mark used to sit in this column too; it now leads the title line, and
 * the lower card rows indent under the title text instead.)
 *
 * They do not get there by sharing a right edge, which is what makes this worth
 * writing down once. A 16px box flush with a card's content edge centres 8px
 * in from that edge; an icon centred in a 24px button flush with that same edge
 * centres 4px further left; a 16px icon centred in a 32px chrome button sits
 * 8px in from *its* own edge, 4px the other way. Align the boxes and the marks
 * land on three axes 4px apart — which is the kind of misalignment you feel
 * before you can name it. So each control gives up a few pixels of its own box,
 * and the column reads as one line.
 *
 * Each offset below is derived from the padding of the row it sits in. They are
 * not interchangeable and none of them is a taste value: change a row's padding
 * and its offset has to be re-derived, or that row's mark steps out of the
 * column on its own.
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
 * the WCAG 2.5.8 floor, with no margin, and a shared box whose whole argument
 * is "these were too small to hit" cannot ship the one always-on control at it.
 *
 * `focus-visible` for the same reason the hover fill exists: on a transparent
 * button you cannot see where the target ends, and that is as true of keyboard
 * focus as of the pointer. Ring offset against the sidebar, matching
 * TRAILING_BUTTON, because that is the surface these sit on.
 *
 * A constant rather than a component, because the call sites need to be five
 * different elements — a plain button, a popover trigger's render prop, an
 * absolutely positioned overlay — and only the box is common to them. */
export const SIDEBAR_V2_ICON_BUTTON_CLASS =
  "relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11";

/**
 * What each row spends to reach the axis. Derived, never tuned — the comment on
 * each is the arithmetic, and the numbers only hold against the padding named.
 */
export const SIDEBAR_V2_TRAILING_OFFSET = {
  /** Card hover actions. The card is `px-1` (Figma 113:3718); a 16px box flush
   *  with a content edge 4px in centres 8px further; a 24px button flush centres
   *  12px in. 4px right. */
  cardActions: "-me-1",
  /** Slim-row hover actions. Slim rows stay `px-2.5`; against the card's `px-1`
   *  that is 6px further in, so 6px more nudge — but the shared axis is the
   *  chrome/card trailing column, and slim still uses the historic 2px step
   *  from the old card pad. Kept at -me-0.5 until slim is redrawn. */
  slimActions: "-me-0.5",
  /** The project header's plus. Header has no own horizontal pad (list supplies
   *  8px); same 24px button as card actions, same 4px nudge. */
  headerPlus: "-me-1",
  /** Shelf header chevrons — 4px the *other* way. A 12px glyph flush with a
   *  `px-2.5` row centres 6px in, where a card's trailing box takes 8. */
  shelfChevron: "me-1",
  /** The chrome rows' trailing inset. Figma ends these rows at pr-12; the 24px
   *  plus box is already flush with that edge, so no extra pe. Kept at pe-0
   *  relative to the control row — the outer `pe-3` on the group is the inset. */
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
