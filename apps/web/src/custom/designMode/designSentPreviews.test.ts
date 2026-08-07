import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  shouldOfferPreviewResolution,
  useDesignSentPreviews,
  type SentPreviewRecord,
} from "./designSentPreviews";

/**
 * The resolution prompt's own rules. Worth holding here rather than in a component test: every
 * way of getting this wrong is a way of destroying work the user did not ask to lose — a
 * "Drop previews" button offered while the agent is still running, or offered against another
 * thread's turn, discards drafts that were never resolved by anything.
 */

const TAB = "tab-a";
const THREAD = "env-1:thread-1";
const OTHER_THREAD = "env-1:thread-2";

const record = (overrides: Partial<SentPreviewRecord> = {}): SentPreviewRecord => ({
  threadKey: THREAD,
  at: 1_000,
  armed: true,
  ...overrides,
});

describe("designSentPreviews store", () => {
  beforeEach(() => {
    useDesignSentPreviews.setState({ byTabId: {} });
  });

  it("records a send unarmed — the turn has not been seen to run yet", () => {
    useDesignSentPreviews.getState().markSent(TAB, THREAD, 1_000);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      at: 1_000,
      armed: false,
    });
  });

  it("arms only from the thread the request rode", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, 1_000);
    // The same preview tab can be looked at from a thread that sent nothing; its work must
    // not answer for this record.
    store.arm(TAB, OTHER_THREAD);
    expect(useDesignSentPreviews.getState().byTabId[TAB]?.armed).toBe(false);
    store.arm(TAB, THREAD);
    expect(useDesignSentPreviews.getState().byTabId[TAB]?.armed).toBe(true);
  });

  it("arming an unknown tab is inert", () => {
    useDesignSentPreviews.getState().arm(TAB, THREAD);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toBeUndefined();
  });

  it("re-sending re-arms from scratch", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, 1_000);
    store.arm(TAB, THREAD);
    store.markSent(TAB, THREAD, 2_000);
    expect(useDesignSentPreviews.getState().byTabId[TAB]).toEqual({
      threadKey: THREAD,
      at: 2_000,
      armed: false,
    });
  });

  it("forgets a tab, and forgetting an unknown one keeps the state identical", () => {
    const store = useDesignSentPreviews.getState();
    store.markSent(TAB, THREAD, 1_000);
    store.forget(TAB);
    expect(useDesignSentPreviews.getState().byTabId).toEqual({});
    const before = useDesignSentPreviews.getState().byTabId;
    store.forget("never-seen");
    expect(useDesignSentPreviews.getState().byTabId).toBe(before);
  });
});

describe("shouldOfferPreviewResolution", () => {
  it("offers once an armed send's turn is over and drafts remain", () => {
    expect(shouldOfferPreviewResolution({ record: record(), working: false, draftCount: 2 })).toBe(
      true,
    );
  });

  it("stays quiet while the agent is still working", () => {
    // Both halves of an in-flight turn: there is nothing to resolve until it finishes.
    expect(shouldOfferPreviewResolution({ record: record(), working: true, draftCount: 2 })).toBe(
      false,
    );
  });

  it("stays quiet until the send is armed", () => {
    // The window between the turn start resolving and the session reporting itself running —
    // offering here would let a user drop previews the agent has not even seen yet.
    expect(
      shouldOfferPreviewResolution({
        record: record({ armed: false }),
        working: false,
        draftCount: 2,
      }),
    ).toBe(false);
  });

  it("stays quiet when nothing was sent from this tab", () => {
    expect(shouldOfferPreviewResolution({ record: null, working: false, draftCount: 2 })).toBe(
      false,
    );
  });

  it("stays quiet when the drafts are already gone", () => {
    expect(shouldOfferPreviewResolution({ record: record(), working: false, draftCount: 0 })).toBe(
      false,
    );
  });
});
