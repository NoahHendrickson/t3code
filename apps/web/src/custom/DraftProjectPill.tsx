/**
 * The project chip on a draft's composer — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * A "New agent" draft opens with no project; this is where one is chosen.
 * It is the first chip in the composer's context row, ahead of the workspace
 * and branch chips, and dresses like them: the row's CSS (theme.custom.css,
 * keyed on `[data-fork-composer-context-row]`) paints every button in it as
 * the same filled 24px chip, and the `data-composer-label` pair lets the
 * label collapse to its glyph with the neighbours when the strip overflows.
 * The same control stays on an assigned draft so the choice can be changed,
 * and changing it moves the draft — its sidebar row leaves one project's
 * section and appears under the other's — because the store keeps one
 * logical mapping per draft (custom/useNewAgentDraft owns the remap).
 *
 * The list of projects and the rule for which physical member a logical
 * project resolves to are upstream's (`buildSidebarProjectPickerEntries`,
 * the same derivation the palette and the grouped header use), read the way
 * upstream's own draft hero read them. Only the presentation is the fork's:
 * a chip with the project's favicon, in place of the dotted-underline text
 * upstream wove into its headline.
 */
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useCallback, useMemo, type ReactNode } from "react";

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
import { toastManager } from "~/components/ui/toast";
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
import { useAssignDraftProject, useDraftProjectAssignmentPending } from "./useNewAgentDraft";

/** Same trigger dress as the branch chip; the row's CSS owns the chip fill. */
const DRAFT_PROJECT_CHIP_CLASS_NAME =
  "min-w-0 max-w-72 font-normal text-muted-foreground/70 text-xs! hover:text-foreground/80 active:scale-100";

/** Upstream's collapsing chip label: hidden with its siblings when the strip overflows. */
function DraftProjectChipLabel({ children }: { readonly children: ReactNode }) {
  return (
    <span
      data-composer-label
      className="min-w-0 max-w-[240px] group-data-[compact]/composer-context:max-w-0"
    >
      <span
        data-composer-label-motion
        className="block w-full min-w-0 max-w-[240px] truncate transition-opacity duration-180 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[compact]/composer-context:opacity-0 motion-reduce:transition-none"
      >
        {children}
      </span>
    </span>
  );
}

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
  const pendingProjectKey = useDraftProjectAssignmentPending(props.draftId);
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
  // A pick shows on the pill the moment it is made; the draft itself moves
  // once the project's defaults resolve, and Send waits for that (the
  // composer reads the same pending state).
  const pendingEntry =
    pendingProjectKey === null ? null : (projectEntryByKey.get(pendingProjectKey) ?? null);
  const activeEntry =
    pendingEntry ??
    (props.activeProjectRef === null
      ? null
      : (projectPickerEntries.find((entry) =>
          entry.group.memberProjectRefs.some(
            (projectRef) =>
              scopedProjectKey(projectRef) === scopedProjectKey(props.activeProjectRef!),
          ),
        ) ?? null));
  const activeProjectKey = activeEntry?.group.projectKey ?? "";
  const label = activeEntry?.group.displayName ?? props.activeProjectTitle ?? "Choose a project";
  const hasResolvedProject = pendingEntry !== null || props.activeProjectTitle !== null;

  if (projectPickerEntries.length === 0) {
    return (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className={DRAFT_PROJECT_CHIP_CLASS_NAME}
        onClick={openAddProject}
        data-testid="draft-project-pill"
        data-composer-context-control
      >
        <FolderPlusIcon className="size-3 shrink-0" />
        <DraftProjectChipLabel>Add a project</DraftProjectChipLabel>
      </Button>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={hasResolvedProject ? `Change project — ${label}` : "Choose a project"}
            // No press-scale, like the branch chip: the popup aligns live to
            // this trigger and a momentary shrink drags it sideways.
            className={DRAFT_PROJECT_CHIP_CLASS_NAME}
            data-testid="draft-project-pill"
            data-composer-context-control
            data-project-assigned={hasResolvedProject ? "true" : "false"}
            aria-busy={pendingEntry !== null || undefined}
          />
        }
      >
        {activeEntry ? (
          <ProjectFavicon
            project={activeEntry.targetProject}
            className="size-3 shrink-0"
            fallbackIcon={FolderIcon}
          />
        ) : (
          <FolderIcon className="size-3 shrink-0" />
        )}
        <DraftProjectChipLabel>{label}</DraftProjectChipLabel>
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="top"
        className="max-h-80 min-w-48! w-max max-w-72 overflow-y-auto"
      >
        <MenuRadioGroup
          value={activeProjectKey}
          onValueChange={(value) => {
            const entry = projectEntryByKey.get(value as string);
            if (!entry || value === activeProjectKey || !props.draftId) return;
            // The pick already cleared its Send hold on the way out; the
            // draft is simply still on its previous project, so say so.
            void assignDraftProject(props.draftId, entry).catch((error: unknown) => {
              console.error(error);
              toastManager.add({
                type: "error",
                title: `Couldn't switch to ${entry.group.displayName}`,
                description: error instanceof Error ? error.message : "An error occurred.",
              });
            });
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
                project={targetProject}
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
