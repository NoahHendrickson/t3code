/* Which projects make up a space, see `.fork/customizations.yaml#fork-spaces`. Built
   from the project list alone, without useSidebarProjectGroups' thread-driven sort:
   readers only look a space up, and reading thread shells would re-render them per token. */
import type { ScopedProjectRef } from "@t3tools/contracts";
import {
  buildProjectGroups,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { useClientSettings } from "~/hooks/useSettings";
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
