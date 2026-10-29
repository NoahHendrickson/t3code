/**
 * What the sidebar's Automations row reports for the runs the roster no
 * longer shows — see `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * A hidden run surfaces here while it is working, while it waits on you, and
 * once it fails until you open it. Without the last one a run that dies (a
 * PR review whose worktree could not be created) would show up nowhere but
 * Run history.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";
import type { SidebarV2TopStatusMark } from "./SidebarV2StatusIndicator";
import { isScheduledRunOffSidebar, type ScheduledRunRosterFields } from "./scheduledRunsOffSidebar";

type ScheduledRunActivityShell = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Pick<EnvironmentThreadShell, "archivedAt" | "latestRun" | "lastVisitedAt"> &
  ScheduledRunRosterFields;

export interface ScheduledRunActivity {
  /** Hidden runs whose agent is still working. */
  readonly working: number;
  /** Hidden runs stopped on an approval or a question. */
  readonly needsYou: number;
  /** Hidden runs that failed and have not been opened since. */
  readonly failed: number;
}

/** Unlike the roster's unread rule, a run nobody has opened counts as unseen:
    nothing else would ever show it. */
function failureUnseen(thread: ScheduledRunActivityShell): boolean {
  const completedAt = thread.latestRun?.completedAt;
  if (!completedAt) return false;
  if (!thread.lastVisitedAt) return true;
  return Date.parse(completedAt) > Date.parse(thread.lastVisitedAt);
}

export type ScheduledRunActivityKind = "working" | "needsYou" | "failed";

/** The mark each bucket wears, on the row and on each run in its hover card. */
export const SCHEDULED_RUN_ACTIVITY_MARKS: Record<
  ScheduledRunActivityKind,
  SidebarV2TopStatusMark
> = {
  working: { label: "Running", mark: "working" },
  needsYou: { label: "Waiting on you", mark: "dot", tone: "approval" },
  failed: { label: "Failed", mark: "dot", tone: "failed" },
};

export type ScheduledRunActivityEntry<
  T extends ScheduledRunActivityShell = ScheduledRunActivityShell,
> = {
  readonly thread: T;
  readonly kind: ScheduledRunActivityKind;
};

/** The hidden runs the row counts, in roster order, each with the bucket it
    counts in — what the row's hover card lists. */
export function listScheduledRunActivity<T extends ScheduledRunActivityShell>(
  threads: ReadonlyArray<T>,
): Array<ScheduledRunActivityEntry<T>> {
  const runs: Array<ScheduledRunActivityEntry<T>> = [];
  for (const thread of threads) {
    if (thread.archivedAt !== null || !isScheduledRunOffSidebar(thread)) continue;
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working") runs.push({ thread, kind: "working" });
    else if (status === "approval" || status === "input") runs.push({ thread, kind: "needsYou" });
    else if ((status === "failed" || status === "limited") && failureUnseen(thread)) {
      runs.push({ thread, kind: "failed" });
    }
  }
  return runs;
}

export function summarizeScheduledRunActivity(
  runs: ReadonlyArray<ScheduledRunActivityEntry>,
): ScheduledRunActivity {
  let working = 0;
  let needsYou = 0;
  let failed = 0;
  for (const { kind } of runs) {
    if (kind === "working") working += 1;
    else if (kind === "needsYou") needsYou += 1;
    else failed += 1;
  }
  return { working, needsYou, failed };
}
