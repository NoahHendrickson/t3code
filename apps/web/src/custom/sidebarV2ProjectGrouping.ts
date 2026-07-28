/**
 * Sidebar V2's optional project grouping — see
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * Upstream's V2 list is deliberately flat: one stream in activity order, with
 * the project scope menu answering "only this project". Grouping is the other
 * question — "everything, but sorted by which repo it belongs to" — and it is a
 * preference rather than a replacement, so it only re-buckets the active cards.
 * The snoozed and settled shelves stay flat: they are already time-ordered
 * tails, and slicing a tail by project turns two headers into two dozen.
 *
 * Both modes come out of `buildActiveThreadSections` as the same shape — a list
 * of sections, flat being the one-section case. The caller then has a single
 * sequence to render from and to flatten for keyboard order, rather than a mode
 * flag re-tested at each of those sites, where the two could silently disagree
 * about what order the list is in.
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
 *  project, which would read as belonging to it. The header's label is the
 *  render site's business: this module returns a null display name and nothing
 *  user-facing. */
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

/** A run of cards under one optional header. Flat is `header: null`, so there
    is no second list shape and no mode flag to keep in step. */
export interface SidebarV2ActiveSection<TThread> {
  readonly header: {
    readonly projectKey: string;
    /** Null for the unresolved-project section — see `UNGROUPED_PROJECT_KEY`. */
    readonly displayName: string | null;
  } | null;
  readonly threads: readonly TThread[];
}

/** Environment ids and project ids are both free-form strings, so the pair is
    joined on a separator neither can contain.
    `sortLogicalProjectsForSidebar` (components/Sidebar.logic.ts) builds the
    identical NUL-joined ref → projectKey map immediately upstream of this
    module and discards it. The duplication is deliberate — importing a
    `components/` internal would widen a seam this file keeps structural — but
    the two must agree on what a ref key is. */
function projectRefKey(environmentId: string, projectId: string): string {
  return `${environmentId}\u0000${projectId}`;
}

/**
 * Indexes every member ref of every logical project by the key of the group it
 * belongs to.
 *
 * Split from the bucketing so the caller can memoize it on the project list
 * alone: the thread list churns on unrelated inputs (clock ticks, capability
 * descriptors, PR states arriving per row), and rebuilding this map on each of
 * those is work proportional to the number of projects for no new answer.
 */
export function createProjectRefIndex(
  projectGroups: readonly SidebarV2GroupableProject[],
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const group of projectGroups) {
    for (const ref of group.memberProjectRefs) {
      index.set(projectRefKey(ref.environmentId, ref.projectId), group.projectKey);
    }
  }
  return index;
}

/**
 * Splits already-sorted active threads into the sections the list paints.
 *
 * Ungrouped returns the whole list as one headerless section, so the caller's
 * render and its keyboard-order flattening read the same sequence in both
 * modes.
 *
 * Grouped, section order follows `projectGroups`, which the caller has already
 * sorted by the user's project sort order, so grouping never introduces a
 * second, disagreeing notion of which project comes first. Thread order within
 * a section is the input order, so the flat list's sort survives the
 * re-bucketing. Empty groups are dropped: a project with no active threads is a
 * header with nothing under it, and the scope menu already lists every project.
 */
export function buildActiveThreadSections<
  TThread extends SidebarV2GroupableThread,
  TProject extends SidebarV2GroupableProject,
>(input: {
  readonly threads: readonly TThread[];
  readonly projectGroups: readonly TProject[];
  readonly projectRefIndex: ReadonlyMap<string, string>;
  readonly grouped: boolean;
}): ReadonlyArray<SidebarV2ActiveSection<TThread>> {
  if (!input.grouped) return [{ header: null, threads: input.threads }];

  const threadsByProjectKey = new Map<string, TThread[]>();
  for (const thread of input.threads) {
    const projectKey =
      input.projectRefIndex.get(projectRefKey(thread.environmentId, thread.projectId)) ??
      UNGROUPED_PROJECT_KEY;
    const existing = threadsByProjectKey.get(projectKey);
    if (existing) {
      existing.push(thread);
    } else {
      threadsByProjectKey.set(projectKey, [thread]);
    }
  }

  const sections: SidebarV2ActiveSection<TThread>[] = [];
  for (const group of input.projectGroups) {
    const grouped = threadsByProjectKey.get(group.projectKey);
    if (grouped === undefined) continue;
    sections.push({
      header: { projectKey: group.projectKey, displayName: group.displayName },
      threads: grouped,
    });
  }
  const ungrouped = threadsByProjectKey.get(UNGROUPED_PROJECT_KEY);
  if (ungrouped !== undefined) {
    sections.push({
      header: { projectKey: UNGROUPED_PROJECT_KEY, displayName: null },
      threads: ungrouped,
    });
  }
  return sections;
}
