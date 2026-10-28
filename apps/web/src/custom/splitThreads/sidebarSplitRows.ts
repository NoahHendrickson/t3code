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
  | { readonly kind: "skip" }
  | {
      readonly kind: "pair";
      readonly key: string;
      readonly left: TThread;
      readonly right: TThread;
    };

export interface SidebarSplitModel<TThread> {
  /** Paint, keyboard and shift-select order: the list's own order with each
      pair's two cards adjacent, so a range never takes in a card that is not
      between its ends on screen. */
  readonly order: readonly TThread[];
  /** The pair painted at a thread's row, or "skip" for the second member.
      A thread with no entry paints as an ordinary card. */
  readonly rows: ReadonlyMap<string, SidebarSplitRow<TThread>>;
  /** Thread keys that may pair: the card drop target reads this too. */
  readonly pairable: ReadonlySet<string>;
}

/** `threads` is the list in paint order. */
export function buildSidebarSplitModel<TThread>(input: {
  readonly threads: readonly TThread[];
  readonly refOf: (thread: TThread) => ScopedThreadRef;
  readonly pairs: readonly SplitThreadPair[];
  readonly canPair: (thread: TThread) => boolean;
}): SidebarSplitModel<TThread> {
  const keyOf = (thread: TThread) => scopedThreadKey(input.refOf(thread));
  const threadByKey = new Map(input.threads.map((thread) => [keyOf(thread), thread] as const));
  const pairable = new Set(input.threads.filter(input.canPair).map(keyOf));
  const rows = new Map<string, SidebarSplitRow<TThread>>();
  const order: TThread[] = [];
  for (const thread of input.threads) {
    const key = keyOf(thread);
    if (rows.has(key)) continue;
    const pair = pairable.has(key) ? findSplitPair(input.pairs, input.refOf(thread)) : null;
    const leftKey = pair ? scopedThreadKey(pair.a) : null;
    const rightKey = pair ? scopedThreadKey(pair.b) : null;
    const left = leftKey === null ? undefined : threadByKey.get(leftKey);
    const right = rightKey === null ? undefined : threadByKey.get(rightKey);
    if (
      leftKey === null ||
      rightKey === null ||
      left === undefined ||
      right === undefined ||
      !pairable.has(leftKey) ||
      !pairable.has(rightKey)
    ) {
      order.push(thread);
      continue;
    }
    const partnerKey = key === leftKey ? rightKey : leftKey;
    rows.set(key, { kind: "pair", key: `split:${leftKey}|${rightKey}`, left, right });
    rows.set(partnerKey, { kind: "skip" });
    order.push(left, right);
  }
  return { order, rows, pairable };
}
