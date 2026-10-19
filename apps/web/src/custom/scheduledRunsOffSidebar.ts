/**
 * Threads an automation launches live on the Automations page, not in the
 * sidebar's project groups — see
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * Automated runs such as PR reviews are nothing the user watches, and with
 * several PRs open they flood the roster. The server stamps the launching
 * task's id on the thread (an automation bound to an existing thread never
 * does), so the rule is local: a launched thread is off the roster unless the
 * user pins it, which is the way back for a run they decide to work in.
 * `filterSidebarV2VisibleThreads` applies it, beside the subagent rule, so
 * every roster caller honors it.
 *
 * No imports from the sidebar here: Sidebar.logic depends on this module.
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

/** Optional so roster callers that never carry a shell still type-check. */
export interface ScheduledRunRosterFields {
  readonly pinnedAt?: string | null | undefined;
  readonly source?: Pick<OrchestrationV2ThreadShell, "scheduledTaskId"> | undefined;
}

/** True for a thread an automation launched that the user has not pinned. */
export function isScheduledRunOffSidebar(thread: ScheduledRunRosterFields): boolean {
  return thread.source?.scheduledTaskId !== undefined && thread.pinnedAt == null;
}
