/**
 * Device-local split pairs and the floating thread — see
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * Both live on this client only: other devices and the mobile app show the
 * threads as ordinary separate cards.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef, type ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DraftId } from "~/composerDraftStore";
import { resolveStorage } from "~/lib/storage";

import type { FloatFrame } from "./floatFrame";
import {
  findSplitPair,
  pairSplitThreads,
  unpairSplitThread,
  type SplitThreadPair,
} from "./splitThreadPairs";

interface SplitThreadStoreState {
  readonly pairs: readonly SplitThreadPair[];
  /** The thread floating over the chat column. Never also in a pair: floating
      a thread unpairs it, and pairing it (docking) lands it. */
  readonly floating: ScopedThreadRef | null;
  /** The floating window's last drag or resize, clamped into the column on render. */
  readonly floatFrame: FloatFrame | null;
  readonly pair: (a: ScopedThreadRef, b: ScopedThreadRef) => void;
  readonly unpair: (ref: ScopedThreadRef) => void;
  readonly float: (ref: ScopedThreadRef) => void;
  readonly unfloat: () => void;
  readonly setFloatFrame: (frame: FloatFrame) => void;
}

const isThreadRef = Schema.is(ScopedThreadRef);
const isPair = (value: unknown): value is SplitThreadPair => {
  const pair = value as SplitThreadPair | null;
  return pair !== null && typeof pair === "object" && isThreadRef(pair.a) && isThreadRef(pair.b);
};
const isFloatFrame = (value: unknown): value is FloatFrame => {
  const frame = value as Partial<FloatFrame> | null;
  return (
    frame !== null &&
    typeof frame === "object" &&
    [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
  );
};
const sameThread = (a: ScopedThreadRef | null, b: ScopedThreadRef) =>
  a !== null && scopedThreadKey(a) === scopedThreadKey(b);

export const useSplitThreadStore = create<SplitThreadStoreState>()(
  persist(
    (set) => ({
      pairs: [],
      floating: null,
      floatFrame: null,
      pair: (a, b) =>
        set((state) => ({
          pairs: pairSplitThreads(state.pairs, a, b),
          floating:
            sameThread(state.floating, a) || sameThread(state.floating, b) ? null : state.floating,
        })),
      unpair: (ref) => set((state) => ({ pairs: unpairSplitThread(state.pairs, ref) })),
      float: (ref) =>
        set((state) => ({ floating: ref, pairs: unpairSplitThread(state.pairs, ref) })),
      unfloat: () => set({ floating: null }),
      setFloatFrame: (floatFrame) => set({ floatFrame }),
    }),
    {
      name: "t3code:fork:split-threads:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ pairs, floating, floatFrame }) => ({ pairs, floating, floatFrame }),
      merge: (persisted, current) => {
        const stored = persisted as {
          pairs?: unknown;
          floating?: unknown;
          floatFrame?: unknown;
        } | null;
        return {
          ...current,
          pairs: Array.isArray(stored?.pairs) ? stored.pairs.filter(isPair) : [],
          floating: isThreadRef(stored?.floating) ? stored.floating : null,
          floatFrame: isFloatFrame(stored?.floatFrame) ? stored.floatFrame : null,
        };
      },
    },
  ),
);

/** Which route a pane's thread is shown on: an unsent draft has its own. */
export type PaneRoute =
  | { readonly kind: "server" }
  | { readonly kind: "draft"; readonly draftId: DraftId };

export interface RouteThread {
  readonly ref: ScopedThreadRef;
  readonly route: PaneRoute;
}

/** The route's thread now and the one before it, which is where the column
    goes when its own thread floats away. Not persisted. */
export const useRouteThreadHistoryStore = create<{
  readonly current: RouteThread | null;
  readonly previous: RouteThread | null;
}>()(() => ({ current: null, previous: null }));

const routeKey = (route: PaneRoute) => (route.kind === "draft" ? route.draftId : "server");

/** A repeat of the current thread and route is a no-op, so callers may report every render. */
export function noteRouteThread(next: RouteThread): void {
  const { current } = useRouteThreadHistoryStore.getState();
  if (current === null || !sameThread(current.ref, next.ref)) {
    useRouteThreadHistoryStore.setState({ current: next, previous: current });
  } else if (routeKey(current.route) !== routeKey(next.route)) {
    // A draft promoted on its route is the same visit, not a new one.
    useRouteThreadHistoryStore.setState({ current: next });
  }
}

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
