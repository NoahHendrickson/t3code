/**
 * Which projects the sidebar's quick-start strip offers — see
 * `.fork/customizations.yaml#fork-sidebar-recent-projects`.
 *
 * "Recent" is the newest thread activity in the project, the same timestamp
 * the cards print (last user message, else last update), over the threads the
 * list would show: archived threads, subagents and off-sidebar automation runs
 * are filtered out by the caller. A project with no such thread is not recent
 * and is left out rather than padded in.
 */
import { projectRefKey, type SidebarV2GroupableProject } from "./sidebarV2ProjectGrouping";

const SIDEBAR_V2_RECENT_PROJECT_LIMIT = 5;

export interface SidebarV2RecentProjectThread {
  readonly environmentId: string;
  readonly projectId: string;
  readonly latestUserMessageAt: string | null;
  readonly updatedAt: string;
}

/** Project keys, most recently active first. `projectRefIndex` is
    createProjectRefIndex's physical-ref to logical-key map, so a project spanning environments ranks once. */
export function rankSidebarV2RecentProjectKeys(input: {
  readonly threads: ReadonlyArray<SidebarV2RecentProjectThread>;
  readonly projectRefIndex: ReadonlyMap<string, string>;
  readonly limit?: number;
}): string[] {
  const latestByProjectKey = new Map<string, string>();
  for (const thread of input.threads) {
    const projectKey = input.projectRefIndex.get(
      projectRefKey(thread.environmentId, thread.projectId),
    );
    if (projectKey === undefined) continue;
    const at = thread.latestUserMessageAt ?? thread.updatedAt;
    const previous = latestByProjectKey.get(projectKey);
    if (previous === undefined || at > previous) latestByProjectKey.set(projectKey, at);
  }
  return [...latestByProjectKey]
    .toSorted(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, input.limit ?? SIDEBAR_V2_RECENT_PROJECT_LIMIT)
    .map(([projectKey]) => projectKey);
}

/** Resolves ranked keys back to the caller's own project objects, dropping a
    key whose project has gone. */
export function pickSidebarV2RecentProjects<TProject extends SidebarV2GroupableProject>(
  projectKeys: ReadonlyArray<string>,
  projectGroups: ReadonlyArray<TProject>,
): TProject[] {
  const byKey = new Map(projectGroups.map((group) => [group.projectKey, group]));
  return projectKeys.flatMap((key) => {
    const group = byKey.get(key);
    return group ? [group] : [];
  });
}
