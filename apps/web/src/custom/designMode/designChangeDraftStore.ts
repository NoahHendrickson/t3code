import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";

import type { DesignChangeRequestPayload } from "./protocol";

/**
 * Pending design-change attachments, keyed by thread. A "Send to chat" from the design
 * panel lands here instead of in the composer's prompt text: the composer renders each
 * entry as an inline attachment pill (ForkComposerDesignChanges), and ChatView's fenced
 * send path appends the full change-request markdown to the outgoing message — so the
 * agent gets the complete deterministic request while the composer stays readable.
 *
 * Deliberately in-memory (no persistence): the source of truth for un-sent edits is the
 * guest page's draft previews, which survive reloads on their own — hitting Send in the
 * panel again re-creates the attachment from those drafts.
 */
export interface PendingDesignChange extends DesignChangeRequestPayload {
  readonly id: string;
}

interface DesignChangeDraftStoreState {
  readonly byThreadKey: Record<string, readonly PendingDesignChange[]>;
  readonly add: (threadRef: ScopedThreadRef, payload: DesignChangeRequestPayload) => void;
  readonly remove: (threadRef: ScopedThreadRef, id: string) => void;
  readonly clear: (threadRef: ScopedThreadRef) => void;
}

let nextId = 1;

export const useDesignChangeDraftStore = create<DesignChangeDraftStoreState>()((set) => ({
  byThreadKey: {},
  add: (threadRef, payload) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      const pending = state.byThreadKey[key] ?? [];
      const entry: PendingDesignChange = { ...payload, id: `design-change-${nextId++}` };
      return { byThreadKey: { ...state.byThreadKey, [key]: [...pending, entry] } };
    }),
  remove: (threadRef, id) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      const pending = state.byThreadKey[key] ?? [];
      const next = pending.filter((entry) => entry.id !== id);
      if (next.length === pending.length) return state;
      const byThreadKey = { ...state.byThreadKey };
      if (next.length === 0) delete byThreadKey[key];
      else byThreadKey[key] = next;
      return { byThreadKey };
    }),
  clear: (threadRef) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      if (!(key in state.byThreadKey)) return state;
      const { [key]: _removed, ...rest } = state.byThreadKey;
      return { byThreadKey: rest };
    }),
}));

const EMPTY_PENDING: readonly PendingDesignChange[] = [];

export function selectPendingDesignChanges(
  byThreadKey: Record<string, readonly PendingDesignChange[]>,
  threadRef: ScopedThreadRef | null,
): readonly PendingDesignChange[] {
  // Stable empty result so zustand selectors don't re-render on unrelated store writes.
  return (threadRef ? byThreadKey[scopedThreadKey(threadRef)] : undefined) ?? EMPTY_PENDING;
}

/** Resolves the composer's draft target (a DraftId for unstarted threads) to the
 * ScopedThreadRef the design panel keyed its attachments under. Reactive: an unstarted
 * draft gaining its session mapping re-resolves live. */
export function useDesignChangeTargetRef(
  target: ScopedThreadRef | DraftId,
): ScopedThreadRef | null {
  const draftSession = useComposerDraftStore((store) =>
    typeof target === "string" ? (store.draftThreadsByThreadKey[target] ?? null) : null,
  );
  if (typeof target !== "string") return target;
  return draftSession
    ? { environmentId: draftSession.environmentId, threadId: draftSession.threadId }
    : null;
}

/** Reactive pending-attachment list for the composer's chip row. */
export function useForkPendingDesignChanges(
  target: ScopedThreadRef | DraftId,
): readonly PendingDesignChange[] {
  const threadRef = useDesignChangeTargetRef(target);
  return useDesignChangeDraftStore((store) =>
    selectPendingDesignChanges(store.byThreadKey, threadRef),
  );
}

/** Reactive pending-attachment count — drives the send button's enabled state through
 * ChatComposer's fenced sendability memo, so a pill-only message is sendable. */
export function useForkPendingDesignChangeCount(target: ScopedThreadRef | DraftId): number {
  return useForkPendingDesignChanges(target).length;
}

/**
 * Non-reactive helpers for ChatView's fenced send path — each is a single call so the
 * fences stay one line. See `.fork/customizations.yaml#fork-design-mode`.
 */
export const forkDesignChanges = {
  count(threadRef: ScopedThreadRef): number {
    return selectPendingDesignChanges(useDesignChangeDraftStore.getState().byThreadKey, threadRef)
      .length;
  },
  /** Appends every pending change request to the outgoing message text, each wrapped in a
   * `<design_change_request>` block (mirrors the `<element_context>` idiom so a transcript
   * renderer can extract it later). Returns `text` untouched when nothing is pending. */
  appendToPrompt(threadRef: ScopedThreadRef, text: string): string {
    const pending = selectPendingDesignChanges(
      useDesignChangeDraftStore.getState().byThreadKey,
      threadRef,
    );
    if (pending.length === 0) return text;
    const blocks = pending
      .map((entry) => `<design_change_request>\n${entry.markdown}\n</design_change_request>`)
      .join("\n\n");
    return text.trim().length > 0 ? `${text}\n\n${blocks}` : blocks;
  },
  clear(threadRef: ScopedThreadRef): void {
    useDesignChangeDraftStore.getState().clear(threadRef);
  },
};
