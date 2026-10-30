/**
 * The rows under a space's header in the sidebar — see
 * `.fork/customizations.yaml#fork-spaces`.
 *
 * A space is a project header with its threads folded under a Threads row,
 * plus rows that open the project's other views: its pull requests, its
 * changelog of merged pull requests, and its automations. Each view is an
 * existing page filtered to the space (or, for the changelog, a small page of
 * its own), so the rows carry no data of their own beyond the thread count
 * the sidebar already has.
 *
 * Drawn on the chrome rows' shape (`data-fork-chrome-row`), a step smaller,
 * on the header label's edge, so Glass gives them the same pill and selected
 * glint without a rule of its own. The cards under Threads are what indent
 * (theme.custom.css).
 */
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { useSidebar } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

import { sidebarV2CardHeight, sidebarV2CompactCardHeight } from "../sidebarV2CardAlignment";
import { SidebarV2StatusMark, type SidebarV2TopStatusMark } from "../SidebarV2StatusIndicator";
import type { SpaceThreadMark, SpaceThreadSummary } from "./spaceSidebar";

/** Each summary mark as the card status it stands for (sidebarV2CardStatus);
    idle is the card's empty status, drawn as its ring. */
const SPACE_MARK_STATUS: Record<SpaceThreadMark, SidebarV2TopStatusMark | null> = {
  working: { label: "Working", tone: "working", mark: "working" },
  monitoring: { label: "Monitoring", mark: "monitoring" },
  blocked: { label: "Needs you", tone: "approval", mark: "dot" },
  failed: { label: "Failed", tone: "failed", mark: "dot" },
  woke: { label: "Woke from snooze", tone: "approval", mark: "woke" },
  done: { label: "Done", tone: "done", mark: "dot" },
  idle: null,
};

import {
  GitPullRequestIcon,
  HistoryIcon,
  MessagesSquareIcon,
  ZapIcon,
} from "../icons/lucide-phosphor";

const SPACE_ROW = cn(
  "flex w-full cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-left text-[0.8125rem] leading-4 text-muted-foreground outline-none",
  "hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  "data-[active=true]:bg-sidebar-row-hover data-[active=true]:text-sidebar-foreground",
);

/** A thread card's height at the sidebar's density, so the rows and the
    cards they sit among share one rhythm. */
function spaceRowHeight(compact: boolean): number {
  return compact ? sidebarV2CompactCardHeight() : sidebarV2CardHeight();
}

function SpaceRow(props: {
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly compact: boolean;
  readonly label: string;
  readonly ariaLabel: string;
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly trailing?: ReactNode;
  readonly onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    // A section row for the header's hover walks and drop edge
    // (theme.custom.css): a list item between a header and the next one must
    // carry the marker, or those walks attach it to the wrong header.
    <li className="list-none" data-fork-space-row="" data-fork-project-section="">
      <button
        type="button"
        aria-label={props.ariaLabel}
        aria-expanded={props.expanded}
        aria-current={props.active ? "page" : undefined}
        data-active={props.active ? "true" : undefined}
        data-fork-chrome-row=""
        onClick={props.onClick}
        className={SPACE_ROW}
        style={{ height: spaceRowHeight(props.compact) }}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        {props.trailing}
      </button>
    </li>
  );
}

