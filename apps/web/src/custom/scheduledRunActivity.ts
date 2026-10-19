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

export function summarizeScheduledRunActivity(
  threads: ReadonlyArray<ScheduledRunActivityShell>,
): ScheduledRunActivity {
  let working = 0;
  let needsYou = 0;
  let failed = 0;
  for (const thread of threads) {
    if (thread.archivedAt !== null || !isScheduledRunOffSidebar(thread)) continue;
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working") working += 1;
    else if (status === "approval" || status === "input") needsYou += 1;
    else if ((status === "failed" || status === "limited") && failureUnseen(thread)) failed += 1;
  }
  return { working, needsYou, failed };
}
