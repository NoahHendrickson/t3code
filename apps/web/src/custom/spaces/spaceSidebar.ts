/**
 * Sidebar state for spaces — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space's Threads row starts collapsed, so what is stored is the set that
 * was opened. The space header's own collapse is the project grouping's
 * collapsed set, shared with Group by project, so switching between the two
 * keeps which projects you had closed.
 */
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";

import type { SidebarV2CardTopStatus } from "../sidebarV2CardStatus";
import { UNGROUPED_PROJECT_KEY, useSidebarV2CollapsedKeys } from "../sidebarV2ProjectGrouping";
import { useUiStateStore } from "~/uiStateStore";

import { threadCardStatus, type ThreadShell } from "./spaceThreadMarks";

const SPACE_THREADS_EXPANDED_STORAGE_KEY = "t3code:fork:space-threads-expanded:v1";

const isAnyKey = (key: string): key is string => key.length > 0;

export function useSpaceThreadsExpanded(): readonly [
  ReadonlySet<string>,
  (projectKey: string) => void,
] {
  return useSidebarV2CollapsedKeys(SPACE_THREADS_EXPANDED_STORAGE_KEY, isAnyKey);
}

/** The order the Threads row draws its marks in: live work first, then what
    needs you, then what finished, then idle. Order only; each mark is the
    card's own (sidebarV2CardStatus), so its label and tone cannot drift. */
const MARK_ORDER = [
  "working",
  "monitoring",
  "dot:approval",
  "dot:input",
  "dot:failed",
  "woke:approval",
  "dot:done",
  "idle",
];

/** One of a space's marks: a card status, or null for an idle card. */
export interface SpaceThreadMark {
  readonly key: string;
  readonly status: SidebarV2CardTopStatus;
}

/** What a space's Threads row reports: how many threads it holds, and one of
    its cards' marks for each distinct mark they draw. */
export interface SpaceThreadSummary {
  readonly count: number;
  readonly marks: readonly SpaceThreadMark[];
}

function markKey(status: SidebarV2CardTopStatus): string {
  if (status === null) return "idle";
  return "tone" in status && status.mark !== "working"
    ? `${status.mark}:${status.tone}`
    : status.mark;
}

export function summarizeSpaceThreads<T>(
  threads: readonly T[],
  statusOf: (thread: T) => SidebarV2CardTopStatus,
): SpaceThreadSummary {
  const marks = new Map<string, SpaceThreadMark>();
  for (const thread of threads) {
    const status = statusOf(thread);
    const key = markKey(status);
    if (!marks.has(key)) marks.set(key, { key, status });
  }
  const rank = (mark: SpaceThreadMark) => {
    const index = MARK_ORDER.indexOf(mark.key);
    return index === -1 ? MARK_ORDER.length : index;
  };
  return {
    count: threads.length,
    marks: [...marks.values()].toSorted((left, right) => rank(left) - rank(right)),
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

/** What the sidebar draws for one space: its project group, what its Threads
    row and folded header report, and whether its cards are folded behind that
    row. */
export interface SpaceSection<TGroup> {
  readonly group: TGroup;
  readonly summary: SpaceThreadSummary;
  readonly openPullRequests: readonly number[];
  readonly threadsFolded: boolean;
}

/** One model per space, by project key, so the list asks one question of a
    section. The unresolved-project section is not a space: it has no project,
    so no Home, rows or summary, and its cards answer to its header alone. */
export function buildSpaceSections<
  TThread extends { readonly pullRequests?: ReadonlyArray<PullRequestLinkLike> | undefined },
  TGroup extends { readonly projectKey: string },
>(input: {
  readonly sections: ReadonlyArray<{
    readonly header: { readonly projectKey: string } | null;
    readonly threads: readonly TThread[];
  }>;
  readonly groups: readonly TGroup[];
  readonly expanded: ReadonlySet<string>;
  readonly statusOf: (thread: TThread) => SidebarV2CardTopStatus;
}): ReadonlyMap<string, SpaceSection<TGroup>> {
  const spaces = new Map<string, SpaceSection<TGroup>>();
  for (const section of input.sections) {
    const projectKey = section.header?.projectKey;
    if (projectKey === undefined || projectKey === UNGROUPED_PROJECT_KEY) continue;
    const group = input.groups.find((candidate) => candidate.projectKey === projectKey);
    if (group === undefined) continue;
    spaces.set(projectKey, {
      group,
      summary: summarizeSpaceThreads(section.threads, input.statusOf),
      openPullRequests: spaceOpenPullRequests(section.threads),
      threadsFolded: !input.expanded.has(projectKey),
    });
  }
  return spaces;
}

/** No spaces: the list is grouped some other way. */
const NO_VISITS: Readonly<Record<string, string>> = {};

const EMPTY_SPACE_SECTIONS: ReadonlyMap<string, never> = new Map<string, never>();

/** The list's spaces, built from its project sections while it groups by
    space. A hook (it reads the visit watermarks itself) so the compiler
    memoizes it, and the section filter that reads it re-runs only when one
    of its inputs changes. */
export function useSpaceSections<TGroup extends { readonly projectKey: string }>(input: {
  readonly enabled: boolean;
  readonly sections: ReadonlyArray<
    | {
        readonly kind: "project";
        readonly header: { readonly projectKey: string } | null;
        readonly threads: readonly ThreadShell[];
      }
    | { readonly kind: "status" }
  >;
  readonly groups: readonly TGroup[];
  readonly expanded: ReadonlySet<string>;
  readonly now: string;
}): ReadonlyMap<string, SpaceSection<TGroup>> {
  // Subscribed only while grouping by space, as the sidebar's own read is.
  const lastVisitedAtById = useUiStateStore((store) =>
    input.enabled ? store.threadLastVisitedAtById : NO_VISITS,
  );
  if (!input.enabled) return EMPTY_SPACE_SECTIONS;
  return buildSpaceSections({
    sections: input.sections.flatMap((section) => (section.kind === "project" ? [section] : [])),
    groups: input.groups,
    expanded: input.expanded,
    statusOf: (thread) =>
      threadCardStatus(
        thread,
        lastVisitedAtById[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))],
        input.now,
      ).topStatus,
  });
}
