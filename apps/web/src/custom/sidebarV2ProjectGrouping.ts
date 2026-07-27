/**
 * Sidebar V2's optional project grouping — see
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * Upstream's V2 list is deliberately flat: one stream in activity order, with
 * the project scope menu answering "only this project". Grouping is the other
 * question — "everything, but sorted by which repo it belongs to" — and it is a
 * preference rather than a replacement, so it ships as a switch that only
 * re-buckets the active cards. The snoozed and settled shelves stay flat: they
 * are already time-ordered tails, and slicing a tail by project turns two
 * headers into two dozen.
 *
 * The preference is device-local (localStorage, not client settings). It is a
 * fork-only affordance and a contracts field would put a fork-shaped key in a
 * schema upstream owns, which every sync would then have to carry.
 */
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export const SIDEBAR_V2_GROUP_BY_PROJECT_STORAGE_KEY = "t3code:fork:sidebar-v2-group-by-project:v1";

/** Threads whose project no longer resolves to a group — a just-deleted
 *  project, or an environment whose projects have not loaded yet. They keep a
 *  header of their own rather than trailing headerless under the last real
 *  project, which would read as belonging to it. */
export const UNGROUPED_PROJECT_KEY = "fork:ungrouped";

export function useSidebarV2GroupByProject(): [boolean, (value: boolean) => void] {
  return useLocalStorage(SIDEBAR_V2_GROUP_BY_PROJECT_STORAGE_KEY, false, Schema.Boolean);
}

/** Structural on purpose: the three fields grouping reads off upstream's
    logical project snapshot, no more. */
export interface SidebarV2GroupableProject {
  readonly projectKey: string;
  readonly displayName: string;
  readonly memberProjectRefs: ReadonlyArray<{
    readonly environmentId: string;
    readonly projectId: string;
  }>;
}

export interface SidebarV2GroupableThread {
  readonly environmentId: string;
  readonly projectId: string;
}

export interface SidebarV2ProjectThreadGroup<TThread> {
  readonly projectKey: string;
  readonly displayName: string;
  readonly threads: readonly TThread[];
}

/** Environment ids and project ids are both free-form strings, so the pair is
    joined on a separator neither can contain — the same NUL upstream's own
    scoped keys use. */
function projectRefKey(environmentId: string, projectId: string): string {
  return `${environmentId}\u0000${projectId}`;
}

/**
 * Buckets already-sorted threads by logical project.
 *
 * Group order follows `projectGroups`, which the caller has already sorted by
 * the user's project sort order, so grouping never introduces a second,
 * disagreeing notion of which project comes first. Thread order within a group
 * is the input order, so the flat list's sort survives the re-bucketing.
 *
 * Empty groups are dropped: a project with no active threads is a header with
 * nothing under it, and the scope menu already lists every project.
 */
export function groupThreadsByProject<
  TThread extends SidebarV2GroupableThread,
  TProject extends SidebarV2GroupableProject,
>(
  threads: readonly TThread[],
  projectGroups: readonly TProject[],
): ReadonlyArray<SidebarV2ProjectThreadGroup<TThread>> {
  const projectKeyByRef = new Map<string, string>();
  for (const group of projectGroups) {
    for (const ref of group.memberProjectRefs) {
      projectKeyByRef.set(projectRefKey(ref.environmentId, ref.projectId), group.projectKey);
    }
  }

  const threadsByProjectKey = new Map<string, TThread[]>();
  for (const thread of threads) {
    const projectKey =
      projectKeyByRef.get(projectRefKey(thread.environmentId, thread.projectId)) ??
      UNGROUPED_PROJECT_KEY;
    const existing = threadsByProjectKey.get(projectKey);
    if (existing) {
      existing.push(thread);
    } else {
      threadsByProjectKey.set(projectKey, [thread]);
    }
  }

  const groups: SidebarV2ProjectThreadGroup<TThread>[] = [];
  for (const group of projectGroups) {
    const grouped = threadsByProjectKey.get(group.projectKey);
    if (grouped === undefined) continue;
    groups.push({
      projectKey: group.projectKey,
      displayName: group.displayName,
      threads: grouped,
    });
  }
  const ungrouped = threadsByProjectKey.get(UNGROUPED_PROJECT_KEY);
  if (ungrouped !== undefined) {
    groups.push({
      projectKey: UNGROUPED_PROJECT_KEY,
      displayName: "Other",
      threads: ungrouped,
    });
  }
  return groups;
}
