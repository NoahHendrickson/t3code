import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarSplitModel } from "./sidebarSplitRows";
import {
  EMPTY_SPLIT_PANE_SLOTS,
  assignSplitPaneSlots,
  type SplitPaneSlots,
} from "./splitPaneSlots";
import { findSplitPair, pairSplitThreads, unpairSplitThread } from "./splitThreadPairs";

const ref = (id: string) => scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id));
const a = ref("a");
const b = ref("b");
const c = ref("c");

describe("split pairs", () => {
  it("pairs two threads and finds the pair from either", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(findSplitPair(pairs, a)).toEqual({ a, b });
    expect(findSplitPair(pairs, b)).toEqual({ a, b });
    expect(findSplitPair(pairs, c)).toBeNull();
  });

  it("moves a thread that is already paired, freeing its old partner", () => {
    const pairs = pairSplitThreads(pairSplitThreads([], a, b), c, b);
    expect(pairs).toEqual([{ a: c, b }]);
    expect(findSplitPair(pairs, a)).toBeNull();
  });

  it("does not pair a thread with itself", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(pairSplitThreads(pairs, a, a)).toBe(pairs);
  });

  it("keeps only the newest pairs, so pairs deleted elsewhere cannot pile up", () => {
    let pairs = pairSplitThreads([], ref("x0"), ref("y0"));
    for (let index = 1; index <= 50; index += 1) {
      pairs = pairSplitThreads(pairs, ref(`x${index}`), ref(`y${index}`));
    }
    expect(pairs).toHaveLength(50);
    expect(findSplitPair(pairs, ref("x0"))).toBeNull();
    expect(findSplitPair(pairs, ref("x50"))).not.toBeNull();
  });

  it("pops either member out, leaving both on their own", () => {
    const pairs = pairSplitThreads([], a, b);
    expect(unpairSplitThread(pairs, b)).toEqual([]);
    expect(unpairSplitThread(pairs, c)).toBe(pairs);
  });
});

describe("sidebar split model", () => {
  type Row = { readonly ref: typeof a; readonly pinned: boolean };
  const row = (id: string, pinned = false): Row => ({ ref: ref(id), pinned });
  const build = (threads: readonly Row[]) =>
    buildSidebarSplitModel({
      threads,
      refOf: (thread) => thread.ref,
      pairs: pairSplitThreads([], a, b),
      canPair: (thread) => !thread.pinned,
    });

  it("paints the pair at its first member, skips the second, and keeps them adjacent", () => {
    const model = build([row("b"), row("c"), row("a")]);
    const pair = model.rows.get(scopedThreadKey(b));
    // Left and right follow the panes, not the list order.
    expect(pair).toMatchObject({ kind: "pair", left: { ref: a }, right: { ref: b } });
    expect(model.rows.get(scopedThreadKey(a))).toEqual({ kind: "skip" });
    expect(model.rows.has(scopedThreadKey(c))).toBe(false);
    // A shift-select range from a to b cannot take in c.
    expect(model.order.map((thread) => thread.ref.threadId)).toEqual(["a", "b", "c"]);
  });

  it("leaves a card alone when its partner is hidden or cannot pair", () => {
    expect(build([row("a"), row("c")]).rows.size).toBe(0);
    const pinned = build([row("a"), row("b", true)]);
    expect(pinned.rows.size).toBe(0);
    expect(pinned.pairable.has(scopedThreadKey(b))).toBe(false);
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
