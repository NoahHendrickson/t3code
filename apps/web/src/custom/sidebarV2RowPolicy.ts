/**
 * Sidebar V2 row presentation policy — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Pure functions, deliberately: everything here is a decision about how a row
 * should look given what it is, with no React, no upstream state and no DOM. It
 * lives in `custom/` so `SidebarV2.tsx` carries the call sites rather than the
 * rules — the same shape the meta rows and the status marks already use.
 *
 * ## The two recede rules, and why they are two
 *
 * There are two distinct "this row is quiet" notions and they are not the same
 * rule, which is worth stating because they read like duplicates:
 *
 * - **`shouldRecede` (upstream's, in SidebarV2)** describes a *slim* row in
 *   the settled shelf — history you have already dealt with. It folds in
 *   read/woke state, and slim rows keep it for brightness too: an unread
 *   settled thread still reads brighter than a read one there.
 * - **`threadCardTitleRecedes` (here)** describes a *card* with nothing left
 *   in motion or blocked on you — Done or Idle, per the component set. A
 *   card's title AND surface both read this one predicate (two definitions of
 *   "receded" in one rectangle dim different parts in opposite directions),
 *   and the card deliberately does not brighten for unread-ness the way slim
 *   rows do: the unread signal is the Done dot, not the title's tone.
 *
 * The two rules disagree on Working and on unread-Done by design, so
 * collapsing them into one predicate would silently change both variants.
 * Naming them separately is the fix; merging them is not.
 */
import { cn } from "~/lib/utils";

// SIDEBAR_V2_ICON_BUTTON_CLASS moved to custom/sidebarV2TrailingColumn.ts:
// this module is title-recede and surface policy, and the trailing column is
// its own concern with its own derivation to carry.

/** Does a card's *title* step back?
 *
 * The component set (Figma 113:724) mutes exactly two statuses at rest — Done
 * and Idle — and restores both on hover or selection. The rule underneath is
 * "is this row finished": a done thread is reporting an outcome you may merely
 * acknowledge, and an idle one has already been dealt with. Working, Approval,
 * Input and Failed all keep the foreground title, because each is either in
 * motion or blocked on you. (An earlier revision muted Working instead; the
 * component set draws Working titles at full strength — the rain is the
 * quiet-vs-busy signal, not the title's tone.)
 *
 * Route-active and multi-selected rows never recede: you have just pointed at
 * them, so dimming would read as the row being disabled rather than quiet. */
export function threadCardTitleRecedes(input: {
  /** The unread-done dot — an outcome reported but not yet opened. */
  readonly isDone: boolean;
  /** No status mark at all — read, settled, nothing pending. */
  readonly isIdle: boolean;
  readonly isActive: boolean;
  readonly isSelected: boolean;
}): boolean {
  if (input.isActive || input.isSelected) return false;
  return input.isDone || input.isIdle;
}

/** The surface every Sidebar V2 row shares.
 *
 * Surface encodes exactly one thing: interaction. A row is filled when you are
 * pointing at it or when it is the one you are on — never because of its
 * status. An earlier revision gave working rows a resting fill on the theory
 * that a live agent should look alive; with five or six threads running the
 * panel became a field of lit rectangles and the hover cue stopped meaning
 * anything. The trailing mark already says a thread is working, in a fixed
 * column, without spending the background to say it.
 *
 * `rounded-md`, not `rounded-lg`: `--radius` is 10px here and the design's 8px
 * is `--radius-md`. */
export function threadRowSurfaceClassName(input: {
  readonly isActive: boolean;
  readonly isSelected: boolean;
  /** The variant's own recede rule — the card policy for cards, upstream's
      slim-shelf rule for shelves. See the note at the top of this file. */
  readonly recedes: boolean;
}): string {
  return cn(
    "group/v2-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none",
    input.isActive
      ? "bg-sidebar-row-active text-sidebar-foreground"
      : input.isSelected
        ? "bg-sidebar-row-selected text-sidebar-foreground"
        : input.recedes
          ? "text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
  );
}

/** A card title's colour and size. Hover restores a receded title, which is
    what keeps the dimming reading as depth rather than as a disabled row.
    Weight is Regular for every status (Figma 113:724 draws no medium titles);
    the colour alone carries the receded/forward distinction. Size is
    0.875rem (14px) — explicit, not `text-sm`, so the panel's --text-sm remap
    to 13px cannot shrink it. Receded titles use
    `--fork-sidebar-card-title-receded` (dark panel) rather than
    `--muted-foreground`, so lifting title brightness does not re-derive meta
    /70, shelf ghosts, or unread encoding that were calibrated against
    upstream's dimmer muted channel. Light mode falls through to
    `--muted-foreground` via the var fallback. */
export function threadCardTitleClassName(input: { readonly recedes: boolean }): string {
  return cn(
    // leading-[14px] matches the 14px status slot — leading-4 (16px) made the
    // title line box taller than the rain and read as the mark hanging low.
    "truncate text-[0.875rem] leading-[14px] font-normal",
    input.recedes
      ? "text-[color:var(--fork-sidebar-card-title-receded,var(--muted-foreground))] group-hover/v2-row:text-foreground"
      : "text-foreground",
  );
}
