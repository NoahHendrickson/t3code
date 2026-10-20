/**
 * Sidebar V2's optional status grouping — see
 * `.fork/customizations.yaml#sidebar-v2-status-grouping`.
 *
 * The other answer to "how should the flat list read": instead of one stream,
 * the active cards split by who owns the next move — Needs input (an agent is
 * blocked on you), Completed (a result is ready to read), Working, and Idle.
 * Pinned, snoozed and settled keep their shelves; Idle ages into Settled
 * through the server's existing auto-settle.
 *
 * A card's section comes from the same derivation as the mark it draws
 * (`resolveSidebarV2CardStatus`), so the two agree. One deliberate exception,
 * visible in `sidebarV2StatusBucketForKind`: a finished thread whose only
 * background work is a command (a dev server, a long shell) draws the
 * breathing Monitoring mark but sits in Idle. Nothing will wake its agent and
 * the command can run for hours, so Working would hold it busy-looking all
 * day; the waiting case, whose roster does wake the agent, stays in Working.
 *
 * Completed has one extra rule the mark does not: a thread that has just come
 * to rest — read, or finished while you watched — stays in Completed while it
 * is open and for `SIDEBAR_V2_COMPLETED_HOLD_MS` after you leave it, rather
 * than jumping to Idle the instant it is seen. The server's visited watermark
 * is the thread's last activity time, not when you looked, so the hold is
 * tracked by this client alone (`createSidebarV2CompletedHoldTracker`).
 *
 * The sections share the list's paint sequence with project grouping
 * (`SidebarV2ListSection`), so Sidebar.tsx renders and flattens both through
 * one path and tells them apart by `kind`.
 */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  sortInboxThreadsByReturn,
  sortWorkingThreadsBySend,
} from "@t3tools/client-runtime/state/thread-inbox";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import { resolveThreadLastVisitedAt } from "~/components/Sidebar.logic";

import { resolveSidebarV2CardStatus, type SidebarV2CardStatusKind } from "./sidebarV2CardStatus";
import { useSidebarV2CollapsedKeys, type SidebarV2ActiveSection } from "./sidebarV2ProjectGrouping";

const SIDEBAR_V2_COLLAPSED_STATUS_SECTIONS_STORAGE_KEY =
  "t3code:fork:sidebar-v2-collapsed-status-sections:v1";

export type SidebarV2StatusBucket = "input" | "done" | "working" | "idle";

/** Paint order: blocked agents first, then results to read, then live work. */
const SIDEBAR_V2_STATUS_BUCKET_ORDER: readonly SidebarV2StatusBucket[] = [
  "input",
  "done",
  "working",
  "idle",
];

/** Every header status grouping draws: the four status sections, plus the
    pinned block, which takes a header of its own while status grouping is on
    so it reads as one more group. */
export type SidebarV2StatusSectionKey = SidebarV2StatusBucket | "pinned";

export const SIDEBAR_V2_STATUS_SECTION_LABELS: Record<SidebarV2StatusSectionKey, string> = {
  pinned: "Pinned",
  input: "Needs input",
  done: "Completed",
  working: "Working",
  idle: "Idle",
};

/** How long a thread that came to rest stays in Completed after you leave it. */
const SIDEBAR_V2_COMPLETED_HOLD_MS = 5 * 60_000;

/** The fields grouping and the inbox sorts read. */
export type SidebarV2StatusSectionThread = Pick<
  EnvironmentThreadShell,
  "id" | "environmentId" | "createdAt" | "unsettledAt" | "latestRun" | "latestUserAuthoredMessageAt"
>;

/** One status section: headerless in project terms, named by its status, and
    carrying the card count its header shows, taken while the section is whole
    so a collapsed header still says how many cards it hides. */
export interface SidebarV2StatusSection<TThread> {
  readonly kind: "status";
  readonly header: null;
  readonly status: SidebarV2StatusBucket;
  readonly threads: readonly TThread[];
  readonly threadCount: number;
}

/** Every section the active list can paint. */
export type SidebarV2ListSection<TThread> =
  | SidebarV2ActiveSection<TThread>
  | SidebarV2StatusSection<TThread>;

const isStatusSectionKey = (key: string): key is SidebarV2StatusSectionKey =>
  key in SIDEBAR_V2_STATUS_SECTION_LABELS;

export function useSidebarV2CollapsedStatusSections() {
  return useSidebarV2CollapsedKeys(
    SIDEBAR_V2_COLLAPSED_STATUS_SECTIONS_STORAGE_KEY,
    isStatusSectionKey,
  );
}

/** Folds a card's status kind into a section. Woke joins Completed: the
    thread is back with something to look at, but no agent is blocked on it. */
export function sidebarV2StatusBucketForKind(
  kind: SidebarV2CardStatusKind | null,
): SidebarV2StatusBucket {
  switch (kind) {
    case "approval":
    case "input":
    case "failed":
    case "limited":
      return "input";
    case "working":
    case "waiting":
      return "working";
    case "done":
    case "woke":
      return "done";
    // The one place a section parts from the card's mark — see the module
    // comment: a commands-only roster never wakes the agent.
    case "monitoring":
    case null:
      return "idle";
  }
}

