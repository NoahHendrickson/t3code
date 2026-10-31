/**
 * A space's pull requests — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space can hold one repository checked out on several machines, and each
 * environment answers for the same repository, so a pull request comes back
 * once per environment. It is listed once, newest first.
 */
import type { EnvironmentId, PullRequestListInput, ProjectId } from "@t3tools/contracts";

import { usePullRequestList, type EnvironmentQueryTarget } from "~/state/pullRequests";

import { spaceHasProject, type useSpace } from "./spaceProjects";

type Space = NonNullable<ReturnType<typeof useSpace>>;

export function spacePullRequestEntries<
  T extends {
    readonly environmentId: string;
    readonly projectId: string;
    readonly host: string;
    readonly repository: string;
    readonly number: number;
    readonly updatedAt: string;
  },
>(space: Pick<Space, "memberProjectRefs">, entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => spaceHasProject(space, entry.environmentId, entry.projectId))
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .filter((entry) => {
      const key = `${entry.host}/${entry.repository}#${entry.number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function useSpacePullRequests(space: Space, state: "open" | "merged", limit: number) {
  const projectIdsByEnvironment = new Map<EnvironmentId, ProjectId[]>();
  for (const ref of space.memberProjectRefs) {
    const projectIds = projectIdsByEnvironment.get(ref.environmentId) ?? [];
    projectIds.push(ref.projectId);
    projectIdsByEnvironment.set(ref.environmentId, projectIds);
  }
  const targets = [...projectIdsByEnvironment].map(
    ([environmentId, projectIds]): EnvironmentQueryTarget<PullRequestListInput> => ({
      environmentId,
      input: { state, involvement: "all", projectIds, limit },
    }),
  );
  const list = usePullRequestList(targets);
  return { list, entries: spacePullRequestEntries(space, list.data?.entries ?? []) };
}

/** The PR page on a space's open pull requests: a fresh view, not the list's
    saved filters, where a search or author filter left there would read as
    the space having fewer PRs than it does. The page scopes to one project,
    so it opens on the space's representative. */
export function spaceOpenPullRequestsSearch(representative: {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
}) {
  return {
    involvement: "all",
    state: "open",
    environmentId: representative.environmentId,
    projectId: representative.id,
  } as const;
}

/** The PR page opened on one pull request. */
export function pullRequestSearch(
  entry: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
    readonly host: string;
    readonly repository: string;
    readonly number: number;
  },
  state: "open" | "merged",
) {
  return {
    involvement: "all",
    state,
    repository: entry.repository,
    number: entry.number,
    selectedHost: entry.host,
    selectedProjectId: entry.projectId,
    selectedEnvironmentId: entry.environmentId,
  } as const;
}
