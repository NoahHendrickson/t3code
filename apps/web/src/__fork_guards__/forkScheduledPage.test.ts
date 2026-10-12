// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-scheduled-page`.
 *
 * The /scheduled page, its run history RPC, and the door into it. A sync
 * that drops the route, the utility-page fence, or any registration point
 * of `scheduledTasks.listRuns` leaves either a dead sidebar row or a page
 * whose Run history tab errors on every open.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const route = readSibling("../routes/scheduled.tsx");
const routeTree = readSibling("../routeTree.gen.ts");
const mainAppLocation = readSibling("../components/sidebar/mainAppLocation.ts");
const page = readSibling("../custom/scheduled/ScheduledPage.tsx");
const detail = readSibling("../custom/scheduled/ScheduledTaskDetail.tsx");
const editor = readSibling("../custom/scheduled/ScheduledTaskEditor.tsx");
const runs = readSibling("../custom/scheduled/ScheduledRunsTable.tsx");
const chrome = readSibling("../custom/scheduled/scheduledPageChrome.tsx");
const palettes = readSibling("../theme.custom.palettes.css");
const contractsIndex = readSibling("../../../../packages/contracts/src/index.ts");
const rpc = readSibling("../../../../packages/contracts/src/rpc.ts");
const clientRuntime = readSibling("../../../../packages/client-runtime/src/state/server.ts");
const service = readSibling("../../../server/src/scheduledTasks/ScheduledTaskService.ts");
const ws = readSibling("../../../server/src/ws.ts");
const authorization = readSibling("../../../server/src/auth/RpcAuthorization.ts");
const instrumentation = readSibling("../../../server/src/observability/RpcInstrumentation.ts");
const sidebarDocs = readSibling("../../../../docs/user/thread-sidebar.md");

describe("fork guard: fork-scheduled-page", () => {
  it("registers /scheduled as a utility page with its own route", () => {
    expect(route).toContain('createFileRoute("/scheduled")');
    expect(route).toContain("validateSearch: validateScheduledPageSearch");
    expect(routeTree).toContain("from './routes/scheduled'");
    // The sidebar footer swaps to Back on utility pages; without this line
    // the page has no way home but the browser.
    expect(mainAppLocation).toContain('pathname === "/scheduled" ||');
    expect(mainAppLocation).toContain("fork:begin fork-scheduled-page");
  });

  it("lays the list out as heading, filters, and one table", () => {
    expect(page).toContain('data-testid="scheduled-new-task"');
    expect(page).not.toContain('data-testid="scheduled-starters"');
    expect(page).toContain('data-testid="scheduled-all-runs"');
    expect(page).toContain('aria-label="Search tasks"');
    expect(page).toContain('data-testid="scheduled-task-row"');
    // Active/Inactive reads like Cursor's status column, not a badge soup.
    expect(page).toContain('{task.enabled ? "Active" : "Inactive"}');
    // The page shell is the Usage page's, not a settings container.
    expect(page).toContain("<SidebarInset");
    expect(page).toContain("<WorkspacePageHeader");
    expect(page).not.toContain("SettingsPageContainer");
  });

  it("opens a task as a page with Settings and Run history tabs", () => {
    expect(detail).toContain('data-testid="scheduled-task-detail"');
    expect(detail).toContain('<Toggle value="settings">Settings</Toggle>');
    expect(detail).toContain('<Toggle value="runs">Run history</Toggle>');
    expect(detail).toContain('placeholder="Untitled task"');
    // The model lives inside the instructions card, where Cursor keeps it.
    expect(editor).toContain("<ScheduledTaskModelPicker");
    expect(editor).toContain("<ScheduledTriggerTabs");
    expect(editor).toContain('aria-label="Agent instructions"');
    // Both doors write the same row: the fork reuses upstream's draft logic.
    expect(detail).toContain('from "~/components/settings/scheduledTasksSettings.logic"');
    expect(detail).toContain("scheduleFromDraft(draft)");
    expect(detail).toContain('creationSource: "web"');
  });

  it("opens a run as the thread it is", () => {
    expect(runs).toContain('to: "/$environmentId/$threadId"');
    expect(runs).toContain("threadId: run.threadId");
    expect(runs).toContain("serverEnvironment.scheduledTaskRuns(");
    // The live shell overlays the snapshot only for the same run.
    expect(runs).toContain("overlayRunStatus(");
  });

  it("wires scheduledTasks.listRuns at every registration point", () => {
    expect(contractsIndex).toContain('export * from "./scheduledTaskRuns.ts"');
    expect(rpc).toContain('scheduledTasksListRuns: "scheduledTasks.listRuns"');
    expect(rpc).toContain(
      "WsScheduledTasksListRunsRpc = Rpc.make(WS_METHODS.scheduledTasksListRuns",
    );
    expect(rpc).toMatch(/\n\s+WsScheduledTasksListRunsRpc,\n/u);
    expect(service).toContain("readonly listRuns: (");
    expect(service).toContain("listRuns: (input) => listScheduledTaskRuns(sql, input)");
    expect(ws).toContain("[WS_METHODS.scheduledTasksListRuns]: (input) =>");
    expect(authorization).toContain(
      "[WS_METHODS.scheduledTasksListRuns]: AuthOrchestrationReadScope",
    );
    expect(instrumentation).toContain('[WS_METHODS.scheduledTasksListRuns]: "scheduledTasks"');
    expect(clientRuntime).toContain("tag: WS_METHODS.scheduledTasksListRuns");
    for (const source of [
      contractsIndex,
      rpc,
      clientRuntime,
      service,
      ws,
      authorization,
      instrumentation,
    ]) {
      expect(source).toContain("fork:begin fork-scheduled-page");
    }
  });

  it("tells users what the page is for", () => {
    expect(sidebarDocs).toContain("Run history");
    expect(sidebarDocs).toContain("All runs");
  });

  it("keeps the cards clipped and on Glass's wash", () => {
    // A hovered row painted square past the card's rounded corners.
    expect(chrome).toContain('"overflow-hidden rounded-xl border');
    expect(chrome).toContain('data-scheduled-card=""');
    expect(palettes).toContain("[data-scheduled-card] {");
  });

  it("draws Agent instructions as the chat composer", () => {
    // The composer stamps carry every palette's composer paint; a restyle
    // that drops them leaves a card that no longer matches the composer.
    expect(editor).toContain('data-fork-composer-vessel="true"');
    expect(editor).toContain('data-fork-composer-surface="true"');
    expect(editor).toContain('data-fork-composer-model-controls="true"');
    // Where it runs rides the context row as chips; the trigger opens from
    // the control row's leading slot, where the chat keeps its mode.
    expect(editor).toContain('data-fork-composer-context-row="true"');
    expect(editor).toContain("<RunsInPills");
    expect(editor).toContain('data-fork-composer-control-row-slot="left"');
    expect(editor).toContain("<TriggerPill");
  });
});
