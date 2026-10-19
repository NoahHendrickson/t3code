// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * Threads a scheduled task launches stay off the sidebar's project groups
 * unless pinned, and the Scheduled row reports the live ones. A sync that
 * drops the roster filter floods the sidebar with automated runs again; one
 * that drops the server stamp silently turns the filter into a no-op.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  isScheduledRunOffSidebar,
  omitScheduledRunsFromSidebar,
  summarizeScheduledRunActivity,
} from "../custom/scheduledRunsOffSidebar";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const scheduledRow = readSibling("../custom/SidebarV2ScheduledRow.tsx");
const runsTable = readSibling("../custom/scheduled/ScheduledRunsTable.tsx");
const backButton = readSibling("../custom/scheduled/AutomationRunBackButton.tsx");
const chatHeader = readSibling("../components/chat/ChatHeader.tsx");
const contracts = readSibling("../../../../packages/contracts/src/orchestrationV2.ts");
const launch = readSibling("../../../server/src/orchestration-v2/ThreadLaunchService.ts");
const projectionStore = readSibling("../../../server/src/orchestration-v2/ProjectionStore.ts");

function shell(input: {
  readonly id: string;
  readonly scheduledTaskId?: string;
  readonly pinnedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly runtimeStatus?: "running" | "idle" | null;
  readonly hasPendingApprovals?: boolean;
}) {
  return {
    id: input.id,
    archivedAt: input.archivedAt ?? null,
    pinnedAt: input.pinnedAt ?? null,
    hasPendingApprovals: input.hasPendingApprovals ?? false,
    hasPendingUserInput: false,
    runtime:
      input.runtimeStatus == null
        ? null
        : ({ status: input.runtimeStatus } as unknown as NonNullable<
            Parameters<typeof isScheduledRunOffSidebar>[0]["runtime"]
          >),
    source: input.scheduledTaskId === undefined ? {} : { scheduledTaskId: input.scheduledTaskId },
  };
}

describe("fork guard: fork-scheduled-runs-off-sidebar", () => {
  it("keeps task-launched threads off the roster until pinned", () => {
    const threads = [
      shell({ id: "mine" }),
      shell({ id: "review", scheduledTaskId: "task:review" }),
      shell({ id: "kept", scheduledTaskId: "task:review", pinnedAt: "2026-10-19T00:00:00.000Z" }),
    ];
    expect(omitScheduledRunsFromSidebar(threads).map((thread) => thread.id)).toEqual([
      "mine",
      "kept",
    ]);
  });

  it("counts only the hidden runs still in motion or waiting on you", () => {
    expect(
      summarizeScheduledRunActivity([
        shell({ id: "a", scheduledTaskId: "t", runtimeStatus: "running" }),
        shell({ id: "b", scheduledTaskId: "t", hasPendingApprovals: true }),
        shell({ id: "c", scheduledTaskId: "t", runtimeStatus: "idle" }),
        shell({ id: "d", scheduledTaskId: "t", runtimeStatus: "running", archivedAt: "x" }),
        shell({ id: "e", scheduledTaskId: "t", runtimeStatus: "running", pinnedAt: "x" }),
        shell({ id: "f", runtimeStatus: "running" }),
      ]),
    ).toEqual({ working: 1, needsYou: 1 });
  });

  it("filters both roster call sites in Sidebar.tsx", () => {
    expect(sidebar).toContain("omitScheduledRunsFromSidebar(threads),\n      scopedProjectKeys,");
    expect(sidebar).toContain("omitScheduledRunsFromSidebar(threads),\n        /* fork:end");
  });

  it("reports live runs on the Scheduled row and opens All runs", () => {
    expect(scheduledRow).toContain("summarizeScheduledRunActivity(threads)");
    expect(scheduledRow).toContain('search: { view: "runs" }');
  });

  it("gives a run opened from Automations a way back", () => {
    expect(runsTable).toContain("state: OPENED_FROM_AUTOMATIONS_STATE,");
    expect(chatHeader).toContain("<AutomationRunBackButton />");
    expect(backButton).toContain("location.state.forkOpenedFromAutomations === true");
    expect(backButton).toContain("router.history.back()");
  });

  it("keeps the server stamping the launching task on the thread shell", () => {
    // AppThread, the thread shell, and the thread.create command.
    expect(contracts.match(/fork:begin fork-scheduled-runs-off-sidebar/g)?.length).toBe(3);
    expect(launch).toContain("scheduledTaskId: input.initialMessage.scheduledTaskId");
    expect(projectionStore).toContain("scheduledTaskId: projection.thread.scheduledTaskId");
    expect(projectionStore).toContain("scheduledTaskId: input.state.thread.scheduledTaskId");
  });
});
