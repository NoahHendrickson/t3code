import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { extractTrailingDesignChanges } from "./designChangeTranscript";
import { forkDesignChanges, useDesignChangeDraftStore } from "./designChangeDraftStore";
import { useDesignSentPreviews } from "./designSentPreviews";
import type { DesignChangeRequestPayload } from "./protocol";

/**
 * The pending-attachment reducer's own rules, which nothing else can hold: the manifest
 * intent is prose, and forkDesignMode.test.ts only greps for the delivery fences — a merge
 * could restore plain appending with every guard still green (PR #63 review).
 *
 * Plain zustand, no DOM.
 */
const THREAD = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"));
const OTHER_THREAD = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-2"));

/** The sent message's client-minted createdAt, as ChatView passes it. */
const SENT_AT = "2026-08-08T12:00:10.000Z";

const payload = (
  overrides: Partial<DesignChangeRequestPayload> = {},
): DesignChangeRequestPayload => ({
  markdown: "# Design change request",
  elementCount: 1,
  elements: [{ tag: "div", sourceLabel: "App.tsx:12", deltas: ["padding-top 24px → 32px"] }],
  documentId: "doc-1",
  pageUrl: "http://localhost:5173/",
  ...overrides,
});

const pendingFor = (threadRef: ScopedThreadRef) => {
  // Through the store's own key helper — a test that rebuilt the key format by hand would
  // keep passing if the two ever disagreed.
  const { byThreadKey } = useDesignChangeDraftStore.getState();
  return byThreadKey[scopedThreadKey(threadRef)] ?? [];
};

