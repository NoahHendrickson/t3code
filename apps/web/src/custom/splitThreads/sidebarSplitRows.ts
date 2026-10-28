/**
 * Where a split pair sits in the sidebar — see
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * A pair paints as one row of two cards, at the first member the list
 * reaches, so neither thread ever sits lower than it would alone; the other
 * member's own slot is then skipped. Cards keep their own status marks, and
 * left/right follow the panes. A member the list is not showing (filtered,
 * under a collapsed header) leaves its partner as an ordinary card. Pinned
 * threads never pair here (the pinned block sorts its cards with dnd-kit,
 * row by row), nor do settled or snoozed ones, whose slim shelf rows carry
 * their own un-settle and wake actions.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { findSplitPair, type SplitThreadPair } from "./splitThreadPairs";

export type SidebarSplitRow<TThread> =
  | { readonly kind: "single" }
  | { readonly kind: "skip" }
  | {
      readonly kind: "pair";
      readonly key: string;
      readonly left: TThread;
      readonly right: TThread;
    };

export function resolveSidebarSplitRow<TThread>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly pairs: readonly SplitThreadPair[];
  /** The threads the list is showing, by thread key. */
  readonly threadByKey: ReadonlyMap<string, TThread>;
  readonly canPair: (thread: TThread) => boolean;
  /** Keys already painted inside a pair during this render. Mutated. */
  readonly paired: Set<string>;
}): SidebarSplitRow<TThread> {
  const key = scopedThreadKey(input.threadRef);
  if (input.paired.has(key)) return { kind: "skip" };
  const pair = findSplitPair(input.pairs, input.threadRef);
  if (!pair) return { kind: "single" };
  const leftKey = scopedThreadKey(pair.a);
  const rightKey = scopedThreadKey(pair.b);
  const left = input.threadByKey.get(leftKey);
  const right = input.threadByKey.get(rightKey);
  if (left === undefined || right === undefined) return { kind: "single" };
  if (!input.canPair(left) || !input.canPair(right)) return { kind: "single" };
  input.paired.add(leftKey);
  input.paired.add(rightKey);
  return { kind: "pair", key: `split:${leftKey}|${rightKey}`, left, right };
}

/** The list's keyboard and shift-select order with each pair adjacent, the
    way resolveSidebarSplitRow paints it, so a range never takes in a card
    that is not between its ends on screen. */
export function orderSidebarSplitPairs<TThread>(input: {
  readonly threads: readonly TThread[];
  readonly refOf: (thread: TThread) => ScopedThreadRef;
  readonly pairs: readonly SplitThreadPair[];
  readonly canPair: (thread: TThread) => boolean;
}): readonly TThread[] {
  if (input.pairs.length === 0) return input.threads;
  const threadByKey = new Map(
    input.threads.map((thread) => [scopedThreadKey(input.refOf(thread)), thread] as const),
  );
  const paired = new Set<string>();
  return input.threads.flatMap((thread) => {
    const row = resolveSidebarSplitRow({
      threadRef: input.refOf(thread),
      pairs: input.pairs,
      threadByKey,
      canPair: input.canPair,
      paired,
    });
    if (row.kind === "skip") return [];
    return row.kind === "pair" ? [row.left, row.right] : [thread];
  });
}
