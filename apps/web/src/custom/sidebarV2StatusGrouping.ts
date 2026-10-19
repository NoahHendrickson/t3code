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
 * A card's section is derived from the same ladder as its status dot
 * (`resolveSidebarV2TopStatus`), so a section agrees with the mark drawn on
 * the card in it. One deliberate exception: a finished thread whose only
 * background work is a command (a dev server, a long shell) draws the
 * breathing Monitoring mark on its card but sits in Idle. Nothing will wake
 * its agent and the command can run for hours, so Working would hold it
 * busy-looking all day; the waiting case, whose roster does wake the agent,
 * stays in Working.
 *
 * Completed has one extra rule the dot does not: a thread that has just come
 * to rest — read, or finished while you watched — stays in Completed while it
 * is open and for `SIDEBAR_V2_COMPLETED_HOLD_MS` after you leave it, rather
 * than jumping to Idle the instant it is seen. The server's visited watermark
 * is the thread's last activity time, not when you looked, so the hold is
 * tracked by this client alone (`createSidebarV2CompletedHoldTracker`).
 *
 * The sections come out in the same `SidebarV2ActiveSection` shape project
 * grouping returns, headerless with a `status`, so Sidebar.tsx renders and
 * flattens both through one sequence.
 */
import * as Schema from "effect/Schema";
import { useCallback, useMemo } from "react";
import {
  sortInboxThreadsByReturn,
  sortWorkingThreadsBySend,
} from "@t3tools/client-runtime/state/thread-inbox";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveSidebarV2TopStatus,
  resolveThreadLastVisitedAt,
  type SidebarV2TopStatusKind,
} from "~/components/Sidebar.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { parseTimestampDate } from "~/timestampFormat";

import {
  resolveThreadProjectKey,
  type SidebarV2ActiveSection,
  type SidebarV2GroupableThread,
} from "./sidebarV2ProjectGrouping";

const SIDEBAR_V2_GROUP_BY_STATUS_STORAGE_KEY = "t3code:fork:sidebar-v2-group-by-status:v1";
const SIDEBAR_V2_COLLAPSED_STATUS_SECTIONS_STORAGE_KEY =
  "t3code:fork:sidebar-v2-collapsed-status-sections:v1";

export type SidebarV2StatusBucket = "input" | "done" | "working" | "idle";

/** Paint order: blocked agents first, then results to read, then live work. */
export const SIDEBAR_V2_STATUS_BUCKET_ORDER: readonly SidebarV2StatusBucket[] = [
  "input",
  "done",
  "working",
  "idle",
];

export const SIDEBAR_V2_STATUS_BUCKET_LABELS: Record<SidebarV2StatusBucket, string> = {
  input: "Needs input",
  done: "Completed",
  working: "Working",
  idle: "Idle",
};

/** How long a thread that came to rest stays in Completed after you leave it. */
export const SIDEBAR_V2_COMPLETED_HOLD_MS = 5 * 60_000;

export interface SidebarV2StatusSection<TThread> extends SidebarV2ActiveSection<TThread> {
  readonly header: null;
  readonly status: SidebarV2StatusBucket;
}

export function useSidebarV2GroupByStatus(): [boolean, (value: boolean) => void] {
  return useLocalStorage(SIDEBAR_V2_GROUP_BY_STATUS_STORAGE_KEY, false, Schema.Boolean);
}

const CollapsedStatusSections = Schema.Array(Schema.String);
const EMPTY_COLLAPSED_STATUS_SECTIONS: readonly string[] = [];

export function useSidebarV2CollapsedStatusSections(): readonly [
  ReadonlySet<string>,
  (bucket: SidebarV2StatusBucket) => void,
] {
  const [keys, setKeys] = useLocalStorage(
    SIDEBAR_V2_COLLAPSED_STATUS_SECTIONS_STORAGE_KEY,
    EMPTY_COLLAPSED_STATUS_SECTIONS,
    CollapsedStatusSections,
  );
  const collapsed = useMemo(() => new Set(keys), [keys]);
  const toggle = useCallback(
    (bucket: SidebarV2StatusBucket) => {
      setKeys((previous) =>
        previous.includes(bucket)
          ? previous.filter((key) => key !== bucket)
          : [...previous, bucket],
      );
    },
    [setKeys],
  );
  return [collapsed, toggle];
}

/** Folds the card's status dot into a section. Woke joins Completed: the
    thread is back with something to look at, but no agent is blocked on it. */
export function sidebarV2StatusBucketForTopStatus(
  topStatus: SidebarV2TopStatusKind | null,
): SidebarV2StatusBucket {
  switch (topStatus) {
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
    case null:
      return "idle";
  }
}

/** The section a card's dot puts it in, before any Completed hold. Mirrors the
    row's own unread and woke derivation in Sidebar.tsx's SidebarThreadRow. */
