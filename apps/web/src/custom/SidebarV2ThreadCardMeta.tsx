/**
 * The repo line of a Sidebar V2 thread card — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Fork-owned so the fenced region inside upstream's `Sidebar.tsx` stays a
 * single element rather than thirty lines of layout. The seam is deliberately
 * narrow: everything here is presentational and no callbacks cross it, so an
 * upstream refactor of the row's event wiring cannot reach into this file.
 *
 * One line, always. The component set (Figma 364:17299, "thread card v3")
 * draws every card at a fixed 54px — title line, 4px, repo line — so nothing
 * here varies the card's height: an absent model or branch leaves its half of
 * the line empty rather than closing it up, and rows stay comparable.
 *
 * The line reads, left to right: where the agent runs (laptop or cloud), a
 * hairline, which checkout it is on (branch or worktree mark plus the branch
 * name), the terminal glyph if a terminal is live, then the pull request
 * badge; the model label sits on the far right. Every mark is the design's
 * 12px. Tones follow the component set: everything on the line at
 * `--muted-foreground`, the PR badge in its state colour, the model label the
 * caption style (11/15) on the same muted channel.
 *
 * In flat mode (no project headers) the project's favicon and name lead the
 * checkout cluster, because a flat list has nowhere else to say which project
 * a card belongs to; under a header the name is visually hidden and the
 * header carries it.
 */
import type { ReactNode } from "react";

// Imported through the shim's own path rather than the `lucide-react` alias —
// this file is fork-owned, so there is no upstream import site to preserve.
import { CloudIcon, FolderIcon, GitBranchIcon, LaptopIcon } from "./icons/lucide-phosphor";
import { WorktreeIcon } from "./icons/WorktreeIcon";

export interface SidebarV2ThreadCardMetaProps {
  readonly projectTitle: string | null;
  /** True when the card sits under a project header that already names the
      project. The line stops drawing it — but keeps it for assistive tech,
      which has no "one row up" and would otherwise hear a card with no
      project at all. */
  readonly projectTitleHidden?: boolean;
  /** The project's favicon, pre-built by the caller, or null to draw the
      design's folder mark (`SidebarV2ProjectFolderMark`) instead. A slot for
      the same reason `terminalSlot` is one: the favicon is an asset lookup
      keyed by environment and cwd, and that state stays on the row's side of
      this seam. The app always passes ProjectFavicon with that same mark as
      its no-asset fallback, so null is the test-side default, not the
      favicon-less path. Required so a call site has to say `null` out loud —
      see `terminalSlot`. */
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
  /** The pull request badge, pre-built by the row (it is a link with
      upstream's open/closed/merged tone and click routing), or null. The
      design puts it on this line after the checkout cluster (364:14308);
      required for the same reason as `terminalSlot`. */
  readonly prSlot: ReactNode;
  readonly modelLabel: string | null;
  /** Cloud vs laptop. The design's "Runtime" slot is about *where the agent
      runs*, not which provider it is — the provider survives in the tooltip. */
  readonly isRemote: boolean;
}

/** Repo line is 16px tall at 0.75rem/1rem — explicit rem so the panel's
    --text-xs → 13px remap cannot enlarge it. gap-3 is the design's 12px
    between the checkout cluster and the PR badge, and between the left group
    and the model label. */
const REPO_ROW =
  "flex h-4 min-w-0 items-center justify-between gap-3 text-[0.75rem] leading-4 text-muted-foreground";
/** Every mark on the line is the design's 12px. */
const MARK = "size-3 shrink-0";

/** The design's folder mark for the repo line, decorative like every other
    mark on it. The meta draws it for a null `projectIconSlot`; the row hands
    it to ProjectFavicon as `fallbackIcon` so a favicon-less project draws the
    same glyph — with the `aria-hidden` ProjectFavicon's own fallback does not
    set. */
export function SidebarV2ProjectFolderMark(props: { readonly className?: string | undefined }) {
  return <FolderIcon aria-hidden className={props.className} />;
}

export function SidebarV2ThreadCardMeta(props: SidebarV2ThreadCardMetaProps) {
  return (
    <div data-testid="sidebar-v2-card-line" className={REPO_ROW}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {/* Runtime leads the line (364:18405): where the agent runs, then a
              hairline, then which code it is on. */}
          {props.isRemote ? (
            <CloudIcon aria-hidden className={MARK} />
          ) : (
            <LaptopIcon aria-hidden className={MARK} />
          )}
          <span aria-hidden className="h-2 w-px shrink-0 rounded-full bg-foreground/12" />
          {props.projectTitle ? (
            // The 40% cap is only for when a branch shares this line: two
            // threads on one project differ by branch, so the project yields
            // first. A card with no branch has nothing to yield to — capping
            // it still clips a short name for empty space. Then min-w-0 is
            // enough: the name can still truncate against the model if it is
            // actually too long. The favicon rides with the name; the folder
            // mark stands in for a null slot.
            props.projectTitleHidden ? (
              <span className="sr-only">{props.projectTitle}</span>
            ) : (
              <span
                className={
                  props.branch
                    ? "flex max-w-[40%] shrink-0 items-center gap-1"
                    : "flex min-w-0 items-center gap-1"
                }
              >
                {props.projectIconSlot ?? <SidebarV2ProjectFolderMark className={MARK} />}
                <span className="truncate">{props.projectTitle}</span>
              </span>
            )
          ) : null}
          {props.hasWorktree || props.branch ? (
            /* The worktree mark replaces the branch mark rather than joining
               it. This slot already answers "which code is this on", and the
               two facts are not independent: a thread on a worktree is on
               that worktree's branch, so a second glyph would spend 12px of
               a line whose branch name is already truncating to restate what
               the first one implies. The branch name stays put, labelled by
               position.

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
                  <WorktreeIcon aria-hidden className={MARK} />
                </>
              ) : (
                <GitBranchIcon aria-hidden className={MARK} />
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
        {props.prSlot ?? null}
      </span>
      {/* `min-w-0` rather than `shrink-0`: inside a shrink-0 item the label's
          `truncate` can never fire, so a long model name would push whatever
          shares its row — the half that *can* shrink — off the row instead of
          clipping itself. Capped at 45% so neither side can starve the other.
          The caption style (11/15) even though the cluster sits on the 12px
          repo line, so it carries its own size rather than inheriting. */}
      {props.modelLabel ? (
        <span className="min-w-0 max-w-[45%] truncate text-[11px] leading-[15px]">
          {props.modelLabel}
        </span>
      ) : null}
    </div>
  );
}
