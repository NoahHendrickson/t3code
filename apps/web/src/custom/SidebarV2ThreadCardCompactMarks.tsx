/**
 * The pieces a compact thread card adds to its single line — see
 * `.fork/customizations.yaml#sidebar-v2-compact-cards`.
 *
 * A compact card is the full card's title line alone. What the repo line said
 * in words is reduced to marks that ride ahead of the trailing group: a cloud
 * when the agent runs on another machine, the checkout mark (the repo line's
 * own `SidebarV2CheckoutMark`, branch name for assistive tech only), the
 * terminal glyph, and the pull request badge. The project, which the repo line
 * names, leads the title as its favicon instead (`SidebarV2CompactCardLead`).
 * Names — project, branch, model — are in the row's hover card, which every
 * card already has.
 *
 * Laptop is not drawn: on the repo line it fills a slot the layout reserves,
 * but on one line a mark that every local thread carries says nothing.
 *
 * Presentational only, with the PR badge and terminal glyph as slots, for the
 * same reason as `SidebarV2ThreadCardMeta`: no row state crosses the seam.
 */
import type { ReactNode } from "react";

import { ProjectFavicon, type ProjectFaviconProject } from "~/components/ProjectFavicon";

import { CloudIcon } from "./icons/lucide-phosphor";
import { SidebarV2CheckoutMark, SidebarV2ProjectFolderMark } from "./SidebarV2ThreadCardMeta";

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
        <SidebarV2CheckoutMark
          branch={props.branch}
          hasWorktree={props.hasWorktree}
          devServerPort={props.devServerPort}
          branchName="sr-only"
          className="flex items-center"
        />
      ) : null}
      {props.terminalSlot ?? null}
      {props.prSlot ?? null}
    </span>
  );
}

/** The project favicon a compact card's title leads with, at the slim rows'
    16px. A favicon-less project draws upstream's title monogram, like the
    repo line; the folder mark stands in only for a thread whose project
    record has not landed yet. */
export function SidebarV2CompactCardLead(props: {
  readonly project: ProjectFaviconProject | null;
}) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {props.project ? (
        <ProjectFavicon project={props.project} className="size-4 text-muted-foreground" />
      ) : (
        <SidebarV2ProjectFolderMark className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}
