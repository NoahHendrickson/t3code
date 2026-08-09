import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  selectVerifySummaryLineForMessage,
  shouldOfferPreviewResolution,
  useDesignSentPreviews,
  type SentPreviewLatestTurn,
  type SentPreviewRecord,
} from "./designSentPreviews";
import type { DesignVerifyReport } from "./protocol";

/**
 * The resolution prompt's own rules. Worth holding here rather than in a component test: every
 * way of getting this wrong is a way of destroying work the user did not ask to lose — a
 * discard offered while the agent is still running, or offered against another thread's turn,
 * clears drafts that were never resolved by anything. The invariant under test: NEVER offer
 * while the turn that carried the send is open, across every window where the session alone
 * cannot say so (queued adoption, a null session mid-turn, projection lag).
 */

const TAB = "tab-a";
const THREAD = "env-1:thread-1";
const OTHER_THREAD = "env-1:thread-2";

/** The send's client-minted message time — adoption stamps the turn's requestedAt with it. */
const SENT_AT = "2026-08-08T12:00:10.000Z";
const BEFORE_SEND = "2026-08-08T12:00:00.000Z";
const AFTER_SEND = "2026-08-08T12:00:30.000Z";

const MESSAGE_ID = "msg-1";

const record = (overrides: Partial<SentPreviewRecord> = {}): SentPreviewRecord => ({
  threadKey: THREAD,
  sentAt: SENT_AT,
  messageId: MESSAGE_ID,
  report: null,
  ...overrides,
});

const measuredReport = (applied: number, unchanged = 0): DesignVerifyReport => ({
  viewportChanged: false,
  truncated: false,
  elements: [
    {
      tag: "div",
      sourceLabel: null,
      missing: false,
      checks: [
        ...Array.from({ length: applied }, (_, index) => ({
          property: `padding-${index}`,
          expected: "32px",
          verdict: "applied" as const,
          actual: "32px",
        })),
        ...Array.from({ length: unchanged }, (_, index) => ({
          property: `margin-${index}`,
          expected: "8px",
          verdict: "unchanged" as const,
          actual: "4px",
        })),
      ],
      structuralOps: 0,
    },
  ],
});

const turnId = (value: string) => value as SentPreviewLatestTurn["turnId"];

const turn = (overrides: Partial<SentPreviewLatestTurn> = {}): SentPreviewLatestTurn => ({
  turnId: turnId("turn-1"),
  requestedAt: SENT_AT,
  startedAt: SENT_AT,
  completedAt: AFTER_SEND,
  ...overrides,
});

const offer = (input: {
  record?: SentPreviewRecord | null;
  threadKey?: string;
  latestTurn?: SentPreviewLatestTurn | null;
  session?: { status: string; activeTurnId: string | null } | null;
  draftCount?: number;
}) =>
  shouldOfferPreviewResolution({
    record: input.record === undefined ? record() : input.record,
    threadKey: input.threadKey ?? THREAD,
    latestTurn: input.latestTurn === undefined ? turn() : input.latestTurn,
    session: (input.session === undefined ? null : input.session) as Parameters<
      typeof shouldOfferPreviewResolution
    >[0]["session"],
    draftCount: input.draftCount ?? 2,
  });

