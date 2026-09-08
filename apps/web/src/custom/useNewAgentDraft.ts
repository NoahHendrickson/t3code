/**
 * The two moves behind the "New agent" button — see
 * `.fork/customizations.yaml#fork-new-agent-draft` and custom/newAgentDraft
 * for the model.
 *
 * `useStartNewAgentDraft` opens (or returns to) the one unassigned draft and
 * lands on its route. `assignDraftProject` (via `useAssignDraftProject`) is
 * what the chat view's project pill calls: it remaps the open draft onto a
 * chosen project's logical key and seeds the project's own defaults — the
 * workspace context upstream's new-thread handler would have resolved had
 * the project been known up front, and the model selection the draft hero
 * already re-seeds on a project change. The hooks exist to read the router
 * and the primary server's settings; the draft-store writes themselves are
 * the same calls upstream makes.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_RUNTIME_MODE,
  type ScopedProjectRef,
  type ServerSettings,
} from "@t3tools/contracts";
import { resolveDefaultThreadEnvMode } from "@t3tools/shared/threadEnvMode";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import {
  hasExplicitComposerModelSelection,
  resolveNewDraftStartFromOrigin,
} from "../lib/chatThreadActions";
import { readT3ProjectFileDefaultThreadEnvMode } from "../lib/t3ProjectFileDefaults";
import { newDraftId, newThreadId } from "../lib/utils";
import type { SidebarProjectGroupMember, SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { readThreadShell } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { primaryServerSettingsAtom } from "../state/server";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY, newAgentDraftProjectRef } from "./newAgentDraft";

/** Opens the unassigned draft. Reuses the live one when there is one — the
    prompt is editable before a project is chosen, so a second click goes
    back to what the user was writing rather than losing it behind a fresh,
    empty column — and mints one otherwise. Resolves to the draft landed on,
    or null when there is no environment to host it. */
export function useStartNewAgentDraft(): (options?: {
  replace?: boolean;
}) => Promise<DraftId | null> {
  const router = useRouter();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return useCallback(
    async (options) => {
      if (primaryEnvironmentId === null) return null;
      const {
        applyStickyState,
        getComposerDraft,
        getDraftSession,
        getDraftSessionByLogicalProjectKey,
        setLogicalProjectDraftThreadId,
      } = useComposerDraftStore.getState();
      const projectRef = newAgentDraftProjectRef(primaryEnvironmentId);
      const navigateTo = (draftId: DraftId) =>
        router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
          replace: options?.replace ?? false,
        });

      const existing = getDraftSessionByLogicalProjectKey(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY);
      if (
        existing &&
        existing.promotedTo == null &&
        readThreadShell({ environmentId: existing.environmentId, threadId: existing.threadId }) ===
          null
      ) {
        await navigateTo(existing.draftId);
        return existing.draftId;
      }

      // A new draft carries the user's working mode from the thread being
      // viewed, like upstream's handler does; the project's configured model
      // is applied when a project is chosen.
      const currentRouteParams =
        router.state.matches[router.state.matches.length - 1]?.params ?? {};
      const currentRouteTarget = resolveThreadRouteTarget(currentRouteParams);
      const carrySourceComposer = currentRouteTarget
        ? getComposerDraft(
            currentRouteTarget.kind === "server"
              ? currentRouteTarget.threadRef
              : currentRouteTarget.draftId,
          )
        : null;
      const carrySourceDraft =
        currentRouteTarget?.kind === "draft" ? getDraftSession(currentRouteTarget.draftId) : null;
      const carrySourceShell =
        currentRouteTarget?.kind === "server"
          ? readThreadShell(currentRouteTarget.threadRef)
          : null;
      const runtimeMode =
        carrySourceComposer?.runtimeMode ??
        carrySourceShell?.runtimeMode ??
        carrySourceDraft?.runtimeMode ??
        DEFAULT_RUNTIME_MODE;
      const interactionMode =
        carrySourceComposer?.interactionMode ??
        carrySourceShell?.interactionMode ??
        carrySourceDraft?.interactionMode ??
        null;

      const draftId = newDraftId();
      setLogicalProjectDraftThreadId(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY, projectRef, draftId, {
        threadId: newThreadId(),
        createdAt: new Date().toISOString(),
        branch: null,
        worktreePath: null,
        envMode: "local",
        startFromOrigin: false,
        runtimeMode,
        ...(interactionMode ? { interactionMode } : {}),
      });
      applyStickyState(draftId);
      await navigateTo(draftId);
      return draftId;
    },
    [primaryEnvironmentId, router],
  );
}

