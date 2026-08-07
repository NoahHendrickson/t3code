import { create } from "zustand";

/**
 * Which preview tabs have shipped their drafts to the agent and not yet been resolved.
 *
 * Design-mode edits preview as inline styles and are never committed by the tool — the agent
 * edits the source instead. So the moment a turn carrying a change request finishes, the page
 * is showing the agent's real change WITH the drafts still painted on top of it, and the
 * inline styles win. The user cannot see whether the ask landed, and the footer keeps counting
 * changes that may already exist in the code. Nothing in the feature said so: the only way out
 * was remembering to press Discard.
 *
 * This is the bookkeeping behind saying so. It records nothing about WHETHER the edit landed —
 * the fork does not vendor the Forge's verifier (see engine/vendor/README.md), so any such
 * claim would be invented. It records only that the drafts were sent and that the turn they
 * rode has finished, which is exactly when "keep these, or drop them?" is a fair question.
 *
 * In-memory and per runtime tab id, like every other host-side design-mode store: the drafts
 * it describes live in the guest page, and both die with the tab.
 */
export interface SentPreviewRecord {
  /** The thread the request rode. Held so a record cannot be armed by another thread's work. */
  readonly threadKey: string;
  /** When the turn started, in ms. Only the arming fallback reads it. */
  readonly at: number;
  /**
   * Whether the send is old enough to ask about.
   *
   * Set when the panel observes the thread actually working after the send — or, when it never
   * does, by a fallback timer. Both paths exist because neither is sufficient: gating purely on
   * "the thread is idle" would flash the prompt in the window between the turn start resolving
   * and the session status arriving over the event stream, and gating purely on "we saw it run"
   * would never fire for a turn that began and ended while the preview panel was closed.
   */
  readonly armed: boolean;
}

/**
 * How long a send waits before it is treated as resolvable without ever having been seen to
 * run. Generous on purpose: a real in-flight turn reports itself running within a round trip,
 * so this only ever pays out for a turn nobody was watching. Its cost when wrong is a prompt
 * arriving a few seconds early, which the user can decline.
 */
export const SENT_PREVIEW_ARM_FALLBACK_MS = 10_000;

interface DesignSentPreviewsState {
  readonly byTabId: Record<string, SentPreviewRecord>;
  /** A turn carrying this tab's drafts started. Re-sending re-arms from scratch. */
  readonly markSent: (runtimeTabId: string, threadKey: string, at: number) => void;
  /** The send is now old enough to ask about — see SentPreviewRecord.armed. */
  readonly arm: (runtimeTabId: string, threadKey: string) => void;
  /** The question has been answered (either way), or the thing it asked about is gone. */
  readonly forget: (runtimeTabId: string) => void;
}

export const useDesignSentPreviews = create<DesignSentPreviewsState>()((set) => ({
  byTabId: {},
  markSent: (runtimeTabId, threadKey, at) =>
    set((state) => ({
      byTabId: { ...state.byTabId, [runtimeTabId]: { threadKey, at, armed: false } },
    })),
  arm: (runtimeTabId, threadKey) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId];
      // Thread-checked: the panel arms off whichever thread it is docked in, and a tab can be
      // looked at from a different thread than the one its request rode.
      if (!current || current.armed || current.threadKey !== threadKey) return state;
      return { byTabId: { ...state.byTabId, [runtimeTabId]: { ...current, armed: true } } };
    }),
  forget: (runtimeTabId) =>
    set((state) => {
      if (!(runtimeTabId in state.byTabId)) return state;
      const { [runtimeTabId]: _removed, ...rest } = state.byTabId;
      return { byTabId: rest };
    }),
}));

export function selectSentPreview(
  byTabId: Record<string, SentPreviewRecord>,
  runtimeTabId: string | null,
): SentPreviewRecord | null {
  return (runtimeTabId ? byTabId[runtimeTabId] : undefined) ?? null;
}

/**
 * Whether the panel should ask about this tab's previews right now.
 *
 * Pure, so the whole condition is one testable expression rather than a chain of `&&` spread
 * across a component. `working` covers both halves of an in-flight turn (starting and running):
 * an agent still working has not produced anything to resolve, so the question would be noise.
 */
export function shouldOfferPreviewResolution(input: {
  readonly record: SentPreviewRecord | null;
  readonly working: boolean;
  readonly draftCount: number;
}): boolean {
  const { record, working, draftCount } = input;
  // No drafts left means the question already answered itself — the user discarded or reverted
  // their way out of it, and a prompt about nothing is worse than no prompt.
  if (!record || !record.armed || working || draftCount === 0) return false;
  return true;
}
