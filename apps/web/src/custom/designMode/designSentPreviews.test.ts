import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  shouldOfferPreviewResolution,
  useDesignSentPreviews,
  type SentPreviewLatestTurn,
  type SentPreviewRecord,
} from "./designSentPreviews";

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

const record = (overrides: Partial<SentPreviewRecord> = {}): SentPreviewRecord => ({
  threadKey: THREAD,
  sentAt: SENT_AT,
  ...overrides,
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

  it("records a send with the thread and message time it rode", () => {
    useDesignSentPreviews.getState().markSent(TAB, THREAD, SENT_AT);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      sentAt: SENT_AT,
    });
  });

  it("re-sending replaces the record", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, SENT_AT);
    store.markSent(TAB, THREAD, AFTER_SEND);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      sentAt: AFTER_SEND,
    });
  });

  it("forgets a tab, and forgetting an unknown one keeps the state identical", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, SENT_AT);
    store.forget(TAB);
    expect(useDesignSentPreviews.getState().byTabId).toEqual({});
    const before = useDesignSentPreviews.getState().byTabId;
    store.forget("never-seen");
    expect(useDesignSentPreviews.getState().byTabId).toBe(before);
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
