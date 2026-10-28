/**
 * Split threads — two threads sharing the chat column. See
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * A pair is two thread refs in pane order (`a` left, `b` right). A thread
 * belongs to at most one pair, so pairing a thread that is already paired
 * moves it, and its old partner goes back to being a thread of its own.
 * Drafts pair by the thread id they reserve, which the promoted thread
 * keeps, so a pair survives the first send without being rewritten.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

export interface SplitThreadPair {
  readonly a: ScopedThreadRef;
  readonly b: ScopedThreadRef;
}

const pairHas = (pair: SplitThreadPair, key: string) =>
  scopedThreadKey(pair.a) === key || scopedThreadKey(pair.b) === key;

export function findSplitPair(
  pairs: readonly SplitThreadPair[],
  ref: ScopedThreadRef,
): SplitThreadPair | null {
  const key = scopedThreadKey(ref);
  return pairs.find((pair) => pairHas(pair, key)) ?? null;
}

export function splitPartnerOf(
  pairs: readonly SplitThreadPair[],
  ref: ScopedThreadRef,
): ScopedThreadRef | null {
  const pair = findSplitPair(pairs, ref);
  if (!pair) return null;
  return scopedThreadKey(pair.a) === scopedThreadKey(ref) ? pair.b : pair.a;
}

/** `a` takes the left pane, `b` the right. Pairing a thread with itself is a no-op. */
export function pairSplitThreads(
  pairs: readonly SplitThreadPair[],
  a: ScopedThreadRef,
  b: ScopedThreadRef,
): readonly SplitThreadPair[] {
  const aKey = scopedThreadKey(a);
  const bKey = scopedThreadKey(b);
  if (aKey === bKey) return pairs;
  return [...pairs.filter((pair) => !pairHas(pair, aKey) && !pairHas(pair, bKey)), { a, b }];
}

export function unpairSplitThread(
  pairs: readonly SplitThreadPair[],
  ref: ScopedThreadRef,
): readonly SplitThreadPair[] {
  const key = scopedThreadKey(ref);
  const next = pairs.filter((pair) => !pairHas(pair, key));
  return next.length === pairs.length ? pairs : next;
}

/** Drops every pair with a member that no longer exists (deleted, archived,
    or a draft that was discarded), so its partner is a thread of its own
    again instead of sitting beside an empty pane. */
export function pruneSplitPairs(
  pairs: readonly SplitThreadPair[],
  exists: (ref: ScopedThreadRef) => boolean,
): readonly SplitThreadPair[] {
  const next = pairs.filter((pair) => exists(pair.a) && exists(pair.b));
  return next.length === pairs.length ? pairs : next;
}