export function resolveSidebarV2ThreadStatusBucket(
  thread: EnvironmentThreadShell,
  options: { readonly localLastVisitedAt: string | undefined; readonly now: string },
): SidebarV2StatusBucket {
  const lastVisitedAt = resolveThreadLastVisitedAt(
    thread.lastVisitedAt,
    options.localLastVisitedAt,
  );
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const wokeAt = threadWokeAt(thread, { now: options.now });
  const wokeAtDate = wokeAt === null ? null : parseTimestampDate(wokeAt);
  const lastVisitedDate = lastVisitedAt === undefined ? null : parseTimestampDate(lastVisitedAt);
  const isWoke =
    wokeAtDate !== null &&
    (lastVisitedDate === null || lastVisitedDate < wokeAtDate) &&
    thread.settledOverride !== "settled";
  return sidebarV2StatusBucketForTopStatus(
    resolveSidebarV2TopStatus({
      status: resolveSidebarThreadStatus(thread),
      isUnread,
      isWoke,
    }),
  );
}

/**
 * Remembers which threads just came to rest so they linger in Completed. Keep
 * one at module scope so a route that unmounts the list does not drop holds.
 *
 * Call `observe` on every list rebuild with each active thread's raw bucket
 * and the open thread's key, or with null to reset while status grouping is
 * off. A thread entering Idle from any other bucket starts a hold; the open
 * thread's hold is refreshed on every observation, including the one where you
 * leave it, so the delay counts from when you stopped looking. The first observation is a baseline: mounting the
 * list never holds anything.
 */
export function createSidebarV2CompletedHoldTracker(holdMs = SIDEBAR_V2_COMPLETED_HOLD_MS) {
  let previous: ReadonlyMap<string, SidebarV2StatusBucket> | null = null;
  let previousOpenThreadKey: string | null = null;
  const heldSince = new Map<string, number>();
  return {
    observe(
      input: {
        readonly buckets: ReadonlyMap<string, SidebarV2StatusBucket>;
        readonly openThreadKey: string | null;
        readonly nowMs: number;
      } | null,
    ): void {
      if (input === null) {
        previous = null;
        previousOpenThreadKey = null;
        heldSince.clear();
        return;
      }
      for (const [key, bucket] of input.buckets) {
        if (bucket !== "idle") {
          heldSince.delete(key);
          continue;
        }
        const before = previous?.get(key);
        if (
          (before !== undefined && before !== "idle") ||
          ((key === input.openThreadKey || key === previousOpenThreadKey) && heldSince.has(key))
        ) {
          heldSince.set(key, input.nowMs);
        }
      }
      for (const [key, since] of heldSince) {
        if (!input.buckets.has(key) || input.nowMs - since >= holdMs) heldSince.delete(key);
      }
      previous = input.buckets;
      previousOpenThreadKey = input.openThreadKey;
    },
    isHeld: (key: string) => heldSince.has(key),
  };
}

/**
 * Splits active threads into the status sections the list paints, in
 * `SIDEBAR_V2_STATUS_BUCKET_ORDER`, dropping empty ones. Working keeps the
 * Working shelf's order (by your last send, so runs finishing and resuming do
 * not move a row); the others list the thread that most recently came back to
 * you first.
 */
export function buildStatusThreadSections<
  TThread extends Parameters<typeof sortInboxThreadsByReturn>[0][number] &
    Parameters<typeof sortWorkingThreadsBySend>[0][number],
>(input: {
  readonly threads: readonly TThread[];
  readonly bucketOf: (thread: TThread) => SidebarV2StatusBucket;
  readonly returnedAt?: ((thread: TThread) => number | undefined) | undefined;
}): ReadonlyArray<SidebarV2StatusSection<TThread>> {
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
        header: null,
        status,
        threads:
          status === "working"
            ? sortWorkingThreadsBySend(threads)
            : sortInboxThreadsByReturn(threads, input.returnedAt),
      },
    ];
  });
}

/** Does a card's title step back inside a status section? Only the two
    sections that want you — Needs input and Completed — draw titles at full
    strength; Working and Idle recede, since the section header already says
    the agent is busy or the thread is quiet. This replaces the flat list's
    rule (`threadCardTitleRecedes`, which keeps Working bright and dims Done)
    only while status grouping is on. Route-active and selected rows never
    recede, as in that rule. */
export function statusSectionCardTitleRecedes(input: {
  readonly status: SidebarV2StatusBucket;
  readonly isActive: boolean;
  readonly isSelected: boolean;
}): boolean {
  if (input.isActive || input.isSelected) return false;
  return input.status === "working" || input.status === "idle";
}

/** How many logical projects a status section spans — one per project
    however many checkouts its cards come from. Threads whose project resolves
    to no group are not counted. */
export function statusSectionProjectCount(input: {
  readonly threads: readonly SidebarV2GroupableThread[];
  readonly projectRefIndex: ReadonlyMap<string, string>;
}): number {
  const projectKeys = new Set<string>();
  for (const thread of input.threads) {
    const projectKey = resolveThreadProjectKey(input.projectRefIndex, thread);
    if (projectKey !== undefined) projectKeys.add(projectKey);
  }
  return projectKeys.size;
}
