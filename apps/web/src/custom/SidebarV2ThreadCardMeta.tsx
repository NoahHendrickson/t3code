/**
 * The repo line of a Sidebar V2 thread card — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Fork-owned so the fenced region inside upstream's `Sidebar.tsx` stays a
 * single element rather than thirty lines of layout. The seam is deliberately
 * narrow: everything here is presentational and no callbacks cross it, so an
 * upstream refactor of the row's event wiring cannot reach into this file.
 *
 * One line, always. The component set (Figma 113:724) draws every card at a
 * fixed 52px — title line, 2px, repo line — so nothing here varies the card's
 * height: an absent model or branch leaves its half of the line empty rather
 * than closing it up, and rows stay comparable. The card used to grow a third
 * line for the PR badge and the turn's diff counts; the PR moved up to the
 * title line's trailing cell (`113:4074`) and the diff counts left the design,
 * which is what let the height become a constant.
 *
 * Tones follow the component set: project and branch at `--muted-foreground`,
 * the model at 70% of it. The branch still reads a step brighter than the
 * model — checkout identity is the more distinguishing half of this line —
 * but it carries that on the muted channel now rather than on `foreground/70`.
 * The leading status mark carries busy-vs-blocked; metadata brightness does
 * not encode it.
 *
 * The line's indent is shared with the title row and the group header through
 * custom/sidebarV2CardAlignment, which carries the arithmetic the three of
 * them have to agree on.
 */
import type { ReactNode } from "react";

// Imported through the shim's own path rather than the `lucide-react` alias —
// this file is fork-owned, so there is no upstream import site to preserve.
import { CloudIcon, FolderIcon, GitBranchIcon, LaptopIcon } from "./icons/lucide-phosphor";
import { WorktreeIcon } from "./icons/WorktreeIcon";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";

export interface SidebarV2ThreadCardMetaProps {
  readonly projectTitle: string | null;
  /** Under a project header the name is already on screen one row up, so the
      card stops drawing it — but keeps it for assistive tech, which has no
      "one row up" and would otherwise hear a card with no project at all. */
  readonly projectTitleHidden?: boolean;
  /** The project's favicon, pre-built by the caller, or null to draw the
      design's folder mark instead. A slot for the same reason `terminalSlot`
      is one: the favicon is an asset lookup keyed by environment and cwd,
      and that state stays on the row's side of this seam. Required so a
      call site has to say `null` out loud — see `terminalSlot`. */
  readonly projectIconSlot: ReactNode;
  readonly branch: string | null;
  /** True when the thread runs in a worktree of its own rather than in the
      project's checkout. Swaps the branch mark for the worktree one — see the
      render site for why it replaces rather than joins. */
  readonly hasWorktree?: boolean;
  /** The first port the scanner attributes to one of this thread's own T3
      terminals, or null — see `sidebar-v2-dev-server-pulse`. Non-null pulses
      the branch/worktree mark so the row whose checkout the running server is
      serving can be picked out at a glance. A port rather than a boolean
      because the accessible text names it: the scanner keeps every listening
      TCP socket — no port range, no process filter, no HTTP probe — so
      "Server listening on port N" is what it actually knows, where "dev
      server running" would overclaim (a debugger, an ssh tunnel, and a
      database all count). */
  readonly devServerPort?: number | null;
  /** Pre-built terminal-status glyph (running terminal processes), or null.
      Arrives as a slot because the icon and its accessible label are
      upstream's, and no state crosses this boundary. Rides the line after the
      branch cluster — upstream draws it after the branch in its combined row,
      and this keeps that reading order. Required rather than optional, so a
      call site has to say `null` out loud: an optional slot dropped in a sync
      resolution is invisible to both the typecheck and the guard, and the
      glyph would quietly vanish from the card variant while the slim row
      keeps it. */
  readonly terminalSlot: ReactNode;
  readonly modelLabel: string | null;
  /** Cloud vs laptop. The design's "Runtime" slot is about *where the agent
      runs*, not which provider it is — the provider survives in the tooltip. */
  readonly isRemote: boolean;
}

/** Repo line is 16px tall at 0.75rem/1rem (Figma 113:741) — explicit rem so
    the panel's --text-xs → 13px remap cannot enlarge it. gap-4 is the design's
    16px between the branch half and the model half. */
const REPO_ROW =
  "flex h-4 min-w-0 items-center gap-4 text-[0.75rem] leading-4 text-muted-foreground";
/** The model/runtime cluster sits a step behind the branch beside it. */
const MUTED = "text-muted-foreground/70";
/** Shared with the title row above and the group header — see
    custom/sidebarV2CardAlignment for why this one is not on the 34px edge. */
const CONTENT_INDENT = SIDEBAR_V2_CARD_ALIGNMENT.repoIndent;

