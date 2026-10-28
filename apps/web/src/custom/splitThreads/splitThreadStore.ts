/**
 * Device-local split pairs — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Pairs live on this client only: other devices and the mobile app show the
 * two threads as ordinary separate cards.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  findSplitPair,
  pairSplitThreads,
  pruneSplitPairs,
  unpairSplitThread,
  type SplitThreadPair,
} from "./splitThreadPairs";

interface SplitThreadStoreState {
  readonly pairs: readonly SplitThreadPair[];
  /** The thread a "Split agent" click started from, held while its new draft
      is being minted. handleNewThread navigates before it returns the draft's
      thread id, so without this the draft would render alone for a frame
      and then remount into the split. */
  readonly pendingSource: ScopedThreadRef | null;
  readonly pair: (a: ScopedThreadRef, b: ScopedThreadRef) => void;
  readonly unpair: (ref: ScopedThreadRef) => void;
  readonly prune: (exists: (ref: ScopedThreadRef) => boolean) => void;
  readonly setPendingSource: (ref: ScopedThreadRef | null) => void;
}

const isThreadRef = Schema.is(ScopedThreadRef);
const isPair = (value: unknown): value is SplitThreadPair => {
  const pair = value as SplitThreadPair | null;
  return pair !== null && typeof pair === "object" && isThreadRef(pair.a) && isThreadRef(pair.b);
};

export const useSplitThreadStore = create<SplitThreadStoreState>()(
  persist(
    (set) => ({
      pairs: [],
      pendingSource: null,
      pair: (a, b) => set((state) => ({ pairs: pairSplitThreads(state.pairs, a, b) })),
      unpair: (ref) => set((state) => ({ pairs: unpairSplitThread(state.pairs, ref) })),
      prune: (exists) => set((state) => ({ pairs: pruneSplitPairs(state.pairs, exists) })),
      setPendingSource: (ref) => set({ pendingSource: ref }),
    }),
    {
      name: "t3code:fork:split-threads:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ pairs }) => ({ pairs }),
      merge: (persisted, current) => {
        const pairs = (persisted as { pairs?: unknown } | null)?.pairs;
        return { ...current, pairs: Array.isArray(pairs) ? pairs.filter(isPair) : [] };
      },
    },
  ),
);

export interface SplitLayout {
  readonly left: ScopedThreadRef;
  readonly right: ScopedThreadRef;
}

/** The two panes to show for the thread on screen, or null to show it alone.
    A draft minted by "Split agent" joins its source thread while the click
    is still settling (see `pendingSource`). */
export function useSplitLayout(
  ref: ScopedThreadRef | null,
  options: { readonly isDraft: boolean },
): SplitLayout | null {
  const pair = useSplitThreadStore((state) =>
    ref === null ? null : findSplitPair(state.pairs, ref),
  );
  const pendingSource = useSplitThreadStore((state) => state.pendingSource);
  if (ref === null) return null;
  if (pair) return { left: pair.a, right: pair.b };
  if (
    options.isDraft &&
    pendingSource !== null &&
    scopedThreadKey(pendingSource) !== scopedThreadKey(ref)
  ) {
    return { left: pendingSource, right: ref };
  }
  return null;
}
