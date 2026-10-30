/**
 * Opening a space's Home — see `.fork/customizations.yaml#fork-spaces`.
 *
 * A space's Home is its project's unsent draft. The new-thread handler only
 * reuses that draft while it is empty, and otherwise mints another, leaving
 * the written one where Spaces lists no drafts. So a Home with something in
 * it is resumed as it is; an empty one goes through the handler, which also
 * resets its workspace context the way a new thread would.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";

import { composerDraftHasUserContent, useComposerDraftStore } from "~/composerDraftStore";
import { readThreadShell } from "~/state/entities";

export function useOpenSpaceHome() {
  const navigate = useNavigate();
  return (spaceKey: string, openNew: () => void) => {
    const store = useComposerDraftStore.getState();
    const draft = store.getDraftSessionByLogicalProjectKey(spaceKey);
    const resumable =
      draft !== null &&
      draft.promotedTo == null &&
      readThreadShell(scopeThreadRef(draft.environmentId, draft.threadId)) === null &&
      composerDraftHasUserContent(store.getComposerDraft(draft.draftId));
    if (!resumable) {
      openNew();
      return;
    }
    void navigate({ to: "/draft/$draftId", params: { draftId: draft.draftId } });
  };
}
