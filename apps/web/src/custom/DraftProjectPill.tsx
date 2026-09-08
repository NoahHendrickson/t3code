/**
 * The project pill on a draft's hero — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * A "New agent" draft opens with no project; this is where one is chosen.
 * The same control stays on an assigned draft so the choice can be changed,
 * and changing it moves the draft — its sidebar row leaves one project's
 * section and appears under the other's — because the store keeps one
 * logical mapping per draft (custom/useNewAgentDraft owns the remap).
 *
 * The list of projects and the rule for which physical member a logical
 * project resolves to are upstream's (`buildSidebarProjectPickerEntries`,
 * the same derivation the palette and the grouped header use), read the way
 * upstream's own draft hero read them. Only the presentation is the fork's:
 * a pill with the project's favicon, in place of the dotted-underline text
 * upstream wove into its headline.
 */
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { sortLogicalProjectsForSidebar } from "~/components/Sidebar.logic";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import type { DraftId } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { selectProjectGroupingSettings } from "~/logicalProject";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
} from "~/sidebarProjectGrouping";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { ChevronDownIcon, FolderIcon, FolderPlusIcon } from "./icons/lucide-phosphor";
import { useAssignDraftProject } from "./useNewAgentDraft";

export function DraftProjectPill(props: {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  /** The resolved project's title, or null when the ref names no project —
      an unassigned "New agent" draft, or a project since removed. */
  readonly activeProjectTitle: string | null;
}) {
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const assignDraftProject = useAssignDraftProject();
  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);

  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const projectGroups = useMemo(
    () =>
      sortLogicalProjectsForSidebar(
        buildSidebarProjectSnapshots({
          projects,
          settings: projectGroupingSettings,
          primaryEnvironmentId,
          resolveEnvironmentLabel: (environmentId) =>
            environmentLabelById.get(environmentId) ?? null,
        }),
        threads,
        projectSortOrder,
      ),
    [
      environmentLabelById,
      primaryEnvironmentId,
      projectGroupingSettings,
      projectSortOrder,
      projects,
      threads,
    ],
  );
  const projectPickerEntries = useMemo(
    () =>
      buildSidebarProjectPickerEntries({
        groups: projectGroups,
        preferredProjectRef: props.activeProjectRef,
      }),
    [props.activeProjectRef, projectGroups],
  );
  const projectEntryByKey = useMemo(
    () => new Map(projectPickerEntries.map((entry) => [entry.group.projectKey, entry] as const)),
    [projectPickerEntries],
  );
  const activeEntry =
    props.activeProjectRef === null
      ? null
      : (projectPickerEntries.find((entry) =>
          entry.group.memberProjectRefs.some(
            (projectRef) =>
              scopedProjectKey(projectRef) === scopedProjectKey(props.activeProjectRef!),
          ),
        ) ?? null);
  const activeProjectKey = activeEntry?.group.projectKey ?? "";
  const label = activeEntry?.group.displayName ?? props.activeProjectTitle ?? "Choose a project";
  const hasResolvedProject = props.activeProjectTitle !== null;

  if (projectPickerEntries.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-events-auto rounded-full"
        onClick={openAddProject}
        data-testid="draft-project-pill"
      >
        <FolderPlusIcon className="size-4" />
        Add a project
      </Button>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={hasResolvedProject ? `Change project — ${label}` : "Choose a project"}
            className="pointer-events-auto max-w-72 rounded-full"
            data-testid="draft-project-pill"
            data-project-assigned={hasResolvedProject ? "true" : "false"}
          />
        }
      >
        {activeEntry ? (
          <ProjectFavicon
            environmentId={activeEntry.targetProject.environmentId}
            cwd={activeEntry.targetProject.workspaceRoot}
            className="size-4 shrink-0"
            fallbackIcon={FolderIcon}
          />
        ) : (
          <FolderIcon className="size-4 shrink-0" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="center" className="max-h-80 min-w-48! w-max max-w-72 overflow-y-auto">
        <MenuRadioGroup
          value={activeProjectKey}
          onValueChange={(value) => {
            const entry = projectEntryByKey.get(value as string);
            if (!entry || value === activeProjectKey || !props.draftId) return;
            void assignDraftProject(props.draftId, entry);
          }}
        >
          {projectPickerEntries.map(({ group, targetProject }) => (
            <MenuRadioItem
              key={group.projectKey}
              value={group.projectKey}
              closeOnClick
              className="[&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
            >
              <ProjectFavicon
                environmentId={targetProject.environmentId}
                cwd={targetProject.workspaceRoot}
                className="size-4 shrink-0"
                fallbackIcon={FolderIcon}
              />
              <span className="min-w-0 truncate">{group.displayName}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onClick={openAddProject}>
          <FolderPlusIcon />
          Add a project
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
