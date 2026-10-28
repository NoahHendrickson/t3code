/**
 * Device-local split pairs — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Pairs live on this client only: other devices and the mobile app show the
 * two threads as ordinary separate cards.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef, type ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  findSplitPair,
  pairSplitThreads,
  unpairSplitThread,
  type SplitThreadPair,
} from "./splitThreadPairs";

interface SplitThreadStoreState {
  readonly pairs: readonly SplitThreadPair[];
  readonly pair: (a: ScopedThreadRef, b: ScopedThreadRef) => void;
  readonly unpair: (ref: ScopedThreadRef) => void;
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
      pair: (a, b) => set((state) => ({ pairs: pairSplitThreads(state.pairs, a, b) })),
      unpair: (ref) => set((state) => ({ pairs: unpairSplitThread(state.pairs, ref) })),
    }),
    {
      name: "t3code:fork:split-threads:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      merge: (persisted, current) => {
        const pairs = (persisted as { pairs?: unknown } | null)?.pairs;
        return { ...current, pairs: Array.isArray(pairs) ? pairs.filter(isPair) : [] };
      },
    },
  ),
);

/** A "Split agent" click in flight: the thread it started from and the
    project its new draft is being minted in. handleNewThread navigates before
    it returns the draft's thread id, so without this the draft would render
    alone for a frame and then remount into the split. Not persisted. */
interface PendingSplit {
  readonly source: ScopedThreadRef;
  readonly projectRef: ScopedProjectRef;
}

export const usePendingSplitStore = create<{ readonly pending: PendingSplit | null }>()(() => ({
  pending: null,
}));

export interface SplitLayout {
  readonly left: ScopedThreadRef;
  readonly right: ScopedThreadRef;
}

/** The two panes to show for the thread on screen, or null to show it alone.
    `draftProjectRef` is the project of the draft on screen (null on a server
    route): only a draft in the project a pending click is minting into joins
    its source while the click settles. */
export function useSplitLayout(
  ref: ScopedThreadRef | null,
  draftProjectRef: ScopedProjectRef | null,
): SplitLayout | null {
  const pair = useSplitThreadStore((state) =>
    ref === null ? null : findSplitPair(state.pairs, ref),
  );
  const pending = usePendingSplitStore((state) => state.pending);
  if (ref === null) return null;
  if (pair) return { left: pair.a, right: pair.b };
  if (
    pending !== null &&
    draftProjectRef !== null &&
    pending.projectRef.environmentId === draftProjectRef.environmentId &&
    pending.projectRef.projectId === draftProjectRef.projectId &&
    scopedThreadKey(pending.source) !== scopedThreadKey(ref)
  ) {
    return { left: pending.source, right: ref };
  }
  return null;
}