describe("designChangeDraftStore", () => {
  beforeEach(() => {
    useDesignChangeDraftStore.setState({ byThreadKey: {} });
    useDesignSentPreviews.setState({ byTabId: {} });
  });

  it("replaces the pending attachment when the same tab re-sends the same page", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "first" }));
    add(THREAD, "tab-a", payload({ markdown: "second" }));

    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("second");
  });

  it("reuses the entry id on replacement so the composer chip updates in place", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "first" }));
    const firstId = pendingFor(THREAD)[0]?.id;
    add(THREAD, "tab-a", payload({ markdown: "second" }));

    // ForkComposerDesignChanges derives its React key AND its chip fill from this id — a
    // fresh one per Send would remount and recolor the chip on every re-send.
    expect(pendingFor(THREAD)[0]?.id).toBe(firstId);
  });

  it("keeps both pages when the preview truly navigates between sends", () => {
    const { add } = useDesignChangeDraftStore.getState();
    // A real navigation wipes the guest and mints a new engine: BOTH halves of the key move.
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "home", documentId: "doc-1", pageUrl: "http://localhost:5173/" }),
    );
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "settings", documentId: "doc-2", pageUrl: "http://localhost:5173/s" }),
    );

    // Drafts are re-located per document, so the second request describes ONLY the new page:
    // replacing on tab alone would silently drop the first page's asks.
    expect(pendingFor(THREAD).map((entry) => entry.markdown)).toEqual(["home", "settings"]);
  });

  it("replaces when an SPA route change moves the href under the same document", () => {
    const { add } = useDesignChangeDraftStore.getState();
    // pushState churn: same engine, same live draft set, different location.href. The second
    // Send is built from the same drafts as the first — stacking them would put two
    // overlapping asks in one message, the exact defect supersession exists to prevent.
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "first", documentId: "doc-1", pageUrl: "http://localhost:5173/a" }),
    );
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "second", documentId: "doc-1", pageUrl: "http://localhost:5173/b" }),
    );

    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("second");
  });

  it("replaces when the same page reloads between sends", () => {
    const { add } = useDesignChangeDraftStore.getState();
    // A reload mints a fresh engine (new documentId) but restores the same page's drafts
    // from the guest's sessionStorage — the pageUrl half of the key covers it.
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "first", documentId: "doc-1", pageUrl: "http://localhost:5173/" }),
    );
    add(
      THREAD,
      "tab-a",
      payload({ markdown: "second", documentId: "doc-2", pageUrl: "http://localhost:5173/" }),
    );

    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("second");
  });

  it("holds a replaced chip's position in the row", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "first" }));
    add(THREAD, "tab-b", payload({ markdown: "second" }));
    add(THREAD, "tab-a", payload({ markdown: "first-again" }));

    expect(pendingFor(THREAD).map((entry) => entry.markdown)).toEqual(["first-again", "second"]);
  });

  it("keeps one pill per preview tab", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "from a" }));
    add(THREAD, "tab-b", payload({ markdown: "from b" }));

    expect(pendingFor(THREAD)).toHaveLength(2);
  });

  it("re-adds after a removal instead of resurrecting the old entry", () => {
    const store = useDesignChangeDraftStore.getState();
    store.add(THREAD, "tab-a", payload({ markdown: "first" }));
    store.remove(THREAD, pendingFor(THREAD)[0]!.id);
    expect(pendingFor(THREAD)).toHaveLength(0);

    store.add(THREAD, "tab-a", payload({ markdown: "second" }));
    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("second");
  });

  it("scopes attachments to their own thread", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "mine" }));
    add(OTHER_THREAD, "tab-a", payload({ markdown: "theirs" }));

    expect(pendingFor(THREAD)).toHaveLength(1);
    expect(pendingFor(OTHER_THREAD)).toHaveLength(1);
    useDesignChangeDraftStore.getState().clear(THREAD);
    expect(pendingFor(THREAD)).toHaveLength(0);
    expect(pendingFor(OTHER_THREAD)).toHaveLength(1);
  });

  it("takeForSend returns the text and the entries in one read", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "# one" }));
    add(THREAD, "tab-b", payload({ markdown: "# two" }));

    const taken = forkDesignChanges.takeForSend(THREAD, "make it pop");
    expect(taken.sent).toHaveLength(2);
    expect(extractTrailingDesignChanges(taken.text).blocks).toEqual(["# one", "# two"]);
    // Reading is not taking — the pills survive until the turn start succeeds.
    expect(pendingFor(THREAD)).toHaveLength(2);
  });

  it("leaves the text untouched when nothing is pending", () => {
    const taken = forkDesignChanges.takeForSend(THREAD, "just a message");
    expect(taken.text).toBe("just a message");
    expect(taken.sent).toHaveLength(0);
  });

  it("clears only what the send carried, so a Send from another tab mid-flight survives", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "rode along" }));
    const taken = forkDesignChanges.takeForSend(THREAD, "");

    add(THREAD, "tab-b", payload({ markdown: "arrived mid-flight" }));
    useDesignChangeDraftStore.getState().clear(THREAD, taken.sent);

    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("arrived mid-flight");
  });

  it("survives a mid-flight RE-SEND, which reuses the id it replaces", () => {
    // The common case, and the one clearing by id could never protect: `add` reuses the
    // superseded entry's id for the same tab and document, so the replacement minted during
    // the awaited turn start carries the very id the send captured. Only entry identity tells
    // them apart (PR #74 review).
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "rode along" }));
    const taken = forkDesignChanges.takeForSend(THREAD, "");
    const sentId = taken.sent[0]!.id;

    add(THREAD, "tab-a", payload({ markdown: "re-sent mid-flight" }));
    expect(pendingFor(THREAD)[0]?.id).toBe(sentId); // same id, different payload
    useDesignChangeDraftStore.getState().clear(THREAD, taken.sent);

    const pending = pendingFor(THREAD);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.markdown).toBe("re-sent mid-flight");
  });

  it("markSent notes the contributing tabs before the pills it read them from are cleared", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "from a" }));
    add(THREAD, "tab-b", payload({ markdown: "from b" }));
    const taken = forkDesignChanges.takeForSend(THREAD, "");

    forkDesignChanges.markSent(THREAD, taken.sent, SENT_AT);

    // Both tabs recorded — the panel can now offer to resolve either one's previews.
    expect(useDesignSentPreviews.getState().byTabId).toEqual({
      "tab-a": { threadKey: scopedThreadKey(THREAD), sentAt: SENT_AT, report: null },
      "tab-b": { threadKey: scopedThreadKey(THREAD), sentAt: SENT_AT, report: null },
    });
    expect(pendingFor(THREAD)).toHaveLength(0);
  });

  it("markSent leaves a tab whose pill did not ride this message alone", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "rode along" }));
    const taken = forkDesignChanges.takeForSend(THREAD, "");
    add(THREAD, "tab-b", payload({ markdown: "arrived mid-flight" }));

    forkDesignChanges.markSent(THREAD, taken.sent, SENT_AT);

    expect(Object.keys(useDesignSentPreviews.getState().byTabId)).toEqual(["tab-a"]);
    expect(pendingFor(THREAD)).toHaveLength(1);
  });

  it("drops the thread's whole entry once a targeted clear empties it", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload());
    useDesignChangeDraftStore
      .getState()
      .clear(THREAD, forkDesignChanges.takeForSend(THREAD, "").sent);
    expect(scopedThreadKey(THREAD) in useDesignChangeDraftStore.getState().byThreadKey).toBe(false);
  });

  it("round-trips every pending block through the transcript extractor", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "# one", pageUrl: "http://localhost:5173/" }));
    add(THREAD, "tab-b", payload({ markdown: "# two", pageUrl: "http://localhost:5173/" }));

    const extracted = extractTrailingDesignChanges(
      forkDesignChanges.takeForSend(THREAD, "make it pop").text,
    );
    expect(extracted.promptText).toBe("make it pop");
    expect(extracted.blocks).toEqual(["# one", "# two"]);
  });
});

describe("extractTrailingDesignChanges", () => {
  it("agrees with the regex on the literal its fast path screens for", () => {
    // The `includes` bail must screen for exactly what the pattern requires — an edit to
    // either side (case-insensitivity, optional whitespace, an attribute) would let the fast
    // path answer "no blocks" for a prompt that has one.
    const prompt = "hi\n\n<design_change_request>\n# body\n</design_change_request>";
    expect(extractTrailingDesignChanges(prompt).blocks).toEqual(["# body"]);
    expect(extractTrailingDesignChanges("no blocks here")).toEqual({
      promptText: "no blocks here",
      blocks: [],
    });
    // Present but not trailing: the fast path lets it through, and the regex declines it.
    const notTrailing =
      "<design_change_request>\n# body\n</design_change_request>\n\ntrailing text";
    expect(extractTrailingDesignChanges(notTrailing).blocks).toEqual([]);
  });
});