export function SidebarV2SpaceThreadsRow(props: {
  readonly spaceLabel: string;
  readonly summary: SpaceThreadSummary | null;
  readonly compact: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const count = props.summary?.count ?? 0;
  return (
    <SpaceRow
      icon={MessagesSquareIcon}
      compact={props.compact}
      label="Threads"
      ariaLabel={`${props.expanded ? "Hide" : "Show"} threads in ${props.spaceLabel}`}
      expanded={props.expanded}
      onClick={props.onToggle}
      trailing={
        <>
          {count > 0 ? <span className="shrink-0 text-xs tabular-nums">{count}</span> : null}
          {/* The cards' own marks, one per state any thread in the space is in,
              while the cards are folded away; open, they show their own. */}
          {(props.expanded ? [] : (props.summary?.marks ?? [])).map((mark) => (
            <span key={mark} className="flex h-[14px] shrink-0 items-center">
              <SidebarV2StatusMark
                status={SPACE_MARK_STATUS[mark]}
                seed={`space-threads:${props.spaceLabel}`}
                idle="dot"
              />
            </span>
          ))}
          {/* 3px right: the row's 12px end padding leaves it 3px short of the
              header caret's axis, the centre of its 32px button on the row's end. */}
          <SidebarV2SpaceCaret open={props.expanded} className="left-[3px]" />
        </>
      }
    />
  );
}

/** PRs, Changelog and Automations for one space. The PR page takes one
    project, so it opens on the space's representative; the other two take
    the whole space by key. */
export function SidebarV2SpaceLinkRows(props: {
  readonly spaceKey: string;
  readonly spaceLabel: string;
  readonly representative: { readonly environmentId: EnvironmentId; readonly id: ProjectId };
  readonly compact: boolean;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = useLocation({
    select: (location): "prs" | "changelog" | "automations" | null => {
      const search = location.search as Record<string, unknown>;
      if (location.pathname === "/pull-requests") {
        return search.projectId === props.representative.id ? "prs" : null;
      }
      if (search.space !== props.spaceKey) return null;
      if (location.pathname === "/changelog") return "changelog";
      if (location.pathname === "/scheduled") return "automations";
      return null;
    },
  });
  const go = (open: () => Promise<void>) => {
    if (isMobile) setOpenMobile(false);
    void open();
  };
  return (
    <>
      <SpaceRow
        icon={GitPullRequestIcon}
        compact={props.compact}
        label="PRs"
        ariaLabel={`Pull requests in ${props.spaceLabel}`}
        active={active === "prs"}
        onClick={() =>
          go(() =>
            navigate({
              to: "/pull-requests",
              // A fresh view of the space's open PRs, not the list's saved
              // filters: a search or author filter left there would read as
              // the space having fewer PRs than it does.
              search: {
                involvement: "all",
                state: "open",
                environmentId: props.representative.environmentId,
                projectId: props.representative.id,
              },
            }),
          )
        }
      />
      <SpaceRow
        icon={HistoryIcon}
        compact={props.compact}
        label="Changelog"
        ariaLabel={`Changelog for ${props.spaceLabel}`}
        active={active === "changelog"}
        onClick={() => go(() => navigate({ to: "/changelog", search: { space: props.spaceKey } }))}
      />
      <SpaceRow
        icon={ZapIcon}
        compact={props.compact}
        label="Automations"
        ariaLabel={`Automations in ${props.spaceLabel}`}
        active={active === "automations"}
        onClick={() => go(() => navigate({ to: "/scheduled", search: { space: props.spaceKey } }))}
      />
    </>
  );
}

/**
 * A folded space's line on its header: its thread count with one of the
 * cards' marks per state among them (as the Threads row draws them), then
 * how many pull requests are open. A count rather than the numbers: the
 * numbers squeezed the space's own name out of a 280px sidebar, and the cards
 * and the Home page carry them.
 */
export function SidebarV2SpaceCollapsedSummary(props: {
  readonly spaceLabel: string;
  readonly summary: SpaceThreadSummary | null;
  readonly openPullRequests: readonly number[];
}) {
  const count = props.summary?.count ?? 0;
  const pullRequests = props.openPullRequests.length;
  if (count === 0 && pullRequests === 0) return null;
  return (
    // Narrow, the marks give way first: they wrap out of a one-line box, whole,
    // while both counts hold.
    <span className="flex min-w-0 items-center gap-2.5 text-xs tabular-nums text-muted-foreground">
      {count > 0 ? (
        <span className="flex min-w-0 items-center gap-1">
          <MessagesSquareIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="shrink-0">
            {count}
            <span className="sr-only"> threads</span>
          </span>
          <span className="flex h-[14px] min-w-0 flex-wrap items-center gap-1 overflow-hidden">
            {props.summary?.marks.map((mark) => (
              <span key={mark} className="flex h-[14px] shrink-0 items-center">
                <SidebarV2StatusMark
                  status={SPACE_MARK_STATUS[mark]}
                  seed={`space-summary:${props.spaceLabel}`}
                  idle="dot"
                />
              </span>
            ))}
          </span>
        </span>
      ) : null}
      {pullRequests > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          <GitPullRequestIcon aria-hidden className="size-3.5 shrink-0" />
          <span>
            {pullRequests}
            <span className="sr-only"> open pull requests</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** The space header's filled caret (status grouping's), for the Threads row
    and the shelves under a list of spaces: up while open, down while folded.
    1px right puts it on the header carets' axis; `className` moves it. */
export function SidebarV2SpaceCaret(props: {
  readonly open: boolean;
  readonly className?: string | undefined;
}) {
  return (
    <svg
      aria-hidden
      data-fork-shelf-caret=""
      viewBox="0 0 14 14"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinejoin="round"
      className={cn(
        "relative left-px size-3.5 shrink-0 transition-transform",
        props.open && "rotate-180",
        props.className,
      )}
    >
      <path d="M2.71 4.75H11.29L7 9.04Z" />
    </svg>
  );
}
