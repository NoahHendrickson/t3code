/**
 * Which projects make up a space — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space is one of the sidebar's logical projects (a repository checked out
 * on several machines is one space), keyed by the same group key the project
 * headers use. Built from the project list alone, the same way
 * `useSidebarProjectGroups` builds it, minus the thread-driven sort: the pages
 * and the chat header that read this only look a space up, and reading every
 * thread shell to order a list nobody draws would re-render them on every
 * streamed token.
 */
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useClientSettings } from "~/hooks/useSettings";
import { buildProjectGroups, selectProjectGroupingSettings } from "~/logicalProject";
import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

function useSpaceGroups() {
  const projects = useProjects();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return buildProjectGroups({
    projects,
    settings,
    preferredEnvironmentId: primaryEnvironmentId,
    groupScratchProjects: true,
  });
}

export function useSpace(spaceKey: string | undefined) {
  const groups = useSpaceGroups();
  return spaceKey === undefined ? null : (groups.find((group) => group.key === spaceKey) ?? null);
}

/** The space a project belongs to. */
export function useSpaceOfProject(project: ScopedProjectRef | null) {
  const groups = useSpaceGroups();
  if (project === null) return null;
  return (
    groups.find((group) => spaceHasProject(group, project.environmentId, project.projectId)) ?? null
  );
}

export function spaceHasProject(
  space: { readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef> },
  environmentId: string,
  projectId: string,
): boolean {
  return space.memberProjectRefs.some(
    (ref) => ref.environmentId === environmentId && ref.projectId === projectId,
  );
}
