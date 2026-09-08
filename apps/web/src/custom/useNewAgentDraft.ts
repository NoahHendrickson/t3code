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
import { useCallback, useSyncExternalStore } from "react";

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
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryServerSettingsAtom, serverEnvironment } from "../state/server";
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
        setModelSelection,
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

      // A new draft carries the user's working mode and model from the thread
      // being viewed, like upstream's handler does. Composer overrides win
      // over persisted thread state — they are what the user currently sees.
      // The project's configured model, when it has one, is applied over the
      // carried model when a project is chosen.
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
      const composerActiveProvider = carrySourceComposer?.activeProvider ?? null;
      const carryModelSelection =
        (composerActiveProvider
          ? carrySourceComposer?.modelSelectionByProvider[composerActiveProvider]
          : null) ??
        carrySourceShell?.modelSelection ??
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
      if (carryModelSelection) {
        // Seeded, not explicit: a project default may still replace it.
        setModelSelection(draftId, carryModelSelection, { replaceOptions: true });
      }
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
    one's project, workspace defaults and model. The entry is the request
    token (one per call, so re-picking the same project is still a new
    request) and carries the target so the pill can show it and the composer
    can hold Send while the draft still points at the previous project. */
const latestAssignmentByDraftId = new Map<DraftId, { readonly entry: DraftProjectTarget }>();
const pendingAssignmentListeners = new Set<() => void>();

function notifyPendingAssignmentChange(): void {
  for (const listener of pendingAssignmentListeners) listener();
}

function subscribePendingAssignment(listener: () => void): () => void {
  pendingAssignmentListeners.add(listener);
  return () => {
    pendingAssignmentListeners.delete(listener);
  };
}

/** The logical project key of the pick still resolving for a draft, or null
    when nothing is in flight. */
export function readPendingDraftProjectKey(draftId: DraftId | null): string | null {
  return draftId === null
    ? null
    : (latestAssignmentByDraftId.get(draftId)?.entry.group.projectKey ?? null);
}

/** `readPendingDraftProjectKey` as a subscription, for the pill's label and
    the composer's send gate. */
export function useDraftProjectAssignmentPending(draftId: DraftId | null): string | null {
  return useSyncExternalStore(
    subscribePendingAssignment,
    () => readPendingDraftProjectKey(draftId),
    () => null,
  );
}

/** Points an open draft at a project. The draft keeps its identity — prompt,
    attachments, route — and only its target moves: the store drops the old
    logical mapping, so the sidebar row leaves the previous project's section
    and appears under the new one. The project's own workspace defaults are
    resolved the way upstream's handler resolves them for a fresh draft, so
    an unassigned draft lands in the same env mode a "New thread in X" would
    have; branch and worktree reset for the same reason (they named the old
    project's checkout). Model selection: an explicit pick stands, and a
    seeded one — the model carried from the thread the draft was started
    from — is replaced only by the project's own default, when it has one. */
export async function assignDraftProject(
  draftId: DraftId,
  entry: DraftProjectTarget,
  settings: Pick<ServerSettings, "defaultThreadEnvMode" | "newWorktreesStartFromOrigin">,
): Promise<void> {
  const request = { entry };
  latestAssignmentByDraftId.set(draftId, request);
  notifyPendingAssignmentChange();
  const project = entry.targetProject;
  const projectRef: ScopedProjectRef = {
    environmentId: project.environmentId,
    projectId: project.id,
  };
  let envMode;
  let superseded = false;
  try {
    envMode = await resolveDefaultThreadEnvMode({
      projectSetting: project.defaultThreadEnvMode,
      projectFile:
        project.defaultThreadEnvMode == null
          ? await readT3ProjectFileDefaultThreadEnvMode(
              project.environmentId,
              project.workspaceRoot,
            )
          : null,
      globalDefault: settings.defaultThreadEnvMode,
    });
  } finally {
    // The await yielded: a later pick may have superseded this one, in which
    // case the in-flight entry is that pick's and stays until it settles.
    superseded = latestAssignmentByDraftId.get(draftId) !== request;
    if (!superseded) {
      latestAssignmentByDraftId.delete(draftId);
      notifyPendingAssignmentChange();
    }
  }
  if (superseded) return;
  const { getComposerDraft, getDraftSession, setLogicalProjectDraftThreadId, setModelSelection } =
    useComposerDraftStore.getState();
  // The draft may have been promoted or discarded meanwhile — re-registering
  // it would resurrect it.
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
  // Same fallback as upstream's DraftHeroHeadline: a project without its own
  // default model inherits the default of the environment it lives in.
  const defaultModelSelection =
    project.defaultModelSelection ??
    appAtomRegistry.get(serverEnvironment.configValueAtom(project.environmentId))?.settings
      .defaultModelSelection;
  if (defaultModelSelection && !hasExplicitComposerModelSelection(getComposerDraft(draftId))) {
    setModelSelection(draftId, defaultModelSelection, { replaceOptions: true });
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
