/**
 * The lower two lines of a Sidebar V2 thread card — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Fork-owned so the fenced region inside upstream's `Sidebar.tsx` stays a
 * single element rather than forty lines of layout. The seam is deliberately
 * narrow: everything here is presentational, and the one interactive control
 * (the PR badge, which opens a link) arrives pre-built as `prSlot`. No
 * callbacks cross this boundary, so an upstream refactor of the row's event
 * wiring cannot reach into this file.
 *
 * Two lines or one, depending on whether the thread has a PR or a diff to
 * report — see `threadCardShowsMetaRow`. Nothing else varies the card's height:
 * an absent model or branch leaves its half of a row empty rather than closing
 * the row up, so rows stay comparable across cards.
 *
 * Both lines are the design's `caption` style — 11/15 Geist at
 * `--muted-foreground` 70% — except the branch/worktree cluster, which sits
 * closer to the title at `text-foreground/70` so the checkout identity stays
 * readable without competing with the prompt. Diff counts still take colour;
 * nothing else on these lines does. That is a change from the two-specimen
 * model this card used to follow, where metadata brightness encoded whether a
 * row was blocked on you (65%) or merely busy (45%). The component set
 * collapsed that to one tone: the leading status mark carries the distinction
 * now, and it carries it in a fixed column instead of as a brightness the eye
 * has to compare against a neighbouring row to read at all.
 *
 * Both lines indent `pl-6` (24px = the title row's 14px status + 10px gap) so
 * they align under the title text rather than under the mark.
 */
import type { ReactNode } from "react";

// Imported through the shim's own path rather than the `lucide-react` alias —
// this file is fork-owned, so there is no upstream import site to preserve.
import { CloudIcon, GitBranchIcon, LaptopIcon } from "./icons/lucide-phosphor";
import { WorktreeIcon } from "./icons/WorktreeIcon";

export interface SidebarV2ThreadCardMetaProps {
  readonly projectTitle: string | null;
  /** Under a project header the name is already on screen one row up, so the
      card stops drawing it — but keeps it for assistive tech, which has no
      "one row up" and would otherwise hear a card with no project at all. */
  readonly projectTitleHidden?: boolean;
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
      Arrives as a slot for the same reason `prSlot` does: the icon and its
      accessible label are upstream's, and no state crosses this boundary.
      Rides the repo line after the branch cluster — upstream draws it after
      the branch in its combined row, and this keeps that reading order.
      Required like `prSlot`, so a call site has to say `null` out loud: an
      optional slot dropped in a sync resolution is invisible to both the
      typecheck and the guard, and the glyph would quietly vanish from the
      card variant while the slim row keeps it. */
  readonly terminalSlot: ReactNode;
  /** Pre-built `#123` badge, or null when the thread has no pull request. */
  readonly prSlot: ReactNode;
  /** The row's VCS query has not answered yet, so `prSlot` being null means
      "not known", not "no PR" — see `threadCardShowsMetaRow`. */
  readonly prUnknown?: boolean;
  readonly insertions: number | null;
  readonly deletions: number | null;
  readonly modelLabel: string | null;
  /** Cloud vs laptop. The design's "Runtime" slot is about *where the agent
      runs*, not which provider it is — the provider survives in the tooltip. */
  readonly isRemote: boolean;
}

/** Repo line is 0.75rem/1rem (12px); meta line is caption 11/15 — Figma 113:3718
    retuned: explicit rem so the panel's --text-xs → 13px remap cannot enlarge it. */
const REPO_ROW = "flex h-4 min-w-0 items-center text-[0.75rem] leading-4";
const META_ROW = "flex h-[15px] min-w-0 items-center text-[11px] leading-[15px]";
const MUTED = "text-muted-foreground/70";
/** Branch/worktree identity — nearer the title than the rest of the meta. */
const BRANCH = "text-foreground/70";
/** 24px = title's 14px leading status + 10px gap. Aligns under the prompt. */
const CONTENT_INDENT = "pl-6";

