import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCollapsedThreadTabs,
  collapsedFilterSwitchTarget,
  DEFAULT_COLLAPSED_TAB_STATUSES,
  fitCollapsedThreadTabs,
  type CollapsedThreadTabStatus,
} from "./collapsedThreadTabsModel";
import { buildSidebarDraftShell } from "./sidebarV2DraftRows";
import { createSidebarV2CompletedHoldTracker } from "./sidebarV2StatusGrouping";

const environmentId = EnvironmentId.make("local");
const NOW = "2026-01-02T00:00:00.000Z";
const running = {
  status: "running" as const,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: null,
  updatedAt: NOW,
};

const shell = (id: string, projectId: string, createdAt: string) =>
  buildSidebarDraftShell({
    draft: {
      threadId: ThreadId.make(id),
      environmentId,
      projectId: ProjectId.make(projectId),
      logicalProjectKey: projectId,
      createdAt,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "main",
      worktreePath: null,
      envMode: "local",
      startFromOrigin: false,
      promotedTo: null,
    },
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  });

const project = (projectKey: string) => ({
  projectKey,
  displayName: projectKey,
  memberProjectRefs: [{ environmentId, projectId: projectKey }],
});

describe("buildCollapsedThreadTabs", () => {
  const threads = [
    { ...shell("asking", "p1", "2026-01-01T03:00:00.000Z"), hasPendingUserInput: true },
    { ...shell("working", "p2", "2026-01-01T01:00:00.000Z"), runtime: running },
    shell("idle", "p3", "2026-01-01T02:00:00.000Z"),
    {
      ...shell("snoozed", "p3", "2026-01-01T04:00:00.000Z"),
      runtime: running,
      snoozedUntil: "2026-01-03T00:00:00.000Z",
    },
    {
      ...shell("settled", "p3", "2026-01-01T05:00:00.000Z"),
      runtime: running,
      settledOverride: "settled" as const,
    },
  ];
  const build = (
    supported: boolean,
    statuses: readonly CollapsedThreadTabStatus[] = DEFAULT_COLLAPSED_TAB_STATUSES,
  ) =>
    buildCollapsedThreadTabs({
      threads,
      projectGroups: [project("p1"), project("p2"), project("p3")],
      statuses: new Set(statuses),
      localLastVisitedAtById: {},
      now: NOW,
      openThreadKey: null,
      holds: createSidebarV2CompletedHoldTracker(),
      supports: () => ({ settlement: supported, snooze: supported }),
    });

  it("orders needs-input before working whatever their age, with only their projects", () => {
    const { tabs, projects } = build(true);
    expect(tabs.map((tab) => [tab.thread.id, tab.projectKey])).toEqual([
      ["asking", "p1"],
      ["working", "p2"],
    ]);
    expect(projects.map((group) => group.projectKey)).toEqual(["p1", "p2"]);
  });

  it("adds idle threads after working, and drops statuses left out", () => {
    expect(build(true, ["input", "working", "idle"]).tabs.map((tab) => tab.thread.id)).toEqual([
      "asking",
      "working",
      "idle",
    ]);
    expect(build(true, ["working"]).tabs.map((tab) => tab.thread.id)).toEqual(["working"]);
  });

  it("keeps parked threads where the environment cannot park them, as the sidebar does", () => {
    expect(
      build(false)
        .tabs.map((tab) => tab.thread.id)
        .toSorted(),
    ).toEqual(["asking", "settled", "snoozed", "working"]);
  });
});

describe("collapsedFilterSwitchTarget", () => {
  const tab = (threadKey: string) => ({ threadKey });
  const [a, b, c] = [tab("a"), tab("b"), tab("c")];
  it.each([
    // [label, before, after, open, draftOpen, expected]
    ["opens the first tab when the filter hides the open tab", [a, b], [c], "a", false, c],
    ["stays when the open tab is still shown", [a, b], [b, a], "a", false, null],
    ["stays on a thread that never had a tab", [a, b], [c], "z", false, null],
    ["stays on the draft", [a, b], [c], null, true, null],
    ["has nowhere to go in an empty filter", [a], [], "a", false, null],
  ] as const)("%s", (_label, before, after, openThreadKey, draftOpen, expected) => {
    expect(collapsedFilterSwitchTarget({ before, after, openThreadKey, draftOpen })).toBe(expected);
  });
});

describe("fitCollapsedThreadTabs", () => {
  it.each([
    // [count, width, activeIndex, visible, overflow]
    [3, 0, -1, [0, 1, 2], []],
    // Three minimum tabs and their gaps fill the row exactly.
    [3, 3 * 112 + 2 * 6, -1, [0, 1, 2], []],
    // A pixel short, the last tab goes behind More.
    [3, 3 * 112 + 2 * 6 - 1, -1, [0, 1], [2]],
    // 500px holds three 118px steps beside More.
    [6, 500, -1, [0, 1, 2], [3, 4, 5]],
    [6, 500, 4, [0, 1, 4], [2, 3, 5]],
    [6, 60, 4, [], [0, 1, 2, 3, 4, 5]],
  ])("%i tabs in %ipx with the open one at %i", (count, width, activeIndex, visible, overflow) => {
    expect(fitCollapsedThreadTabs({ count, width, activeIndex })).toEqual({ visible, overflow });
  });
});
