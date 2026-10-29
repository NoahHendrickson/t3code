import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ScheduledTask, githubPrRunContext } from "@t3tools/contracts";
import {
  automationScheduleFromDraft,
  automationTaskToDraft,
} from "../custom/scheduled/githubAutomation.logic";

const task = Schema.decodeSync(ScheduledTask)({
  id: "scheduled-task:test",
  title: "Review PRs",
  prompt: "Review for bugs",
  enabled: true,
  schedule: {
    type: "webhook",
    github: {
      repositories: [
        { projectId: "d2", nameWithOwner: "owner/d2", defaultBranch: "main", hookId: 1 },
        { projectId: "no3y", nameWithOwner: "owner/no3y", defaultBranch: "custom", hookId: 2 },
      ],
    },
    signature: { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" },
  },
  projectId: "d2",
  threadId: null,
  workspaceStrategy: { type: "worktree", baseRef: "main" },
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: "never",
  lastRunError: null,
  runCount: 0,
});

describe("fork guard: GitHub PR automation", () => {
  it("round-trips multi-repository selection without asking users for webhook credentials", () => {
    const draft = automationTaskToDraft(task);
    expect(draft.githubPrOpened).toBe(true);
    expect(draft.githubProjectIds).toEqual(["d2", "no3y"]);
    expect(automationScheduleFromDraft(draft)).toEqual({
      type: "webhook",
      github: { repositories: [{ projectId: "d2" }, { projectId: "no3y" }] },
    });
  });
  it("allows returning to a custom webhook explicitly", () => {
    const draft = automationTaskToDraft(task);
    expect(automationScheduleFromDraft({ ...draft, githubPrOpened: false })).toMatchObject({
      type: "webhook",
      github: null,
    });
    expect(
      automationScheduleFromDraft({ ...draft, githubPrOpened: false, scheduleMode: "interval" }),
    ).toEqual({ type: "interval", everyMs: 900000 });
  });
  it("retains the triggering repository, PR and commit independently of the current thread title", () => {
    const commit = "a".repeat(40);
    expect(
      githubPrRunContext(
        `scheduled-task-message:scheduled-task:test:webhook:delivery:github:scheduled-task:test:owner/no3y:108:${commit}`,
      ),
    ).toEqual({ label: "owner/no3y #108", url: "https://github.com/owner/no3y/pull/108", commit });
    expect(githubPrRunContext("scheduled-task-message:task:123:manual")).toBeNull();
  });
});
