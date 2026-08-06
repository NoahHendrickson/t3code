import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { extractTrailingDesignChanges } from "./designChangeTranscript";
import { forkDesignChanges, useDesignChangeDraftStore } from "./designChangeDraftStore";
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

const payload = (
  overrides: Partial<DesignChangeRequestPayload> = {},
): DesignChangeRequestPayload => ({
  markdown: "# Design change request",
  elementCount: 1,
  elements: [{ tag: "div", sourceLabel: "App.tsx:12", deltas: ["padding-top 24px → 32px"] }],
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

  it("keeps both pages when the preview navigates between sends", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "home", pageUrl: "http://localhost:5173/" }));
    add(THREAD, "tab-a", payload({ markdown: "settings", pageUrl: "http://localhost:5173/s" }));

    // Drafts are re-located per document, so the second request describes ONLY the new page:
    // replacing on tab alone would silently drop the first page's asks.
    expect(pendingFor(THREAD).map((entry) => entry.markdown)).toEqual(["home", "settings"]);
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
    forkDesignChanges.clear(THREAD);
    expect(pendingFor(THREAD)).toHaveLength(0);
    expect(pendingFor(OTHER_THREAD)).toHaveLength(1);
  });

  it("round-trips every pending block through the transcript extractor", () => {
    const { add } = useDesignChangeDraftStore.getState();
    add(THREAD, "tab-a", payload({ markdown: "# one", pageUrl: "http://localhost:5173/" }));
    add(THREAD, "tab-b", payload({ markdown: "# two", pageUrl: "http://localhost:5173/" }));

    const sent = forkDesignChanges.appendToPrompt(THREAD, "make it pop");
    const extracted = extractTrailingDesignChanges(sent);
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
