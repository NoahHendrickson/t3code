import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";

import { useDesignSentPreviews } from "./designSentPreviews";
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
  /** The preview webview whose drafts built this request. `runtimeTabId`, NOT the server tab
   * id the panel also carries: server tab ids are unique only within one server process, so a
   * restart could collide two tabs onto one pill. Half of the replacement key — see `add`. */
  readonly runtimeTabId: string;
}

interface DesignChangeDraftStoreState {
  readonly byThreadKey: Record<string, readonly PendingDesignChange[]>;
  readonly add: (
    threadRef: ScopedThreadRef,
    runtimeTabId: string,
    payload: DesignChangeRequestPayload,
  ) => void;
  readonly remove: (threadRef: ScopedThreadRef, id: string) => void;
  /**
   * Drops exactly `sent` — matched by ENTRY IDENTITY, not by id — or every pending attachment
   * when `sent` is omitted.
   *
   * Identity rather than id because `add` deliberately reuses a superseded entry's id for the
   * same tab and document (the composer chip derives its React key and its fill from it, so a
   * re-send must update in place). That makes the id stable across replacement and therefore
   * useless as a freshness token: clearing by id after an awaited turn start would delete a
   * payload the panel produced DURING the round trip, which is the common re-send case and
   * exactly the loss this targeting exists to prevent (PR #74 review). `add` always builds a
   * fresh object, so reference identity is the thing that actually moves.
   */
  readonly clear: (threadRef: ScopedThreadRef, sent?: readonly PendingDesignChange[]) => void;
}

let nextId = 1;

export const useDesignChangeDraftStore = create<DesignChangeDraftStoreState>()((set) => ({
  byThreadKey: {},
  /**
   * Attaches one request, REPLACING the pending one for the same preview tab AND document.
   *
   * The guest builds every request from all of its live drafts (headlessMode's buildSend),
   * never from the selection, so a second Send built from the same draft set always
   * supersedes the first — either as a strict superset, or (after a Discard) as the
   * corrected set. Stacking them put two overlapping, sometimes contradicting asks in one
   * message.
   *
   * Drafts live exactly as long as their document, so "same draft set" is "same document" —
   * matched by EITHER half of the key. `documentId` is the live-document half: it is minted
   * per engine instance, which survives SPA pushState/hash churn just like the drafts do, so
   * a re-Send after a client-side route change still supersedes even though `location.href`
   * moved (PR #63 review). `pageUrl` is the reload half: a full reload mints a fresh
   * `documentId` but restores the same page's drafts from the guest's sessionStorage, so a
   * re-Send there supersedes by URL. A Send after a real cross-page navigation misses both
   * halves and APPENDS — its drafts were re-located against the new document and dropped
   * when they didn't resolve, so replacing would silently drop the previous page's asks: a
   * duplicate ask is recoverable and visible, lost work is neither.
   *
   * The tab half is the second reason to key on more than the thread: two preview tabs hold
   * independent draft sets and must each be able to contribute.
   *
   * Replacement REUSES the previous entry's id, so a re-send updates a chip in place rather
   * than remounting and recoloring it — ForkComposerDesignChanges derives both its React key
   * and its fill from the id on purpose.
   */
  add: (threadRef, runtimeTabId, payload) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      const pending = state.byThreadKey[key] ?? [];
      const supersedes = (candidate: PendingDesignChange): boolean =>
        candidate.runtimeTabId === runtimeTabId &&
        (candidate.documentId === payload.documentId || candidate.pageUrl === payload.pageUrl);
      const existing = pending.find(supersedes);
      const entry: PendingDesignChange = {
        ...payload,
        id: existing?.id ?? `design-change-${nextId++}`,
        runtimeTabId,
      };
      // Position is held too: an in-place update must not jump the chip to the end of the row.
      const next = existing
        ? pending.map((candidate) => (candidate.id === existing.id ? entry : candidate))
        : [...pending, entry];
      return { byThreadKey: { ...state.byThreadKey, [key]: next } };
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
  clear: (threadRef, sent) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      if (!(key in state.byThreadKey)) return state;
      if (sent === undefined) {
        const { [key]: _removed, ...rest } = state.byThreadKey;
        return { byThreadKey: rest };
      }
      // Targeted: a send clears exactly the entries it carried. A replacement minted during
      // the awaited turn start is a different object under the same id, so it survives.
      const dropped = new Set<PendingDesignChange>(sent);
      const pending = state.byThreadKey[key] ?? [];
      const next = pending.filter((entry) => !dropped.has(entry));
      if (next.length === pending.length) return state;
      const byThreadKey = { ...state.byThreadKey };
      if (next.length === 0) delete byThreadKey[key];
      else byThreadKey[key] = next;
      return { byThreadKey };
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
  /**
   * ONE read of the pending set, producing both halves of a send: the outgoing message text
   * with every request appended, and the entries that went into it — handed back verbatim so
   * the caller can clear exactly those once the turn start succeeds.
   *
   * One call rather than two because "what rode the message" is otherwise an invariant ChatView
   * has to hold by convention across an await, and the module's own rule is that each of these
   * helpers is a single call so the fences stay one line (Cursor review, PR #74). Reading the
   * store twice also left a window where the text and the clear list could disagree.
   *
   * Each request is wrapped in a `<design_change_request>` block, mirroring the
   * `<element_context>` idiom so a transcript renderer can extract it later. `text` comes back
   * untouched when nothing is pending.
   */
  takeForSend(
    threadRef: ScopedThreadRef,
    text: string,
  ): { readonly text: string; readonly sent: readonly PendingDesignChange[] } {
    const sent = selectPendingDesignChanges(
      useDesignChangeDraftStore.getState().byThreadKey,
      threadRef,
    );
    if (sent.length === 0) return { text, sent };
    const blocks = sent
      .map((entry) => `<design_change_request>\n${entry.markdown}\n</design_change_request>`)
      .join("\n\n");
    return { text: text.trim().length > 0 ? `${text}\n\n${blocks}` : blocks, sent };
  },
  clear(threadRef: ScopedThreadRef, sent?: readonly PendingDesignChange[]): void {
    useDesignChangeDraftStore.getState().clear(threadRef, sent);
  },
  /**
   * The send succeeded: remember which preview tabs contributed drafts to it, then drop the
   * pills. Ordering is the whole reason this is one call — the tabs are only readable from the
   * entries the clear is about to remove, and a caller that got that backwards would lose the
   * resolution prompt with nothing to show for it.
   *
   * The drafts themselves stay applied in the guest. They are the user's, and the tool never
   * commits them; what changes is that the panel now has grounds to ask about them
   * (designSentPreviews.ts).
   */
  markSent(
    threadRef: ScopedThreadRef,
    sent: readonly PendingDesignChange[],
    at: number = Date.now(),
  ): void {
    const threadKey = scopedThreadKey(threadRef);
    for (const runtimeTabId of new Set(sent.map((entry) => entry.runtimeTabId))) {
      useDesignSentPreviews.getState().markSent(runtimeTabId, threadKey, at);
    }
    useDesignChangeDraftStore.getState().clear(threadRef, sent);
  },
};