describe("designSentPreviews store", () => {
  beforeEach(() => {
    useDesignSentPreviews.setState({ byTabId: {} });
  });

  it("records a send with the thread, message time and message id it rode", () => {
    useDesignSentPreviews.getState().markSent(TAB, THREAD, SENT_AT, MESSAGE_ID);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      sentAt: SENT_AT,
      messageId: MESSAGE_ID,
      report: null,
    });
  });

  it("re-sending replaces the record, measurement included", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, SENT_AT, MESSAGE_ID);
    store.setReport(TAB, measuredReport(1));
    store.markSent(TAB, THREAD, AFTER_SEND, "msg-2");
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      sentAt: AFTER_SEND,
      messageId: "msg-2",
      report: null,
    });
  });

  it("a report for a forgotten (or never-sent) tab is stale evidence, dropped", () => {
    const store = useDesignSentPreviews.getState();
    const before = useDesignSentPreviews.getState().byTabId;
    store.setReport(TAB, measuredReport(1));
    expect(useDesignSentPreviews.getState().byTabId).toBe(before);
    store.markSent(TAB, THREAD, SENT_AT, MESSAGE_ID);
    store.forget(TAB);
    const after = useDesignSentPreviews.getState().byTabId;
    store.setReport(TAB, measuredReport(1));
    expect(useDesignSentPreviews.getState().byTabId).toBe(after);
  });

  it("forgetReport retires the measurement but keeps the open question", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, SENT_AT, MESSAGE_ID);
    store.setReport(TAB, measuredReport(2));
    store.forgetReport(TAB);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      sentAt: SENT_AT,
      messageId: MESSAGE_ID,
      report: null,
    });
    // Idempotent and identity-stable when there is nothing to retire.
    const before = useDesignSentPreviews.getState().byTabId;
    store.forgetReport(TAB);
    expect(useDesignSentPreviews.getState().byTabId).toBe(before);
  });

  it("forgets a tab, and forgetting an unknown one keeps the state identical", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, SENT_AT, MESSAGE_ID);
    store.forget(TAB);
    expect(useDesignSentPreviews.getState().byTabId).toEqual({});
    const before = useDesignSentPreviews.getState().byTabId;
    store.forget("never-seen");
    expect(useDesignSentPreviews.getState().byTabId).toBe(before);
  });

  it("merges every contributing tab's verdicts under one message id — and only that id", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent("tab-a", THREAD, SENT_AT, MESSAGE_ID);
    store.markSent("tab-b", THREAD, SENT_AT, MESSAGE_ID);
    store.markSent("tab-c", THREAD, SENT_AT, "msg-other");
    store.setReport("tab-a", measuredReport(2));
    store.setReport("tab-b", measuredReport(1, 1));
    store.setReport("tab-c", measuredReport(5));
    const state = useDesignSentPreviews.getState().byTabId;
    expect(selectVerifySummaryLineForMessage(state, MESSAGE_ID)).toBe("3 landed · 1 didn't land");
    // A record still measuring (no report) contributes nothing rather than hiding the rest.
    store.forgetReport("tab-b");
    expect(
      selectVerifySummaryLineForMessage(useDesignSentPreviews.getState().byTabId, MESSAGE_ID),
    ).toBe("2 landed");
    expect(selectVerifySummaryLineForMessage(state, "msg-none")).toBeNull();
  });
});

describe("shouldOfferPreviewResolution", () => {
  it("offers once the send's turn has settled and drafts remain", () => {
    expect(offer({})).toBe(true);
  });

  it("stays quiet while the projection still shows a turn from before the send", () => {
    // The flash window: right after markSent, latestTurn is still the PREVIOUS (settled)
    // turn. Offering here would drop previews the agent has not even seen yet.
    expect(
      offer({ latestTurn: turn({ requestedAt: BEFORE_SEND, completedAt: BEFORE_SEND }) }),
    ).toBe(false);
  });

  it("stays quiet while no turn has projected at all", () => {
    expect(offer({ latestTurn: null })).toBe(false);
  });

  it("stays quiet while the turn is open, even with a null session", () => {
    // The adoption window: turn.start emits its events and the session arrives minutes later
    // (worktree checkout + cold provider boot). A wall-clock fallback armed here — that is
    // the destructive-prompt-under-a-running-turn bug this predicate exists to prevent.
    expect(offer({ latestTurn: turn({ completedAt: null }), session: null })).toBe(false);
  });

  it("stays quiet while a session reports the turn running", () => {
    expect(offer({ session: { status: "running", activeTurnId: "turn-1" } })).toBe(false);
  });

  it("offers when a LATER turn than the send has settled", () => {
    // A follow-up message's turn finishing equally means the page underneath may have
    // changed; the ignored prompt must come back, not vanish forever.
    expect(
      offer({
        latestTurn: turn({
          turnId: turnId("turn-2"),
          requestedAt: AFTER_SEND,
          completedAt: AFTER_SEND,
        }),
      }),
    ).toBe(true);
  });

  it("stays quiet for another thread's panel", () => {
    // The same preview tab can be looked at from a thread that sent nothing; its turns must
    // not answer for this record.
    expect(offer({ threadKey: OTHER_THREAD })).toBe(false);
  });

  it("stays quiet when nothing was sent from this tab", () => {
    expect(offer({ record: null })).toBe(false);
  });

  it("stays quiet when the drafts are already gone, but the record survives a zero", () => {
    // Undo to zero is a peek, not an answer: the prompt hides while nothing is painted and
    // returns with the redo. Only the footer's buttons and tab teardown forget the record.
    expect(offer({ draftCount: 0 })).toBe(false);
    expect(offer({ draftCount: 1 })).toBe(true);
  });
});
