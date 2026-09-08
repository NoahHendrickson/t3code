/**
 * The "New agent" draft — a draft session with no project yet. See
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * Upstream's "New thread" asks which project first (one project: create in
 * it; several: the palette picker) and only then mints a draft, so every
 * draft the store holds belongs to a project. The fork's sidebar button turns
 * that around: "New agent" opens a blank chat column immediately and the
 * project is chosen from a pill in the chat view. Between those two moments
 * the draft is *unassigned* — the store still requires a project ref, so the
 * draft carries a sentinel project id under a logical project key of its own.
 *
 * Two consequences the rest of the app has to honour, both pure predicates
 * here so nothing has to restate the sentinel:
 *
 * - The sidebar draws no row for an unassigned draft (`isUnassignedDraft` in
 *   custom/sidebarV2DraftRows). A row needs a project section to sit in, and
 *   "Unknown project" would be a lie — the user has not chosen one yet.
 * - ChatView resolves the sentinel to no project, which is the same path a
 *   deleted project already takes: the composer's `projectSelectionRequired`
 *   gate blocks send and the draft hero offers the project chooser.
 *
 * Choosing a project remaps the draft onto that project's own logical key
 * (custom/useNewAgentDraft), at which point it is an ordinary draft — the
 * sidebar row appears under the chosen project and moves with any later
 * change, because the store keeps one logical mapping per draft.
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, type ScopedProjectRef } from "@t3tools/contracts";

import type { DraftSessionState } from "../composerDraftStore";

/** The logical project key an unassigned draft is registered under. One live
    unassigned draft at a time, like any other logical project: a second
    "New agent" click returns to the open one rather than minting another. */
export const NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY = "fork:new-agent";

/** The sentinel project id an unassigned draft carries. It resolves to no
    project on every environment, which is exactly the point. */
export const NEW_AGENT_DRAFT_PROJECT_ID = ProjectId.make("fork-new-agent-unassigned");

export function newAgentDraftProjectRef(environmentId: EnvironmentId): ScopedProjectRef {
  return scopeProjectRef(environmentId, NEW_AGENT_DRAFT_PROJECT_ID);
}

/** True for a draft that has not been given a project yet. Either signal is
    enough: the logical key is what the store maps it by, the sentinel id is
    what a remap through the store's own project-change path would leave
    behind if the key were ever reassigned without a project. */
export function isUnassignedDraft(
  session: Pick<DraftSessionState, "logicalProjectKey" | "projectId"> | null | undefined,
): boolean {
  if (!session) return false;
  return (
    session.logicalProjectKey === NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY ||
    session.projectId === NEW_AGENT_DRAFT_PROJECT_ID
  );
}
