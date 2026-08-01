/**
 * Sidebar V2 draft rows — see `.fork/customizations.yaml#sidebar-v2-draft-rows`.
 *
 * New thread creates a client-only draft session and navigates to
 * `/draft/$draftId`, but the sidebar list is fed from server shells, so the
 * row used to be missing until the first send promoted it. These helpers turn
 * unpromoted drafts into the same shell shape the list already paints, so a
 * project-header plus (and the chrome new-thread control) leaves a card under
 * the right project.
 */
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ModelSelection, ScopedThreadRef } from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";

import type { ComposerThreadDraftState, DraftId, DraftSessionState } from "../composerDraftStore";

export interface SidebarV2DraftRow {
  readonly draftId: DraftId;
  readonly shell: EnvironmentThreadShell;
}

/** Same seed ChatView uses when promoting an unsent draft: trimmed prompt,
    else the empty-draft label. Truncation matches the server auto-title. */
export function sidebarDraftTitleFromPrompt(prompt: string | null | undefined): string {
  const trimmed = prompt?.trim() ?? "";
  return trimmed.length > 0 ? truncate(trimmed) : "New thread";
}

/** The unsaved picker state is what the composer currently shows. */
export function sidebarDraftModelSelection(input: {
  readonly composerDraft:
    | Pick<ComposerThreadDraftState, "activeProvider" | "modelSelectionByProvider">
    | null
    | undefined;
  readonly fallback: ModelSelection;
}): ModelSelection {
  const activeProvider = input.composerDraft?.activeProvider;
  return activeProvider
    ? (input.composerDraft?.modelSelectionByProvider[activeProvider] ?? input.fallback)
    : input.fallback;
}

/** Builds the list shell for a pre-promotion draft. */
export function buildSidebarDraftShell(input: {
  readonly draft: DraftSessionState;
  readonly modelSelection: ModelSelection;
  readonly prompt?: string | null;
}): EnvironmentThreadShell {
  return {
    id: input.draft.threadId,
    environmentId: input.draft.environmentId,
    projectId: input.draft.projectId,
    title: sidebarDraftTitleFromPrompt(input.prompt),
    modelSelection: input.modelSelection,
    runtimeMode: input.draft.runtimeMode,
    interactionMode: input.draft.interactionMode,
    branch: input.draft.branch,
    worktreePath: input.draft.worktreePath,
    latestTurn: null,
    createdAt: input.draft.createdAt,
    updatedAt: input.draft.createdAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

/**
 * Unpromoted drafts that are not already represented by a server shell.
 *
 * A draft whose reserved thread id has entered the shell index is mid-promotion
 * (or leftover); painting both would duplicate the row. Promoted drafts are
 * dropped for the same reason.
 */
export function listSidebarDraftRows(input: {
  readonly draftsById: Readonly<Record<string, DraftSessionState>>;
  readonly modelSelectionForDraft: (draftId: DraftId, draft: DraftSessionState) => ModelSelection;
  readonly promptForDraft?: (
    draftId: DraftId,
    draft: DraftSessionState,
  ) => string | null | undefined;
  readonly hasServerShell: (threadRef: ScopedThreadRef) => boolean;
}): readonly SidebarV2DraftRow[] {
  const rows: SidebarV2DraftRow[] = [];
  for (const [draftIdValue, draft] of Object.entries(input.draftsById)) {
    if (draft.promotedTo != null) continue;
    const threadRef = scopeThreadRef(draft.environmentId, draft.threadId);
    if (input.hasServerShell(threadRef)) continue;
    const draftId = draftIdValue as DraftId;
    rows.push({
      draftId,
      shell: buildSidebarDraftShell({
        draft,
        modelSelection: input.modelSelectionForDraft(draftId, draft),
        prompt: input.promptForDraft?.(draftId, draft) ?? null,
      }),
    });
  }
  return rows;
}

export function draftIdByThreadKey(
  rows: readonly SidebarV2DraftRow[],
): ReadonlyMap<string, DraftId> {
  return new Map(
    rows.map((row) => [
      scopedThreadKey(scopeThreadRef(row.shell.environmentId, row.shell.id)),
      row.draftId,
    ]),
  );
}

/** Row-kind capabilities at the list boundary — one boolean, not four gates. */
export function sidebarDraftRowCapabilities(isDraft: boolean): {
  readonly canSettle: boolean;
  readonly canSnooze: boolean;
  readonly canRename: boolean;
  readonly showDiscard: boolean;
} {
  return {
    canSettle: !isDraft,
    canSnooze: !isDraft,
    canRename: !isDraft,
    showDiscard: isDraft,
  };
}

/** Bulk lifecycle actions operate on rendered server rows, never draft shells. */
export function sidebarServerActionThreadKeys(input: {
  readonly selectedThreadKeys: Iterable<string>;
  readonly hasRenderedRow: (threadKey: string) => boolean;
  readonly isDraft: (threadKey: string) => boolean;
}): readonly string[] {
  return [...input.selectedThreadKeys].filter(
    (threadKey) => input.hasRenderedRow(threadKey) && !input.isDraft(threadKey),
  );
}

/**
 * Next painted key after discarding the open draft: the row below, else the
 * row above. No wrap, no spawn — settle's last-card path creates a draft,
 * which is the opposite of what discard wants.
 */
export function pickDiscardNeighborKey(input: {
  readonly orderedKeys: readonly string[];
  readonly currentKey: string;
}): string | null {
  const currentIndex = input.orderedKeys.indexOf(input.currentKey);
  if (currentIndex === -1) return null;
  const below =
    input.orderedKeys.slice(currentIndex + 1).find((key) => key !== input.currentKey) ?? null;
  if (below) return below;
  if (currentIndex <= 0) return null;
  return (
    input.orderedKeys.slice(0, currentIndex).findLast((key) => key !== input.currentKey) ?? null
  );
}