export function SidebarV2ThreadCardMeta(props: SidebarV2ThreadCardMetaProps) {
  /* Branch / worktree / project marks are 16px (size-4) per the component set,
     and they share the 20px indent's axis with the prompt above. The runtime
     glyph stays 14px in a 24px box flush with the card's content edge — same
     box as settle/discard on the title line — so the trailing column shares
     one centre. A lone 14px icon with a 3px end pad sat 2px off that axis once
     the actions grew to size-6. The model label is the caption style (11/15)
     even though the cluster sits on the 12px repo line, so it carries its own
     size rather than inheriting the row's.
     `min-w-0` rather than `shrink-0`: inside a shrink-0 item the label's
     `truncate` can never fire, so a long model name would push whatever shares
     its row — the half that *can* shrink — off the row instead of clipping
     itself. Capped at half the line so neither side can starve the other. */
  const runtime = (
    <span className={`flex min-w-0 max-w-[50%] items-center gap-1 ${MUTED}`}>
      {props.modelLabel ? (
        <span className="truncate text-[11px] leading-[15px]">{props.modelLabel}</span>
      ) : null}
      <span className="inline-flex size-6 shrink-0 items-center justify-center">
        {props.isRemote ? (
          <CloudIcon aria-hidden className="size-3.5" />
        ) : (
          <LaptopIcon aria-hidden className="size-3.5" />
        )}
      </span>
    </span>
  );

  return (
    <div data-testid="sidebar-v2-card-line" className={`${REPO_ROW} ${CONTENT_INDENT}`}>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {props.projectTitle ? (
          // Capped rather than flexible: the branch is the more distinguishing
          // half of this line — two threads on one project differ by branch,
          // not by project — so the project yields space first. The project's
          // favicon rides with the name — the same mark the slim rows and the
          // project menu use for it, so a flat list reads the project at a
          // glance the way a grouped one reads its header — and the folder
          // mark (design 311:13972) stands in when the caller has none, so
          // the two clusters on this line each lead with a glyph naming what
          // follows.
          props.projectTitleHidden ? (
            <span className="sr-only">{props.projectTitle}</span>
          ) : (
            <span className="flex max-w-[45%] shrink-0 items-center gap-1">
              {props.projectIconSlot ?? <FolderIcon aria-hidden className="size-4 shrink-0" />}
              <span className="truncate">{props.projectTitle}</span>
            </span>
          )
        ) : null}
        {props.hasWorktree || props.branch ? (
          /* The worktree mark replaces the branch mark rather than joining
             it. This slot already answers "which code is this on", and the
             two facts are not independent: a thread on a worktree is on
             that worktree's branch, so a second glyph would spend ~16px of
             a line whose branch name is already capped and truncating to
             restate what the first one implies. The branch name stays put,
             labelled by position.

             The mark's condition is the worktree, not the branch. They are
             independent fields on the shell and the row's own git predicate
             treats them as such (`branch != null || worktreePath !== null`),
             so gating the whole slot on the branch would draw a thread that
             has a checkout of its own but no branch as if it ran in the
             project's — the exact confusion the mark exists to prevent.
             With no branch to name, the mark stands alone.

             The distinction is invisible to a screen reader either way —
             both marks are decorative — so the worktree case carries it in
             text.

             The dev-server pulse rides this same slot rather than adding a
             glyph of its own: the question it answers — "which checkout is
             the running server serving?" — is a property of the mark that
             already names the checkout. The attribute lands on the slot and
             the stylesheet animates the mark inside it (`> svg`, so the
             branch text stays legible while the glyph carries the signal).
             A thread with neither branch nor worktree never draws the slot
             and so cannot pulse — such a thread runs in the project
             checkout, which is not the ambiguity this exists to resolve.
             The animation is decorative motion, so the state also rides in
             text for screen readers — after the branch name, identity
             before transient state — and survives `prefers-reduced-motion`
             as a static working-green mark. */
          <span
            className="flex min-w-0 flex-1 items-center gap-0.5"
            data-fork-dev-server-live={props.devServerPort != null ? "" : undefined}
          >
            {props.hasWorktree ? (
              <>
                <span className="sr-only">Worktree</span>
                <WorktreeIcon aria-hidden className="size-4 shrink-0" />
              </>
            ) : (
              <GitBranchIcon aria-hidden className="size-4 shrink-0" />
            )}
            {props.branch ? (
              <span className="truncate whitespace-nowrap">{props.branch}</span>
            ) : null}
            {props.devServerPort != null ? (
              <span className="sr-only">{`Server listening on port ${props.devServerPort}`}</span>
            ) : null}
          </span>
        ) : null}
        {props.terminalSlot ?? null}
      </span>
      {runtime}
    </div>
  );
}