/**
 * Whether the card draws the PR/diff line at all — three lines rather than two.
 *
 * The row is what carries the PR badge and the diff counts, so with neither
 * there is nothing on it: the model and runtime move up beside the branch and
 * the card closes at the design's two-line height. The caller needs the same
 * answer for its `contain-intrinsic-size` hint, so it lives here rather than
 * being derived twice from the same props.
 *
 * `prUnknown` is why this takes four inputs rather than three. Whether a thread
 * has a PR is the answer to a per-row VCS query, and on first paint it has not
 * come back yet. Collapsing on "no PR *yet*" would draw every card at two lines
 * and then grow the ones that turn out to have a PR, reflowing the list under
 * the pointer as each query lands — worse than the blank strip the collapse
 * exists to remove. So an unresolved query holds the row open, and the card
 * collapses only where the answer is known, or where no query was ever issued
 * (a thread with no branch and no worktree, which is the case the design is
 * actually about and which never shifts).
 */
export function threadCardShowsMetaRow(props: {
  readonly hasPr: boolean;
  readonly prUnknown: boolean;
  readonly insertions: number | null;
  readonly deletions: number | null;
}): boolean {
  return props.hasPr || props.prUnknown || props.insertions !== null || props.deletions !== null;
}

export function SidebarV2ThreadCardMeta(props: SidebarV2ThreadCardMetaProps) {
  const hasDiff = props.insertions !== null || props.deletions !== null;
  const showsMetaRow = threadCardShowsMetaRow({
    hasPr: props.prSlot != null,
    prUnknown: props.prUnknown === true,
    insertions: props.insertions,
    deletions: props.deletions,
  });

  /* Branch / worktree marks are 14px (size-3.5). The runtime glyph sits in a
     24px box flush with the card's content edge — same box as settle/discard
     on the title line — so the trailing column shares one centre. A lone
     14px icon with a 3px end pad sat 2px off that axis once the actions grew
     to size-6. The model label is the caption style (11/15) even when the
     cluster sits on the 12px repo line, so it carries its own size rather
     than inheriting the row's.
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
    <>
      <div
        data-testid="sidebar-v2-card-line"
        className={`${REPO_ROW} ${CONTENT_INDENT} justify-between gap-2 ${MUTED}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {props.projectTitle ? (
            // Capped rather than flexible: the branch is the more distinguishing
            // half of this line — two threads on one project differ by branch,
            // not by project — so the project yields space first.
            <span
              className={props.projectTitleHidden ? "sr-only" : "max-w-[45%] shrink-0 truncate"}
            >
              {props.projectTitle}
            </span>
          ) : null}
          {props.hasWorktree || props.branch ? (
            /* The worktree mark replaces the branch mark rather than joining
               it. This slot already answers "which code is this on", and the
               two facts are not independent: a thread on a worktree is on
               that worktree's branch, so a second glyph would spend ~14px of
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
              className={`flex min-w-0 flex-1 items-center gap-0.5 ${BRANCH}`}
              data-fork-dev-server-live={props.devServerPort != null ? "" : undefined}
            >
              {props.hasWorktree ? (
                <>
                  <span className="sr-only">Worktree</span>
                  <WorktreeIcon aria-hidden className="size-3.5 shrink-0" />
                </>
              ) : (
                <GitBranchIcon aria-hidden className="size-3.5 shrink-0" />
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
        {showsMetaRow ? null : runtime}
      </div>
      {showsMetaRow ? (
        <div
          data-testid="sidebar-v2-card-line"
          className={`${META_ROW} ${CONTENT_INDENT} justify-between gap-2`}
        >
          <span className={`flex min-w-0 items-center gap-2 ${MUTED}`}>
            {props.prSlot}
            {hasDiff ? (
              // Semantic tokens, not emerald/red literals: they already
              // resolve to the design's #00d492 / #ff6467 in dark and stay
              // legible in light, where a 400-weight green on white would not.
              <span className="flex shrink-0 items-center gap-1 font-mono">
                {props.insertions !== null ? (
                  <span className="text-success-foreground">+{props.insertions}</span>
                ) : null}
                {props.deletions !== null ? (
                  <span className="text-destructive-foreground">−{props.deletions}</span>
                ) : null}
              </span>
            ) : null}
          </span>
          {runtime}
        </div>
      ) : null}
    </>
  );
}
