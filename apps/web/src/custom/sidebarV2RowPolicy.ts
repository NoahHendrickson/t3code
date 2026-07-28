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

/** The shared box for every icon-only control in the thread list: the row hover
 *  actions (snooze, settle, un-settle, wake) and the project header's new-thread
 *  plus — see `.fork/customizations.yaml#sidebar-v2-row-action-hit-area`.
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
 * absolutely positioned overlay — and only the box is common to them. Each site
 * adds its own placement; see the manifest entry for the axis they share. */
export const SIDEBAR_V2_ICON_BUTTON_CLASS =
  "relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11";

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

/** A card title's colour. Hover restores a receded title, which is what keeps
    the dimming reading as depth rather than as a disabled row. */
export function threadCardTitleClassName(recedes: boolean): string {
  return cn(
    "truncate",
    recedes ? "text-muted-foreground group-hover/v2-row:text-foreground" : "text-foreground",
  );
}
