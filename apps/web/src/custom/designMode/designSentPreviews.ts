import { create } from "zustand";

import { isLatestTurnSettled } from "~/session-logic";

import type { DesignVerifyReport } from "./protocol";

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
 * claim would be invented. It records only that drafts were sent; whether the turn they rode
 * has finished is not guessed at from wall clock or observed status flips but read off the
 * thread's own projected turn (see shouldOfferPreviewResolution).
 *
 * In-memory and per runtime tab id, like every other host-side design-mode store: the drafts
 * it describes live in the guest page, and both die with the tab. The record dies only on an
 * explicit answer (the footer's two buttons, the panel's own Discard) or tab teardown — never
 * on a draft count that happened to touch zero, so an undo/redo peek cannot permanently eat
 * the prompt.
 */
export interface SentPreviewRecord {
  /** The thread the request rode. Held so a record cannot be resolved by another thread's
   * work. */
  readonly threadKey: string;
  /**
   * The sent message's own `createdAt` — the client-minted timestamp ChatView put on the
   * turn-start command. The server stamps the adopted turn's `requestedAt` from exactly this
   * message time (the decider's adoption contract), which is what lets
   * shouldOfferPreviewResolution compare the two without ever crossing clocks.
   */
  readonly sentAt: string;
  /**
   * The latest measured verdict report from the guest (designVerify — armed once the turn
   * settles, re-measured per page settle). Null until the first measurement arrives; a
   * pre-verification engine never delivers one and the prompt keeps its unmeasured copy.
   */
  readonly report: DesignVerifyReport | null;
}

interface DesignSentPreviewsState {
  readonly byTabId: Record<string, SentPreviewRecord>;
  /** A turn carrying this tab's drafts started. Re-sending replaces the record. */
  readonly markSent: (runtimeTabId: string, threadKey: string, sentAt: string) => void;
  /** A verdict report arrived from this tab's guest. Meaningful only while a record
   * exists — a report for a forgotten (or never-sent) tab is stale evidence, dropped. */
  readonly setReport: (runtimeTabId: string, report: DesignVerifyReport) => void;
  /** The question has been answered (either way), or the thing it asked about is gone. */
  readonly forget: (runtimeTabId: string) => void;
}

export const useDesignSentPreviews = create<DesignSentPreviewsState>()((set) => ({
  byTabId: {},
  markSent: (runtimeTabId, threadKey, sentAt) =>
    set((state) => ({
      byTabId: { ...state.byTabId, [runtimeTabId]: { threadKey, sentAt, report: null } },
    })),
  setReport: (runtimeTabId, report) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId];
      if (!current) return state;
      return { byTabId: { ...state.byTabId, [runtimeTabId]: { ...current, report } } };
    }),
  forget: (runtimeTabId) =>
    set((state) => {
      if (!(runtimeTabId in state.byTabId)) return state;
      const { [runtimeTabId]: _removed, ...rest } = state.byTabId;
      return { byTabId: rest };
    }),
}));

/**
 * The one vocabulary for verdicts, shared by the panel rows, the summary line and the
 * transcript chip — and pinned by a fork guard: `unverifiable` must never borrow the
 * success words, because "can't be checked" rendered as anything stronger is exactly the
 * invented claim this feature exists to avoid. "landed" (not "applied"/"verified") keeps
 * even the success wording at measurement strength: the page renders the value; whether
 * the agent's edit was any good is the turn diff's question.
 */
export const VERIFY_VERDICT_LABELS = {
  applied: "landed",
  unchanged: "didn't land",
  diverged: "changed differently",
  unverifiable: "can't be checked",
} as const;

/** The counts line ("2 landed · 1 didn't land"), zero counts skipped. Pure for testing;
 * empty string when there is nothing to say. */
export function verifySummaryLine(summary: {
  readonly applied: number;
  readonly unchanged: number;
  readonly diverged: number;
  readonly unverifiable: number;
  readonly missing: number;
}): string {
  const parts: string[] = [];
  if (summary.applied > 0) parts.push(`${summary.applied} ${VERIFY_VERDICT_LABELS.applied}`);
  if (summary.unchanged > 0) parts.push(`${summary.unchanged} ${VERIFY_VERDICT_LABELS.unchanged}`);
  if (summary.diverged > 0) parts.push(`${summary.diverged} ${VERIFY_VERDICT_LABELS.diverged}`);
  if (summary.unverifiable > 0)
    parts.push(`${summary.unverifiable} ${VERIFY_VERDICT_LABELS.unverifiable}`);
  if (summary.missing > 0) parts.push(`${summary.missing} gone from the page`);
  return parts.join(" · ");
}

export function selectSentPreview(
  byTabId: Record<string, SentPreviewRecord>,
  runtimeTabId: string | null,
): SentPreviewRecord | null {
  return (runtimeTabId ? byTabId[runtimeTabId] : undefined) ?? null;
}

/** The session slice the readiness question consults — isLatestTurnSettled's own, so the two
 * can never drift apart. */
export type SentPreviewSession = Parameters<typeof isLatestTurnSettled>[1];

/** The projected-turn slice the readiness question consults: isLatestTurnSettled's own plus
 * `requestedAt`, the correlation to the send. */
export type SentPreviewLatestTurn = NonNullable<Parameters<typeof isLatestTurnSettled>[0]> & {
  readonly requestedAt: string;
};

/**
 * Whether the panel should ask about this tab's previews right now.
 *
 * Pure, so the whole condition is one testable expression rather than a chain of `&&` spread
 * across a component. The invariant it owes: NEVER offer to drop previews while the turn that
 * carried them is open — including the windows where the session alone cannot say so (a null
 * session during a live turn is by design: the decider adopts the turn up to minutes after
 * `thread.turn.start`, and a worktree checkout plus a cold provider boot routinely spend >10s
 * there).
 *
 * So readiness is read off the thread's own projection instead of guessed at:
 *
 * - `latestTurn.requestedAt < record.sentAt` — the projection still shows a turn from BEFORE
 *   this send (the send's own turn hasn't projected yet, or is still queued for adoption).
 *   Quiet. The two timestamps share one origin — adoption stamps `requestedAt` from the sent
 *   message's client-minted time — so the comparison never mixes clocks.
 * - `requestedAt >= sentAt` — the projection covers this send: its own turn, or any later one,
 *   whose completion equally means the page underneath may have changed. Now
 *   `isLatestTurnSettled` — the app's one shared answer to "is the turn actually over", the
 *   same predicate the sidebar trusts — decides. It stays false while `completedAt` is unset
 *   and while a session reports running, so both the adoption window and a live turn keep the
 *   prompt away without any timer.
 * - A turn that began AND ended while the panel was unmounted needs no special case: on
 *   remount the projection already satisfies both checks and the prompt appears at once.
 *
 * No drafts left means the question already answered itself — the user discarded or reverted
 * their way out of it, and a prompt about nothing is worse than no prompt. (The record
 * survives that state on purpose: a redo that repaints the drafts gets its prompt back.)
 */
export function shouldOfferPreviewResolution(input: {
  readonly record: SentPreviewRecord | null;
  readonly threadKey: string;
  readonly latestTurn: SentPreviewLatestTurn | null;
  readonly session: SentPreviewSession;
  readonly draftCount: number;
}): boolean {
  const { record, threadKey, latestTurn, session, draftCount } = input;
  if (!record || record.threadKey !== threadKey || draftCount === 0) return false;
  if (!latestTurn || Date.parse(latestTurn.requestedAt) < Date.parse(record.sentAt)) return false;
  return isLatestTurnSettled(latestTurn, session);
}
