// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * Threads an automation launches stay off the sidebar's project groups
 * unless pinned, and the Automations row reports the live ones. A sync that
 * drops the roster rule floods the sidebar with automated runs again; one
 * that drops the server stamp silently turns the rule into a no-op.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { ProviderInstanceId, RunId, ScheduledTaskId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { filterSidebarV2VisibleThreads } from "../components/Sidebar.logic";
import {
  listScheduledRunActivity,
  summarizeScheduledRunActivity,
} from "../custom/scheduledRunActivity";
import { makeThreadFixture } from "../test-fixtures";
import type { Thread } from "../types";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const runsTable = readSibling("../custom/scheduled/ScheduledRunsTable.tsx");
const backButton = readSibling("../custom/scheduled/AutomationRunBackButton.tsx");
const chatHeader = readSibling("../components/chat/ChatHeader.tsx");
const contracts = readSibling("../../../../packages/contracts/src/orchestrationV2.ts");
const launch = readSibling("../../../server/src/orchestration-v2/ThreadLaunchService.ts");
const projectionStore = readSibling("../../../server/src/orchestration-v2/ProjectionStore.ts");

const UPDATED_AT = "2026-10-19T12:00:00.000Z";

function runtime(status: "running" | "failed"): NonNullable<Thread["runtime"]> {
  return {
    status,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: null,
    lastError: null,
    updatedAt: UPDATED_AT,
  };
}

/** A run thread the automation `review` launched. */
function automationRun(id: string, overrides: Partial<Thread> = {}): Thread {
  const thread = makeThreadFixture({ id: id as Thread["id"], ...overrides });
  return {
    ...thread,
    source: { ...thread.source, scheduledTaskId: ScheduledTaskId.make("scheduled-task:review") },
  };
}

function failedRun(id: string, lastVisitedAt: string | null): Thread {
  return automationRun(id, {
    runtime: runtime("failed"),
    lastVisitedAt,
    latestRun: {
      runId: RunId.make(`run:${id}`),
      status: "failed",
      requestedAt: "2026-10-19T10:00:00.000Z",
      startedAt: "2026-10-19T10:00:00.000Z",
      completedAt: "2026-10-19T10:05:00.000Z",
      assistantMessageId: null,
    },
  });
}

describe("fork guard: fork-scheduled-runs-off-sidebar", () => {
  it("keeps automation runs off the roster until pinned", () => {
    const threads = [
      makeThreadFixture({ id: "mine" as Thread["id"] }),
      automationRun("review"),
      automationRun("kept", { pinnedAt: UPDATED_AT }),
    ];
    expect(
      filterSidebarV2VisibleThreads(threads, null, new Set()).map((thread) => thread.id),
    ).toEqual(["mine", "kept"]);
  });

  it("counts hidden runs in motion, waiting on you, or failed and unopened", () => {
    expect(
      summarizeScheduledRunActivity(
        listScheduledRunActivity([
          automationRun("working", { runtime: runtime("running") }),
          automationRun("approval", { hasPendingApprovals: true }),
          automationRun("idle"),
          failedRun("failed-never-opened", null),
          failedRun("failed-opened-after", "2026-10-19T11:00:00.000Z"),
          automationRun("archived", { runtime: runtime("running"), archivedAt: UPDATED_AT }),
          automationRun("pinned", { runtime: runtime("running"), pinnedAt: UPDATED_AT }),
          makeThreadFixture({ id: "mine" as Thread["id"], runtime: runtime("running") }),
        ]),
      ),
    ).toEqual({ working: 1, needsYou: 1, failed: 1 });
  });

  it("reports live runs on the Automations row and opens All runs", () => {
    expect(chromeRows).toContain("listScheduledRunActivity(threads)");
    expect(chromeRows).toContain('search: { view: "runs" }');
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
    expect(launch).toContain("{ scheduledTaskId: input.scheduledTaskId }");
    expect(projectionStore).toContain("scheduledTaskId: projection.thread.scheduledTaskId");
    expect(projectionStore).toContain("scheduledTaskId: input.state.thread.scheduledTaskId");
  });
});
