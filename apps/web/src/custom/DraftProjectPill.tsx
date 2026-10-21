/**
 * The project chip on a draft's composer — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * A "New agent" draft opens with no project; this is where one is chosen.
 * "No project" is a choice too: it points the draft at the environment's
 * scratch folder, the same home `chat.newWithoutProject` starts threads in.
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
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
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
import { useScratchProject } from "~/hooks/useScratchProject";
import { useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "~/logicalProject";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
  type SidebarProjectPickerEntry,
} from "~/sidebarProjectGrouping";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderPlusIcon,
  MessageSquareDashedIcon,
} from "./icons/lucide-phosphor";
import { useAssignDraftProject, useDraftProjectAssignmentPending } from "./useNewAgentDraft";

/** Same trigger dress as the branch chip; the row's CSS owns the chip fill. */
const DRAFT_PROJECT_CHIP_CLASS_NAME =
  "min-w-0 max-w-72 font-normal text-muted-foreground/70 text-xs! hover:text-foreground/80 active:scale-100";

/** The radio value of the "No project" row, and its pending key while the
    scratch project opens; never a logical project key. */
const NO_PROJECT_VALUE = "no-project";

/** What the chip shows: nothing chosen yet, "No project", or a project.
    `pending` while a pick is still moving the draft. */
type DraftProjectSelection =
  | { readonly kind: "unassigned" }
  | { readonly kind: "no-project"; readonly pending: boolean }
  | {
      readonly kind: "project";
      readonly entry: SidebarProjectPickerEntry | null;
      readonly label: string;
      readonly pending: boolean;
    };

/** A pick in flight shows ahead of where the draft still points. */
function resolveDraftProjectSelection(input: {
  readonly pendingProjectKey: string | null;
  readonly pendingEntry: SidebarProjectPickerEntry | null;
  readonly activeIsScratch: boolean;
  readonly activeEntry: SidebarProjectPickerEntry | null;
  readonly activeProjectTitle: string | null;
}): DraftProjectSelection {
  if (input.pendingProjectKey === NO_PROJECT_VALUE) return { kind: "no-project", pending: true };
  if (input.pendingEntry !== null) {
    return {
      kind: "project",
      entry: input.pendingEntry,
      label: input.pendingEntry.group.displayName,
      pending: true,
    };
  }
  if (input.activeIsScratch) return { kind: "no-project", pending: false };
  const label = input.activeEntry?.group.displayName ?? input.activeProjectTitle;
  return label === null
    ? { kind: "unassigned" }
    : { kind: "project", entry: input.activeEntry, label, pending: false };
}

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

/** The picker rows' folder for a project with no favicon, emoji or chosen
    icon: white at low opacity, so it tints with the glass popup instead of
    sitting on it as the flat grey of upstream's muted-icon token. Dark only;
    the light popup keeps that token, where white would vanish. */
function PickerFolderIcon(props: { readonly className?: string | undefined }) {
  return <FolderIcon className={cn(props.className, "dark:text-white/40")} />;
}

