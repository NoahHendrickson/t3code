/**
 * The marks a compact thread card carries on its single line — see
 * `.fork/customizations.yaml#sidebar-v2-compact-cards`.
 *
 * A compact card is the full card's title line alone. What the repo line said
 * in words is reduced to marks that ride ahead of the trailing group: a cloud
 * when the agent runs on another machine, the checkout mark (worktree or
 * branch, the same either-or the repo line draws), the terminal glyph, and the
 * pull request badge. Names — project, branch, model — move to the row's hover
 * card, which every card already has.
 *
 * Laptop is not drawn: on the repo line it fills a slot the layout reserves,
 * but on one line a mark that every local thread carries says nothing. The
 * checkout mark keeps the dev-server pulse hook, so a running server still
 * lights the row whose checkout it serves.
 *
 * Presentational only, with the PR badge and terminal glyph as slots, for the
 * same reason as `SidebarV2ThreadCardMeta`: no row state crosses the seam.
 */
import type { ReactNode } from "react";

import { CloudIcon, GitBranchIcon } from "./icons/lucide-phosphor";
import { WorktreeIcon } from "./icons/WorktreeIcon";

export interface SidebarV2ThreadCardCompactMarksProps {
  readonly branch: string | null;
  /** True when the thread runs in a worktree of its own — see
      `SidebarV2ThreadCardMetaProps.hasWorktree`. */
  readonly hasWorktree: boolean;
  /** See `SidebarV2ThreadCardMetaProps.devServerPort`. */
  readonly devServerPort: number | null;
  readonly isRemote: boolean;
  /** Required slots, so a call site has to say `null` out loud — see
      `SidebarV2ThreadCardMetaProps.terminalSlot`. */
  readonly terminalSlot: ReactNode;
  readonly prSlot: ReactNode;
}

/** Every mark is the repo line's 12px. */
const MARK = "size-3 shrink-0";

export function SidebarV2ThreadCardCompactMarks(props: SidebarV2ThreadCardCompactMarksProps) {
  return (
    // data-fork-thread-card-meta: the same palette hook as the repo line, so
    // Glass inks these marks the way it inks the line they stand in for.
    <span
      data-testid="sidebar-v2-card-compact-marks"
      data-fork-thread-card-meta=""
      className="flex shrink-0 items-center gap-1.5 text-[0.75rem] leading-4 text-muted-foreground"
    >
      {props.isRemote ? (
        <>
          <span className="sr-only">Remote</span>
          <CloudIcon aria-hidden className={MARK} />
        </>
      ) : null}
      {props.hasWorktree || props.branch ? (
        <span
          className="flex items-center"
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
          {props.branch ? <span className="sr-only">{props.branch}</span> : null}
          {props.devServerPort != null ? (
            <span className="sr-only">{`Server listening on port ${props.devServerPort}`}</span>
          ) : null}
        </span>
      ) : null}
      {props.terminalSlot ?? null}
      {props.prSlot ?? null}
    </span>
  );
}
