/** Which threads the collapsed-sidebar tabs show (fork-collapsed-thread-tabs): Needs input,
 * Completed and Working, in that order, from status grouping's own pipeline so a tab and its sidebar
 * card always agree, Completed hold included. */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";

import type { SidebarV2GroupableProject } from "./sidebarV2ProjectGrouping";
import {
  buildSidebarV2StatusSections,
  type SidebarV2CompletedHoldTracker,
  type SidebarV2StatusBucket,
} from "./sidebarV2StatusGrouping";

const TAB_BUCKETS: ReadonlySet<SidebarV2StatusBucket> = new Set(["input", "done", "working"]);

export interface CollapsedThreadTab {
  readonly thread: EnvironmentThreadShell;
  readonly threadKey: string;
  readonly projectKey: string | null;
}

export function buildCollapsedThreadTabs<TProject extends SidebarV2GroupableProject>(input: {
  /** Already filtered to the threads the sidebar lists (filterSidebarV2VisibleThreads). */
  readonly threads: readonly EnvironmentThreadShell[];
  readonly projectGroups: readonly TProject[];
  readonly localLastVisitedAtById: Readonly<Record<string, string>>;
  readonly now: string;
  readonly openThreadKey: string | null;
  readonly holds: SidebarV2CompletedHoldTracker;
}): { readonly tabs: CollapsedThreadTab[]; readonly projects: TProject[] } {
  const live = input.threads.filter(
    (thread) =>
      thread.settledOverride !== "settled" && !effectiveSnoozed(thread, { now: input.now }),
  );
  const sections = buildSidebarV2StatusSections({
    threads: live,
    localLastVisitedAtById: input.localLastVisitedAtById,
    now: input.now,
    openThreadKey: input.openThreadKey,
    holds: input.holds,
    isDraft: () => false,
  });
  const projectKeyByRef = new Map<string, string>();
  for (const group of input.projectGroups) {
    for (const ref of group.memberProjectRefs) {
      projectKeyByRef.set(`${ref.environmentId}:${ref.projectId}`, group.projectKey);
    }
  }
  const tabs = sections
    .filter((section) => TAB_BUCKETS.has(section.status))
    .flatMap((section) => section.threads)
    .map((thread) => ({
      thread,
      threadKey: scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      projectKey: projectKeyByRef.get(`${thread.environmentId}:${thread.projectId}`) ?? null,
    }));
  const projectKeys = new Set(tabs.map((tab) => tab.projectKey));
  return {
    tabs,
    projects: input.projectGroups.filter((group) => projectKeys.has(group.projectKey)),
  };
}

/** Geometry the strip's classes draw: min-w-[112px] tabs, gap-1.5, a w-[72px] More button,
    and the size-7 New agent button that always ends the row. */
const COLLAPSED_TAB_MIN_WIDTH = 112;
const COLLAPSED_TAB_GAP = 6;
const COLLAPSED_TAB_MORE_WIDTH = 72;
const COLLAPSED_TAB_NEW_WIDTH = 28;

/**
 * How many tabs fit at their minimum width, the rest going behind More. The open
 * thread takes the last visible slot when it would overflow; with no slot at all (under
 * about 224px), More and New agent keep the room, and the header still names the thread.
 * An unmeasured row (width 0) shows every tab.
 */
export function fitCollapsedThreadTabs(input: {
  readonly count: number;
  readonly width: number;
  readonly activeIndex: number;
}): { readonly visible: number[]; readonly overflow: number[] } {
  const all = Array.from({ length: input.count }, (_, index) => index);
  const step = COLLAPSED_TAB_MIN_WIDTH + COLLAPSED_TAB_GAP;
  // The New agent button and its gap always take their share.
  const width = input.width - COLLAPSED_TAB_NEW_WIDTH - COLLAPSED_TAB_GAP;
  if (input.width <= 0 || input.count * step - COLLAPSED_TAB_GAP <= width) {
    return { visible: all, overflow: [] };
  }
  const fit = Math.max(0, Math.floor((width - COLLAPSED_TAB_MORE_WIDTH) / step));
  const visible = all.slice(0, fit);
  if (fit > 0 && input.activeIndex >= fit) visible[fit - 1] = input.activeIndex;
  const shown = new Set(visible);
  return { visible, overflow: all.filter((index) => !shown.has(index)) };
}