export function DraftProjectPill(props: {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  /** The resolved project's title, or null when the ref names no project —
      an unassigned "New agent" draft, or a project since removed. */
  readonly activeProjectTitle: string | null;
}) {
  const allProjects = useProjects();
  const { scratchWorkspaceRootFor, scratchEnvironmentId, openScratchProject } = useScratchProject();
  // The environment's scratch folder is upstream's "No project" home: it is
  // offered as its own row, never listed as a project.
  const { projects, scratchProjects } = useMemo(() => {
    const partition = {
      projects: [] as EnvironmentProject[],
      scratchProjects: [] as EnvironmentProject[],
    };
    for (const project of allProjects) {
      (isScratchProject(project, scratchWorkspaceRootFor(project.environmentId))
        ? partition.scratchProjects
        : partition.projects
      ).push(project);
    }
    return partition;
  }, [allProjects, scratchWorkspaceRootFor]);
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const assignDraftProject = useAssignDraftProject();
  const pendingProjectKey = useDraftProjectAssignmentPending(props.draftId);
  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);
  const noProjectEnvironmentId = scratchEnvironmentId(
    props.activeProjectRef?.environmentId ?? primaryEnvironmentId,
  );

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
  const activeKey =
    props.activeProjectRef === null ? null : scopedProjectKey(props.activeProjectRef);
  const selection = resolveDraftProjectSelection({
    pendingProjectKey,
    pendingEntry:
      pendingProjectKey === null ? null : (projectEntryByKey.get(pendingProjectKey) ?? null),
    activeIsScratch: scratchProjects.some(
      (project) =>
        scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }) ===
        activeKey,
    ),
    activeEntry:
      projectPickerEntries.find((entry) =>
        entry.group.memberProjectRefs.some(
          (projectRef) => scopedProjectKey(projectRef) === activeKey,
        ),
      ) ?? null,
    activeProjectTitle: props.activeProjectTitle,
  });
  const radioValue =
    selection.kind === "no-project"
      ? NO_PROJECT_VALUE
      : selection.kind === "project"
        ? (selection.entry?.group.projectKey ?? "")
        : "";
  const label =
    selection.kind === "no-project"
      ? "No project"
      : selection.kind === "project"
        ? selection.label
        : "Choose a project";
  const pending = selection.kind !== "unassigned" && selection.pending;

  const reportAssignFailure = (displayName: string, error: unknown) => {
    console.error(error);
    toastManager.add({
      type: "error",
      title: `Couldn't switch to ${displayName}`,
      description: error instanceof Error ? error.message : "An error occurred.",
    });
  };

  // The scratch project exists only once the server has made it, so the pick
  // opens it first, already pending; openScratchProject reports its own
  // failure.
  const pickNoProject = (draftId: DraftId, environmentId: EnvironmentId) =>
    assignDraftProject(draftId, {
      pendingKey: NO_PROJECT_VALUE,
      environmentId,
      resolve: async () => {
        const project = await openScratchProject(environmentId);
        return project === null
          ? null
          : {
              group: {
                projectKey: deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings),
              },
              targetProject: project,
            };
      },
    }).catch((error: unknown) => reportAssignFailure("No project", error));

  if (projectPickerEntries.length === 0 && noProjectEnvironmentId === null) {
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
            aria-label={selection.kind === "unassigned" ? label : `Change project — ${label}`}
            // No press-scale, like the branch chip: the popup aligns live to
            // this trigger and a momentary shrink drags it sideways.
            className={DRAFT_PROJECT_CHIP_CLASS_NAME}
            data-testid="draft-project-pill"
            data-composer-context-control
            data-project-assigned={selection.kind === "unassigned" ? "false" : "true"}
            aria-busy={pending || undefined}
          />
        }
      >
        {selection.kind === "no-project" ? (
          <MessageSquareDashedIcon className="size-3 shrink-0" />
        ) : selection.kind === "project" && selection.entry ? (
          <ProjectFavicon
            project={selection.entry.targetProject}
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
          value={radioValue}
          onValueChange={(value) => {
            if (value === radioValue || !props.draftId) return;
            if (value === NO_PROJECT_VALUE) {
              if (noProjectEnvironmentId !== null) {
                void pickNoProject(props.draftId, noProjectEnvironmentId);
              }
              return;
            }
            const entry = projectEntryByKey.get(value as string);
            if (!entry) return;
            // The pick already cleared its Send hold on the way out; the
            // draft is simply still on its previous project, so say so.
            void assignDraftProject(props.draftId, entry).catch((error: unknown) =>
              reportAssignFailure(entry.group.displayName, error),
            );
          }}
        >
          {noProjectEnvironmentId !== null ? (
            <MenuRadioItem
              value={NO_PROJECT_VALUE}
              closeOnClick
              className="[&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
            >
              <MessageSquareDashedIcon className="size-4 shrink-0 dark:text-white/40" />
              <span className="min-w-0 truncate">No project</span>
            </MenuRadioItem>
          ) : null}
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
                fallbackIcon={PickerFolderIcon}
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
