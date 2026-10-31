/* A space's Home is its project's unsent draft, see `.fork/customizations.yaml#fork-spaces`.
   A Home with content resumes as it is; otherwise the new-thread handler opens one. Drafts
   key by their own project, not the space (Scratch spans several), so lookup goes by the
   space's member projects. */
import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";

import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { readThreadShell } from "~/state/entities";

import { spaceHasProject } from "./spaceProjects";

type Space = { readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef> };
type OpenableSpace = Space & {
  readonly representative: { readonly environmentId: EnvironmentId; readonly id: ProjectId };
};

/** The drafts that are a project's Home, one draft id per logical project.
    The store's own record, so it changes only when a Home does. */
export function useHomeDraftIds(): Readonly<Record<string, string>> {
  return useComposerDraftStore((store) => store.logicalProjectDraftThreadKeyByLogicalProjectKey);
}

/** Whether `draft` is unsent work in `space`. */
export function isSpaceDraft(
  space: Space,
  draft: { readonly environmentId: string; readonly projectId: string } | null | undefined,
): boolean {
  return draft != null && spaceHasProject(space, draft.environmentId, draft.projectId);
}

export function useOpenSpaceHome() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  /** `from` is the project the caller is in, if any. */
  return (space: OpenableSpace | null, from: ScopedProjectRef | null = null) => {
    const openNew = () => {
      const target =
        space === null ||
        (from !== null && spaceHasProject(space, from.environmentId, from.projectId))
          ? from
          : scopeProjectRef(space.representative.environmentId, space.representative.id);
      if (target !== null) void handleNewThread(target);
    };
    if (space === null) {
      openNew();
      return;
    }
    const store = useComposerDraftStore.getState();
    const draftId = Object.values(store.logicalProjectDraftThreadKeyByLogicalProjectKey).find(
      (id) => {
        const draft = store.draftThreadsByThreadKey[id];
        return (
          draft !== undefined &&
          draft.promotedTo == null &&
          isSpaceDraft(space, draft) &&
          readThreadShell(scopeThreadRef(draft.environmentId, draft.threadId)) === null &&
          composerDraftHasUserContent(store.getComposerDraft(DraftId.make(id)))
        );
      },
    );
    if (draftId === undefined) {
      openNew();
      return;
    }
    void navigate({ to: "/draft/$draftId", params: { draftId } });
  };
}
