// @effect-diagnostics nodeBuiltinImport:off
// Fork guard for .fork/customizations.yaml#fork-automation-runs-in-sidebar: a sync that drops
// the column, the save, or the launch opt-out leaves the switch while every run stays hidden.

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const server = "../../../server/src/";
const contracts = readSibling("../../../../packages/contracts/src/scheduledTask.ts");
const sqlite = readSibling(`${server}persistence/Sqlite.ts`);
const forkSchema = readSibling(`${server}persistence/forkSchema.ts`);
const service = readSibling(`${server}scheduledTasks/ScheduledTaskService.ts`);
const launch = readSibling(`${server}orchestration-v2/ThreadLaunchService.ts`);
const detail = readSibling("../custom/scheduled/ScheduledTaskDetail.tsx");
const draft = readSibling("../custom/scheduled/githubAutomation.logic.ts");

describe("fork guard: automation runs in the sidebar", () => {
  it("stores the flag on the task without a migration", () => {
    expect(contracts.match(/fork:begin fork-automation-runs-in-sidebar/g)?.length).toBe(2);
    expect(sqlite).toContain("yield* ensureForkSchema();");
    expect(forkSchema).toContain("ADD COLUMN fork_show_in_sidebar");
    // Both explicit-column reads, the insert, and the conflict update.
    expect(service.match(/fork_show_in_sidebar/g)?.length).toBeGreaterThanOrEqual(5);
    expect(service).toContain(
      "showInSidebar: input.showInSidebar ?? existingTask?.showInSidebar ?? false",
    );
  });

  it("launches a flagged task's runs without the thread stamp", () => {
    expect(service).toContain("...(active.showInSidebar === true ? { listInSidebar: true } : {})");
    expect(launch).toContain("input.listInSidebar === true");
  });

  it("offers the switch on the automation page", () => {
    expect(draft).toContain("showInSidebar: task.showInSidebar === true");
    expect(detail).toContain('id="scheduled-task-show-in-sidebar"');
    expect(detail).toContain("showInSidebar: draft.showInSidebar === true");
  });
});