/** What a pick needs to know about its target: the logical key the draft
    moves under and the member project whose defaults seed it. The pill
    passes a full `SidebarProjectPickerEntry`. */
export interface DraftProjectTarget {
  readonly group: Pick<SidebarProjectSnapshot, "projectKey">;
  readonly targetProject: Pick<
    SidebarProjectGroupMember,
    "environmentId" | "id" | "workspaceRoot" | "defaultThreadEnvMode" | "defaultModelSelection"
  >;
}

/** The pick in flight per draft. Resolving a project's defaults yields to a
    t3.json lookup, so two quick picks can settle out of order; only the
    latest may write, or a slower earlier pick would overwrite a faster later
    one's project, workspace defaults and model. */
const latestAssignmentByDraftId = new Map<DraftId, symbol>();

/** Points an open draft at a project. The draft keeps its identity — prompt,
    attachments, route — and only its target moves: the store drops the old
    logical mapping, so the sidebar row leaves the previous project's section
    and appears under the new one. The project's own workspace defaults are
    resolved the way upstream's handler resolves them for a fresh draft, so
    an unassigned draft lands in the same env mode a "New thread in X" would
    have; branch and worktree reset for the same reason (they named the old
    project's checkout). Model selection follows the draft hero's rule: an
    explicit pick stands, a seeded one re-seeds from sticky state and the
    project default. */
export async function assignDraftProject(
  draftId: DraftId,
  entry: DraftProjectTarget,
  settings: Pick<ServerSettings, "defaultThreadEnvMode" | "newWorktreesStartFromOrigin">,
): Promise<void> {
  const request = Symbol("assign-draft-project");
  latestAssignmentByDraftId.set(draftId, request);
  const project = entry.targetProject;
  const projectRef: ScopedProjectRef = {
    environmentId: project.environmentId,
    projectId: project.id,
  };
  const envMode = await resolveDefaultThreadEnvMode({
    projectSetting: project.defaultThreadEnvMode,
    projectFile:
      project.defaultThreadEnvMode == null
        ? await readT3ProjectFileDefaultThreadEnvMode(project.environmentId, project.workspaceRoot)
        : null,
    globalDefault: settings.defaultThreadEnvMode,
  });
  // The await above yielded: a later pick may have superseded this one, and
  // the draft may have been promoted or discarded meanwhile — re-registering
  // it would resurrect it.
  if (latestAssignmentByDraftId.get(draftId) !== request) return;
  latestAssignmentByDraftId.delete(draftId);
  const {
    applyStickyState,
    getComposerDraft,
    getDraftSession,
    setLogicalProjectDraftThreadId,
    setModelSelection,
  } = useComposerDraftStore.getState();
  const session = getDraftSession(draftId);
  if (!session || session.promotedTo != null) return;
  setLogicalProjectDraftThreadId(entry.group.projectKey, projectRef, draftId, {
    branch: null,
    worktreePath: null,
    envMode,
    startFromOrigin: resolveNewDraftStartFromOrigin({
      envMode,
      newWorktreesStartFromOrigin: settings.newWorktreesStartFromOrigin,
    }),
  });
  if (!hasExplicitComposerModelSelection(getComposerDraft(draftId))) {
    applyStickyState(draftId);
    if (project.defaultModelSelection) {
      setModelSelection(draftId, project.defaultModelSelection, { replaceOptions: true });
    }
  }
}

/** `assignDraftProject` with the primary server's settings read in, for the
    pill. New-thread defaults are a user preference edited on the primary
    environment only, the same reading upstream's handler makes. */
export function useAssignDraftProject(): (
  draftId: DraftId,
  entry: DraftProjectTarget,
) => Promise<void> {
  const primaryServerSettings = useAtomValue(primaryServerSettingsAtom);
  return useCallback(
    (draftId, entry) => assignDraftProject(draftId, entry, primaryServerSettings),
    [primaryServerSettings],
  );
}
