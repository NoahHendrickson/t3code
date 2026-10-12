// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-sidebar-scheduled-row`.
 *
 * The V2 sidebar carries a Scheduled row under Usage that opens the
 * fork's /scheduled page. A sync that drops the row, moves it above
 * Usage, or renames the route it targets leaves scheduled tasks reachable
 * only through Settings again.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const scheduledRow = readSibling("../custom/SidebarV2ScheduledRow.tsx");
const sidebar = readSibling("../components/Sidebar.tsx");
const route = readSibling("../routes/scheduled.tsx");
const mainAppLocation = readSibling("../components/sidebar/mainAppLocation.ts");
const sidebarDocs = readSibling("../../../../docs/user/thread-sidebar.md");

describe("fork guard: fork-sidebar-scheduled-row", () => {
  it("renders Scheduled as the chrome row directly under Usage", () => {
    expect(chromeRows).toContain("<SidebarV2ScheduledRow");
    expect(chromeRows).toContain('testId="sidebar-v2-scheduled"');
    expect(chromeRows).toContain('label="Scheduled"');
    expect(chromeRows).toContain("icon={CalendarClockIcon}");
    const usageAt = chromeRows.indexOf('testId="sidebar-v2-usage"');
    const scheduledAt = chromeRows.indexOf('testId="sidebar-v2-scheduled"');
    expect(usageAt).toBeGreaterThan(-1);
    expect(scheduledAt).toBeGreaterThan(usageAt);
    // Both rows sit in the one action group, so nothing between them picks
    // up inter-group padding.
    expect(chromeRows.slice(usageAt, scheduledAt)).not.toContain("</SidebarGroup>");
  });

  it("navigates to the fork's scheduled page", () => {
    expect(scheduledRow).toContain('const SCHEDULED_TASKS_PATH = "/scheduled"');
    expect(scheduledRow).toContain("navigate({ to: SCHEDULED_TASKS_PATH })");
    expect(route).toContain('createFileRoute("/scheduled")');
    // The row is a door, not a second list: nothing from the settings page
    // is re-rendered in the sidebar.
    expect(scheduledRow).not.toContain("ScheduledTasksSettings");
    expect(scheduledRow).not.toContain("scheduledTasksLive");
  });

  it("lights while its page is open and closes the mobile sheet first", () => {
    expect(scheduledRow).toContain("location.pathname === SCHEDULED_TASKS_PATH");
    expect(scheduledRow).toContain("active: isOnScheduledTasks");
    expect(scheduledRow).toContain("if (isMobile) setOpenMobile(false);");
    // Utility pages swap the footer for Back, so the row's destination
    // keeps a way home without the sidebar growing a second control.
    expect(mainAppLocation).toContain('pathname === "/scheduled" ||');
  });

  it("keeps Sidebar.tsx out of it", () => {
    // The row owns its router reads so the chrome call site in Sidebar.tsx
    // does not grow a prop for it; a sync has nothing new to conflict on.
    expect(sidebar).not.toContain("onScheduled");
    expect(sidebar).not.toContain("SidebarV2ScheduledRow");
  });

  it("tells users where the row goes", () => {
    expect(sidebarDocs).toContain("**Scheduled** below **Usage**");
    expect(sidebarDocs).toContain("fork:begin fork-sidebar-scheduled-row");
  });
});
