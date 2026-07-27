/**
 * The lower two lines of a Sidebar V2 thread card — see
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Fork-owned so the fenced region inside upstream's `SidebarV2.tsx` stays a
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
 * `--muted-foreground` 70% — with only the diff counts and nothing else taking
 * colour. That is a change from the two-specimen model this card used to
 * follow, where metadata brightness encoded whether a row was blocked on you
 * (65%) or merely busy (45%). The component set collapsed that to one tone: the
 * trailing status mark carries the distinction now, and it carries it in a
 * fixed column instead of as a brightness the eye has to compare against a
 * neighbouring row to read at all.
 */
import type { ReactNode } from "react";

// Imported through the shim's own path rather than the `lucide-react` alias —
// this file is fork-owned, so there is no upstream import site to preserve.
import { CloudIcon, GitBranchIcon, LaptopIcon } from "./icons/lucide-phosphor";

export interface SidebarV2ThreadCardMetaProps {
  readonly projectTitle: string | null;
  readonly branch: string | null;
  /** Pre-built `#123` badge, or null when the thread has no pull request. */
  readonly prSlot: ReactNode;
  readonly insertions: number | null;
  readonly deletions: number | null;
  readonly modelLabel: string | null;
  /** Cloud vs laptop. The design's "Runtime" slot is about *where the agent
      runs*, not which provider it is — the provider survives in the tooltip. */
  readonly isRemote: boolean;
}

/** 15px rows, matching the design. Fixed-height so a card's drawn height is a
    function of how many rows it has, not of which halves happen to be filled. */
const ROW = "flex h-[15px] min-w-0 items-center text-[11px] leading-[15px]";
const MUTED = "text-muted-foreground/70";

/**
 * Whether the card draws the PR/diff line at all — three lines rather than two.
 *
 * The row is what carries the PR badge and the diff counts, so with neither
 * there is nothing on it: the model and runtime move up beside the branch and
 * the card closes at the design's two-line height. The caller needs the same
 * answer for its `contain-intrinsic-size` hint, so it lives here rather than
 * being derived twice from the same three props.
 */
export function threadCardShowsMetaRow(props: {
  readonly hasPr: boolean;
  readonly insertions: number | null;
  readonly deletions: number | null;
}): boolean {
  return props.hasPr || props.insertions !== null || props.deletions !== null;
}

export function SidebarV2ThreadCardMeta(props: SidebarV2ThreadCardMetaProps) {
  const hasDiff = props.insertions !== null || props.deletions !== null;
  const showsMetaRow = threadCardShowsMetaRow({
    hasPr: props.prSlot != null,
    insertions: props.insertions,
    deletions: props.deletions,
  });

  /* 3px of trailing padding so the runtime glyph's optical edge lines up with
     the status mark above it, which sits inside a 16px box.

     `min-w-0` rather than `shrink-0`: inside a shrink-0 item the label's
     `truncate` can never fire, so a long model name would push whatever shares
     its row — the half that *can* shrink — off the row instead of clipping
     itself. Capped at half the line so neither side can starve the other. */
  const runtime = (
    <span className={`flex min-w-0 max-w-[50%] items-center gap-1 pr-[3px] ${MUTED}`}>
      {props.modelLabel ? <span className="truncate">{props.modelLabel}</span> : null}
      {props.isRemote ? (
        <CloudIcon aria-hidden className="size-3 shrink-0" />
      ) : (
        <LaptopIcon aria-hidden className="size-3 shrink-0" />
      )}
    </span>
  );

  return (
    <>
      <div className={`${ROW} justify-between gap-2 ${MUTED}`}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {props.projectTitle ? (
            // Capped rather than flexible: the branch is the more distinguishing
            // half of this line — two threads on one project differ by branch,
            // not by project — so the project yields space first.
            <span className="max-w-[45%] shrink-0 truncate">{props.projectTitle}</span>
          ) : null}
          {props.branch ? (
            <span className="flex min-w-0 flex-1 items-center gap-0.5">
              <GitBranchIcon aria-hidden className="size-3 shrink-0" />
              <span className="truncate whitespace-nowrap">{props.branch}</span>
            </span>
          ) : null}
        </span>
        {showsMetaRow ? null : runtime}
      </div>
      {showsMetaRow ? (
        <div className={`${ROW} justify-between gap-2`}>
          <span className={`flex min-w-0 items-center gap-2 ${MUTED}`}>
            {props.prSlot}
            {hasDiff ? (
              // Semantic tokens, not emerald/red literals: they already resolve
              // to the design's #00d492 / #ff6467 in dark and stay legible in
              // light, where a 400-weight green on white would not.
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
