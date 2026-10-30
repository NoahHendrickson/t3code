/**
 * Opening a space's Home — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space's Home is its project's unsent draft. The new-thread handler only
 * reuses that draft while it is empty, and otherwise mints another. So a Home
 * with something in it is resumed as it is; an empty one goes through the
 * handler, which also resets its workspace context the way a new thread would.
 *
 * Drafts are keyed by their own project's logical key, which a space's key is
 * not when it gathers several projects (Scratch), so the Home is found by the
 * space's member projects instead.
 */
import type { ScopedProjectRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";

import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { readThreadShell } from "~/state/entities";

import { spaceHasProject } from "./spaceProjects";

type Space = { readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef> };

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
  return (space: Space, openNew: () => void) => {
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
