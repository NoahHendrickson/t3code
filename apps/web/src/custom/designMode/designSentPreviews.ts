import { create } from "zustand";

import { isLatestTurnSettled } from "~/session-logic";

import {
  summarizeVerifyReport,
  type DesignVerifyReport,
  type DesignVerifySummary,
} from "./protocol";

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
 * This is the bookkeeping behind saying so. Whether the edit landed is never asserted from
 * here — that claim exists only as a MEASUREMENT (`report`, produced by the guest's
 * engine/verifySession.ts with the previews suppressed), and the wording it may use lives in
 * VERIFY_VERDICT_LABELS below. Whether the turn a send rode has finished is not guessed at
 * from wall clock or observed status flips but read off the thread's own projected turn
 * (see shouldOfferPreviewResolution).
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
  /** The sent message's id — the transcript chip's correlation key. Unlike `sentAt` (which
   * every tab contributing to one message shares, and which is only ms-unique), a message
   * id names exactly one message, so the chip can merge every contributing tab's verdicts
   * under the right row and never another thread's. */
  readonly messageId: string;
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
  readonly markSent: (
    runtimeTabId: string,
    threadKey: string,
    sentAt: string,
    messageId: string,
  ) => void;
  /** A verdict report arrived from this tab's guest. Meaningful only while a record
   * exists — a report for a forgotten (or never-sent) tab is stale evidence, dropped. */
  readonly setReport: (runtimeTabId: string, report: DesignVerifyReport) => void;
  /** Design mode toggled off for this tab: the guest stops measuring, so the last report
   * stops being current. The record survives (the sent question is still open and the
   * prompt re-offers on re-enable); only the measurement is retired, which also takes the
   * transcript chip's verdict line down rather than leaving it asserting a stale reading
   * about a page rebuilt since. */
  readonly forgetReport: (runtimeTabId: string) => void;
  /** The question has been answered (either way), or the thing it asked about is gone. */
  readonly forget: (runtimeTabId: string) => void;
}

export const useDesignSentPreviews = create<DesignSentPreviewsState>()((set) => ({
  byTabId: {},
  markSent: (runtimeTabId, threadKey, sentAt, messageId) =>
    set((state) => ({
      byTabId: {
        ...state.byTabId,
        [runtimeTabId]: { threadKey, sentAt, messageId, report: null },
      },
    })),
  setReport: (runtimeTabId, report) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId];
      if (!current) return state;
      return { byTabId: { ...state.byTabId, [runtimeTabId]: { ...current, report } } };
    }),
  forgetReport: (runtimeTabId) =>
    set((state) => {
      const current = state.byTabId[runtimeTabId];
      if (!current || current.report === null) return state;
      return { byTabId: { ...state.byTabId, [runtimeTabId]: { ...current, report: null } } };
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
  missing: "gone from the page",
} as const;

/** Why a check couldn't be judged, in the same one-home vocabulary. */
export const VERIFY_REASON_LABELS = {
  intent: "an intent-shaped ask",
  viewport: "the viewport changed since the send",
  inline: "the page styles this inline",
} as const;

/** The counts line ("2 landed · 1 didn't land"), zero counts skipped. Iterates the label
 * map so a new verdict is a one-line change, and takes the exported summary type so a
 * stale structural copy can never drift silently. Empty string when there is nothing to
 * say — callers render their fallback copy instead of an empty element. */
export function verifySummaryLine(summary: DesignVerifySummary): string {
  return (Object.keys(VERIFY_VERDICT_LABELS) as Array<keyof typeof VERIFY_VERDICT_LABELS>)
    .filter((verdict) => summary[verdict] > 0)
    .map((verdict) => `${summary[verdict]} ${VERIFY_VERDICT_LABELS[verdict]}`)
    .join(" · ");
}

/**
 * The transcript chip's verdict line for one sent MESSAGE: every live record minted by
 * that message's send (one per contributing preview tab), their measured summaries merged.
 * Keyed by message id — the one stable identity a message row owns — never by timestamp,
 * which every contributing tab shares and another thread could collide with. Returns null
 * (not "") when nothing is measured, so the chip renders nothing rather than an empty
 * span; a string return keeps the zustand selector Object.is-stable.
 */
export function selectVerifySummaryLineForMessage(
  byTabId: Record<string, SentPreviewRecord>,
  messageId: string,
): string | null {
  let merged: DesignVerifySummary | null = null;
  for (const record of Object.values(byTabId)) {
    if (record.messageId !== messageId || record.report === null) continue;
    if (record.report.elements.length === 0) continue;
    const summary = summarizeVerifyReport(record.report);
    merged = merged
      ? {
          applied: merged.applied + summary.applied,
          unchanged: merged.unchanged + summary.unchanged,
          diverged: merged.diverged + summary.diverged,
          unverifiable: merged.unverifiable + summary.unverifiable,
          missing: merged.missing + summary.missing,
        }
      : summary;
  }
  if (!merged) return null;
  const line = verifySummaryLine(merged);
  return line === "" ? null : line;
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
