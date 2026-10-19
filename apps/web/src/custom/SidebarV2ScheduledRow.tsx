/**
 * Sidebar V2's Scheduled row — the chrome door to every scheduled task across
 * every project and environment. See
 * `.fork/customizations.yaml#fork-sidebar-scheduled-row`.
 *
 * Usage beside it opens a popover because a dashboard is something you
 * glance at over the thread. Scheduled tasks are a managed list with a
 * page per task and a run history, so this row goes to the fork's
 * /scheduled page (custom/scheduled) instead of stacking that inside a
 * popover. Escape on that page returns to the thread.
 *
 * The row owns its own router reads so Sidebar.tsx's fence stays at the
 * call site: it lights while the scheduled-tasks page is open and closes the
 * mobile sheet before navigating, the way the footer's utility items do.
 *
 * Threads a task launched are off the project groups
 * (custom/scheduledRunsOffSidebar), so this row reports the live ones: a
 * count with the rain while they work, or the amber dot once one is waiting
 * on you. While any are live the row opens All runs, which lists newest first.
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { cloneElement, useCallback, useMemo, type ReactElement, type ReactNode } from "react";

import { useSidebar } from "~/components/ui/sidebar";
import { useThreadShells } from "~/state/entities";
import { summarizeScheduledRunActivity } from "./scheduledRunsOffSidebar";
import { SidebarV2StatusMark } from "./SidebarV2StatusIndicator";

const SCHEDULED_TASKS_PATH = "/scheduled";

export function SidebarV2ScheduledRow(props: {
  readonly trigger: ReactElement<{
    active?: boolean;
    onClick?: () => void;
    ariaLabel?: string;
    trailing?: ReactNode;
  }>;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnScheduledTasks = useLocation({
    select: (location) => location.pathname === SCHEDULED_TASKS_PATH,
  });
  const threads = useThreadShells();
  const { working, needsYou } = useMemo(() => summarizeScheduledRunActivity(threads), [threads]);
  const live = working + needsYou;
  const openScheduledTasks = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    void navigate(
      live > 0
        ? { to: SCHEDULED_TASKS_PATH, search: { view: "runs" } }
        : { to: SCHEDULED_TASKS_PATH },
    );
  }, [isMobile, live, navigate, setOpenMobile]);
  const activityLabel = [
    working > 0 ? `${working} running` : null,
    needsYou > 0 ? `${needsYou} waiting on you` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return cloneElement(props.trigger, {
    active: isOnScheduledTasks,
    onClick: openScheduledTasks,
    ...(live > 0
      ? {
          ariaLabel: `Automations — ${activityLabel}`,
          trailing: (
            <span
              className="flex shrink-0 items-center gap-1.5 text-[0.75rem] leading-4 text-muted-foreground tabular-nums"
              data-testid="sidebar-v2-scheduled-activity"
            >
              <span aria-hidden>{live}</span>
              <SidebarV2StatusMark
                status={
                  needsYou > 0
                    ? { label: activityLabel, mark: "dot", tone: "approval" }
                    : { label: activityLabel, mark: "rain" }
                }
                rainSeed="sidebar-v2-scheduled"
              />
            </span>
          ),
        }
      : {}),
  });
}
