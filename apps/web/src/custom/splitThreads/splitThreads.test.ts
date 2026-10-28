import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { orderSidebarSplitPairs, resolveSidebarSplitRow } from "./sidebarSplitRows";
import {
  EMPTY_SPLIT_PANE_SLOTS,
  assignSplitPaneSlots,
  type SplitPaneSlots,
} from "./splitPaneSlots";
import {
  pairSplitThreads,
  pruneSplitPairs,
  splitPartnerOf,
  unpairSplitThread,
} from "./splitThreadPairs";

const ref = (id: string) => scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id));
const a = ref("a");
const b = ref("b");
const c = ref("c");

describe("split pairs", () => {
  it("pairs two threads and finds each from the other", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(splitPartnerOf(pairs, a)).toEqual(b);
    expect(splitPartnerOf(pairs, b)).toEqual(a);
    expect(splitPartnerOf(pairs, c)).toBeNull();
  });

  it("moves a thread that is already paired, freeing its old partner", () => {
    const pairs = pairSplitThreads(pairSplitThreads([], a, b), c, b);
    expect(pairs).toEqual([{ a: c, b }]);
    expect(splitPartnerOf(pairs, a)).toBeNull();
  });

  it("does not pair a thread with itself", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(pairSplitThreads(pairs, a, a)).toBe(pairs);
  });

  it("pops either member out, leaving both on their own", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(unpairSplitThread(pairs, b)).toEqual([]);
    expect(unpairSplitThread(pairs, c)).toBe(pairs);
  });

  it("dissolves pairs whose member no longer exists", () => {
    const pairs = pairSplitThreads(pairSplitThreads([], a, b), c, ref("d"));
    const pruned = pruneSplitPairs(pairs, (candidate) => candidate.threadId !== "d");
    expect(pruned).toEqual([{ a, b }]);
    expect(pruneSplitPairs(pruned, () => true)).toBe(pruned);
  });
});

describe("sidebar split rows", () => {
  type Row = { readonly key: string; readonly pinned: boolean };
  const row = (id: string, pinned = false): Row => ({ key: scopedThreadKey(ref(id)), pinned });
  const showing = (...rows: Row[]) => new Map(rows.map((entry) => [entry.key, entry]));

  it("paints the pair at its first member and skips the second", () => {
    const pairs = pairSplitThreads([], a, b);
    const threadByKey = showing(row("b"), row("c"), row("a"));
    const paired = new Set<string>();
    const resolve = (threadRef: typeof a) =>
      resolveSidebarSplitRow({
        threadRef,
        pairs,
        threadByKey,
        canPair: (thread) => !thread.pinned,
        paired,
      });

    const first = resolve(b);
    expect(first).toMatchObject({ kind: "pair" });
    // Left and right follow the panes, not the list order.
    if (first.kind === "pair") {
      expect(first.left.key).toBe(scopedThreadKey(a));
      expect(first.right.key).toBe(scopedThreadKey(b));
    }
    expect(resolve(c)).toEqual({ kind: "single" });
    expect(resolve(a)).toEqual({ kind: "skip" });
  });

  it("leaves a card alone when its partner is hidden or pinned", () => {
    const pairs = pairSplitThreads([], a, b);
    const hidden = resolveSidebarSplitRow({
      threadRef: a,
      pairs,
      threadByKey: showing(row("a")),
      canPair: () => true,
      paired: new Set(),
    });
    expect(hidden).toEqual({ kind: "single" });

    const pinned = resolveSidebarSplitRow({
      threadRef: a,
      pairs,
      threadByKey: showing(row("a"), row("b", true)),
      canPair: (thread) => !thread.pinned,
      paired: new Set(),
    });
    expect(pinned).toEqual({ kind: "single" });
  });
});

describe("sidebar split order", () => {
  it("puts a pair side by side in keyboard order, so a range cannot skip a card", () => {
    const threads = [a, c, b];
    const ordered = orderSidebarSplitPairs({
      threads,
      refOf: (thread) => thread,
      pairs: pairSplitThreads([], a, b),
      canPair: () => true,
    });
    expect(ordered).toEqual([a, b, c]);
  });
});

describe("split pane slots", () => {
  const slot = (threadKey: string, elementKey: string | null = "chat-view") => ({
    threadKey,
    elementKey,
  });

  it("keeps a thread in its slot when its partner opens, closes, or takes focus", () => {
    const single = assignSplitPaneSlots(EMPTY_SPLIT_PANE_SLOTS, [slot("a")]);
    const split = assignSplitPaneSlots(single, [slot("d", "draft-d"), slot("a")]);
    expect(split).toEqual([slot("a"), slot("d", "draft-d")]);
    // The right pane popped out alone stays in its slot.
    expect(assignSplitPaneSlots(split, [slot("d")])).toEqual([null, slot("d", "draft-d")]);
  });

  it("latches a promoted draft's key across focus changes", () => {
    const split: SplitPaneSlots = [slot("a"), slot("d", "draft-d")];
    // Unfocused after promotion, its view would carry no draft key any more.
    expect(assignSplitPaneSlots(split, [slot("a"), slot("d")])).toBe(split);
  });

  it("hands a departing thread's slot to the arriving one", () => {
    const slots: SplitPaneSlots = [null, slot("d")];
    expect(assignSplitPaneSlots(slots, [slot("c")])).toEqual([null, slot("c")]);
  });

  it("fills a key once a thread first has a view", () => {
    const slots = assignSplitPaneSlots(EMPTY_SPLIT_PANE_SLOTS, [slot("a", null)]);
    expect(assignSplitPaneSlots(slots, [slot("a", "draft-a")])).toEqual([
      slot("a", "draft-a"),
      null,
    ]);
  });
});
