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
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { cloneElement, useCallback, type ReactElement } from "react";

import { useSidebar } from "~/components/ui/sidebar";

const SCHEDULED_TASKS_PATH = "/scheduled";

export function SidebarV2ScheduledRow(props: {
  readonly trigger: ReactElement<{ active?: boolean; onClick?: () => void }>;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnScheduledTasks = useLocation({
    select: (location) => location.pathname === SCHEDULED_TASKS_PATH,
  });
  const openScheduledTasks = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    void navigate({ to: SCHEDULED_TASKS_PATH });
  }, [isMobile, navigate, setOpenMobile]);
  return cloneElement(props.trigger, { active: isOnScheduledTasks, onClick: openScheduledTasks });
}
