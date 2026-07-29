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
 * - **`recedes` (upstream's, passed in)** describes a *slim* row in the settled
 *   shelf — history you have already dealt with. It dims the whole row,
 *   including its surface, and it folds in read/woke state.
 * - **`threadCardTitleRecedes` (here)** describes a *card* whose subject line
 *   has nothing waiting on you. It touches the title only, never the surface,
 *   and it ignores read state entirely.
 *
 * They overlap on read-ready threads and diverge everywhere else, so collapsing
 * them into one predicate would silently change both. Naming them separately is
 * the fix; merging them is not.
 */
import { cn } from "~/lib/utils";

// SIDEBAR_V2_ICON_BUTTON_CLASS moved to custom/sidebarV2TrailingColumn.ts:
// this module is title-recede and surface policy, and the trailing column is
// its own concern with its own derivation to carry.

/** Does a card's *title* step back?
 *
 * The component set mutes exactly two statuses at rest — Working and Idle — and
 * restores both on hover or selection. The rule underneath is "is there
 * anything here for you to act on": a running agent is the row you can least
 * act on, and an idle one has already been dealt with. Approval, Input, Done
 * and Failed all stay at full strength, because each is either blocked on you
 * or reporting an outcome you have not seen.
 *
 * Route-active and multi-selected rows never recede: you have just pointed at
 * them, so dimming would read as the row being disabled rather than quiet. */
export function threadCardTitleRecedes(input: {
  readonly isWorking: boolean;
  /** No status mark at all — read, settled, nothing pending. */
  readonly isIdle: boolean;
  readonly isActive: boolean;
  readonly isSelected: boolean;
}): boolean {
  if (input.isActive || input.isSelected) return false;
  return input.isWorking || input.isIdle;
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
  /** Upstream's slim-shelf rule — see the note at the top of this file. */
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

/** A card title's colour and weight. Hover restores a receded title, which is
    what keeps the dimming reading as depth rather than as a disabled row.
    Idle alone drops to regular weight — a quiet subject line, not a headline —
    while working (and every status that wants you) stays medium. */
export function threadCardTitleClassName(input: {
  readonly recedes: boolean;
  readonly isIdle: boolean;
}): string {
  return cn(
    "truncate",
    input.isIdle ? "font-normal" : "font-medium",
    input.recedes ? "text-muted-foreground group-hover/v2-row:text-foreground" : "text-foreground",
  );
}