/**
 * Remembers which threads just came to rest so they linger in Completed. Keep
 * one at module scope so a route that unmounts the list does not drop holds.
 *
 * `apply` takes each active thread's bucket from its mark, and returns the
 * buckets to paint: a thread entering Idle from any other bucket is held in
 * Completed. The open thread's hold is refreshed on every call, including the
 * one where you leave it, so the delay counts from when you stopped looking.
 * The first call is a baseline: mounting the list never holds anything.
 * `reset` forgets everything while status grouping is off.
 *
 * A hold ends only when its thread moves again or its time runs out — not
 * when the thread is missing from one call. The project scope filters the
 * list before it gets here, so a missing thread is usually just scoped out
 * for a moment; deleted threads simply age out.
 *
 * Holds are stamped with the real time of the call (`nowMs`), not the minute
 * clock, so a hold started when you leave counts from that moment.
 *
 * Expiry needs a call to land: the sidebar rebuilds its sections on every
 * minute tick (`useNowMinute` feeds the partition memo), so a hold you left
 * is released within a minute of running out.
 */
export function createSidebarV2CompletedHoldTracker(holdMs = SIDEBAR_V2_COMPLETED_HOLD_MS) {
  let previous: ReadonlyMap<string, SidebarV2StatusBucket> | null = null;
  let previousOpenThreadKey: string | null = null;
  const heldSince = new Map<string, number>();
  return {
    apply(input: {
      readonly buckets: ReadonlyMap<string, SidebarV2StatusBucket>;
      readonly openThreadKey: string | null;
      readonly nowMs: number;
    }): ReadonlyMap<string, SidebarV2StatusBucket> {
      for (const [key, bucket] of input.buckets) {
        if (bucket !== "idle") {
          heldSince.delete(key);
          continue;
        }
        const before = previous?.get(key);
        if (before !== undefined && before !== "idle") heldSince.set(key, input.nowMs);
      }
      // The open thread (and the one just left) refresh independently of the
      // buckets: the project scope can hide the thread you are reading, and
      // its hold must not run out behind the filter while it is still open.
      for (const key of [input.openThreadKey, previousOpenThreadKey]) {
        if (key !== null && heldSince.has(key)) heldSince.set(key, input.nowMs);
      }
      for (const [key, since] of heldSince) {
        if (input.nowMs - since >= holdMs) heldSince.delete(key);
      }
      previous = input.buckets;
      previousOpenThreadKey = input.openThreadKey;
      const effective = new Map(input.buckets);
      for (const key of heldSince.keys()) {
        if (effective.get(key) === "idle") effective.set(key, "done");
      }
      return effective;
    },
    reset(): void {
      previous = null;
      previousOpenThreadKey = null;
      heldSince.clear();
    },
  };
}

export type SidebarV2CompletedHoldTracker = ReturnType<typeof createSidebarV2CompletedHoldTracker>;

/**
 * Splits threads into the status sections the list paints, in
 * `SIDEBAR_V2_STATUS_BUCKET_ORDER`, dropping empty ones. Working keeps the
 * Working shelf's order (by your last send, so runs finishing and resuming do
 * not move a row); the others list the thread that most recently came back to
 * you first. The card count is taken here, while each section is whole.
 */
export function groupSidebarV2StatusSections<TThread extends SidebarV2StatusSectionThread>(input: {
  readonly threads: readonly TThread[];
  readonly bucketOf: (thread: TThread) => SidebarV2StatusBucket;
  readonly returnedAt?: ((thread: TThread) => number | undefined) | undefined;
}): SidebarV2StatusSection<TThread>[] {
  const byBucket = new Map<SidebarV2StatusBucket, TThread[]>();
  for (const thread of input.threads) {
    const bucket = input.bucketOf(thread);
    const existing = byBucket.get(bucket);
    if (existing) existing.push(thread);
    else byBucket.set(bucket, [thread]);
  }
  return SIDEBAR_V2_STATUS_BUCKET_ORDER.flatMap((status) => {
    const threads = byBucket.get(status);
    if (threads === undefined) return [];
    return [
      {
        kind: "status" as const,
        header: null,
        status,
        threads:
          status === "working"
            ? sortWorkingThreadsBySend(threads)
            : sortInboxThreadsByReturn(threads, input.returnedAt),
        threadCount: threads.length,
      },
    ];
  });
}

/**
 * The whole status pipeline for the active list: each thread's bucket from
 * the same derivation as its card's mark, Completed holds applied, then the
 * sections. Sidebar.tsx calls this or project grouping, nothing in between.
 */
export function buildSidebarV2StatusSections(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly localLastVisitedAtById: Readonly<Record<string, string>>;
  /** Precise clock for snooze wakes, as an ISO string. */
  readonly now: string;
  readonly openThreadKey: string | null;
  readonly holds: SidebarV2CompletedHoldTracker;
  readonly returnedAt?: ((thread: EnvironmentThreadShell) => number | undefined) | undefined;
}): SidebarV2StatusSection<EnvironmentThreadShell>[] {
  const keyByThread = new Map<EnvironmentThreadShell, string>();
  const buckets = new Map<string, SidebarV2StatusBucket>();
  for (const thread of input.threads) {
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    keyByThread.set(thread, threadKey);
    const { kind } = resolveSidebarV2CardStatus(thread, {
      lastVisitedAt: resolveThreadLastVisitedAt(
        thread.lastVisitedAt,
        input.localLastVisitedAtById[threadKey],
      ),
      wokeAt: threadWokeAt(thread, { now: input.now }),
    });
    buckets.set(threadKey, sidebarV2StatusBucketForKind(kind));
  }
  const effective = input.holds.apply({
    buckets,
    openThreadKey: input.openThreadKey,
    // The real time, not `now`: `now` refreshes with the partition memo and
    // can be a minute old when you leave a thread, which would start the hold
    // that much early. Expiry still rides the minute tick.
    nowMs: Date.now(),
  });
  return groupSidebarV2StatusSections({
    threads: input.threads,
    bucketOf: (thread) => effective.get(keyByThread.get(thread)!) ?? "idle",
    returnedAt: input.returnedAt,
  });
}
