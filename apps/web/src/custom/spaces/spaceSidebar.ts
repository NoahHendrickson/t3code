/**
 * Sidebar state for spaces — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space's Threads row starts collapsed, so what is stored is the set that
 * was opened. The space header's own collapse is the project grouping's
 * collapsed set, shared with Group by project, so switching between the two
 * keeps which projects you had closed.
 */
import type { SidebarV2CardStatusKind } from "../sidebarV2CardStatus";
import { UNGROUPED_PROJECT_KEY, useSidebarV2CollapsedKeys } from "../sidebarV2ProjectGrouping";

const SPACE_THREADS_EXPANDED_STORAGE_KEY = "t3code:fork:space-threads-expanded:v1";

const isAnyKey = (key: string): key is string => key.length > 0;

export function useSpaceThreadsExpanded(): readonly [
  ReadonlySet<string>,
  (projectKey: string) => void,
] {
  return useSidebarV2CollapsedKeys(SPACE_THREADS_EXPANDED_STORAGE_KEY, isAnyKey);
}

/** Whether a section's cards are folded behind its Threads row. The
    unresolved-project section draws no Threads row, so nothing could unfold
    it; its cards answer to its header alone. */
export function spaceThreadsFolded(
  header: { readonly projectKey: string } | null,
  expanded: ReadonlySet<string>,
): boolean {
  if (header === null || header.projectKey === UNGROUPED_PROJECT_KEY) return false;
  return !expanded.has(header.projectKey);
}

/** One mark per distinct state among a space's threads, in the order the
    Threads row draws them. Approval, input and a usage limit share a key:
    the cards draw all three as the same amber half circle. */
export const SPACE_THREAD_MARKS = [
  "working",
  "monitoring",
  "blocked",
  "failed",
  "woke",
  "done",
  "idle",
] as const;
export type SpaceThreadMark = (typeof SPACE_THREAD_MARKS)[number];

const MARK_BY_KIND: Record<SidebarV2CardStatusKind, SpaceThreadMark> = {
  working: "working",
  // The cards draw one mark for both (sidebarV2CardStatus).
  waiting: "monitoring",
  monitoring: "monitoring",
  approval: "blocked",
  input: "blocked",
  limited: "blocked",
  failed: "failed",
  woke: "woke",
  done: "done",
};

/** What a space's Threads row reports: how many threads it holds, and the
    marks its cards draw. Read off the cards' own status ladder, so the row
    and the cards cannot disagree. */
export interface SpaceThreadSummary {
  readonly count: number;
  readonly marks: readonly SpaceThreadMark[];
}

export function summarizeSpaceThreads<T>(
  threads: readonly T[],
  kindOf: (thread: T) => SidebarV2CardStatusKind | null,
): SpaceThreadSummary {
  const present = new Set<SpaceThreadMark>();
  for (const thread of threads) {
    const kind = kindOf(thread);
    present.add(kind === null ? "idle" : MARK_BY_KIND[kind]);
  }
  return {
    count: threads.length,
    marks: SPACE_THREAD_MARKS.filter((mark) => present.has(mark)),
  };
}

interface PullRequestLinkLike {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly source: string;
  readonly snapshot: { readonly state: string } | null;
}

/** The open pull requests a space's threads link, newest number first, each
    once. Read off the threads' own links, which the cards' badges draw, so a
    collapsed space reports them without asking the host. A link with no
    snapshot yet counts as open, as the cards take it; a dismissed stack
    member does not count. */
export function spaceOpenPullRequests(
  threads: ReadonlyArray<{
    readonly pullRequests?: ReadonlyArray<PullRequestLinkLike> | undefined;
  }>,
): readonly number[] {
  const open = new Map<string, number>();
  for (const thread of threads) {
    for (const link of thread.pullRequests ?? []) {
      if (link.source === "stack-dismissed") continue;
      if (link.snapshot !== null && link.snapshot.state !== "open") continue;
      open.set(`${link.host}/${link.repository}#${link.number}`, link.number);
    }
  }
  return [...open.values()].toSorted((left, right) => right - left);
}
