/**
 * Threads a scheduled task launches live on the Scheduled page, not in the
 * sidebar's project groups — see
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * Automated runs such as PR reviews are nothing the user watches, and with
 * several PRs open they flood the roster. The server stamps the launching
 * task's id on the thread (a task bound to an existing thread never does),
 * so the rule is local: a launched thread is off the roster unless the user
 * pins it, which is the way back for a run they decide to work in. The
 * sidebar's Scheduled row counts the hidden ones that are still live.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";

type ScheduledRunShell = Pick<
  EnvironmentThreadShell,
  "archivedAt" | "pinnedAt" | "hasPendingApprovals" | "hasPendingUserInput" | "runtime"
> & {
  readonly source: { readonly scheduledTaskId?: string | undefined };
};

/** True for a thread a scheduled task launched that the user has not pinned. */
export function isScheduledRunOffSidebar(thread: ScheduledRunShell): boolean {
  return thread.source.scheduledTaskId !== undefined && thread.pinnedAt == null;
}

/** The sidebar roster without the threads the Scheduled page owns. */
export function omitScheduledRunsFromSidebar<T extends ScheduledRunShell>(
  threads: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return threads.some(isScheduledRunOffSidebar)
    ? threads.filter((thread) => !isScheduledRunOffSidebar(thread))
    : threads;
}

export interface ScheduledRunActivity {
  /** Hidden runs whose agent is still working. */
  readonly working: number;
  /** Hidden runs stopped on an approval or a question. */
  readonly needsYou: number;
}

/** What the Scheduled row reports for the runs the roster no longer shows. */
export function summarizeScheduledRunActivity(
  threads: ReadonlyArray<ScheduledRunShell>,
): ScheduledRunActivity {
  let working = 0;
  let needsYou = 0;
  for (const thread of threads) {
    if (thread.archivedAt !== null || !isScheduledRunOffSidebar(thread)) continue;
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working") working += 1;
    else if (status === "approval" || status === "input") needsYou += 1;
  }
  return { working, needsYou };
}
