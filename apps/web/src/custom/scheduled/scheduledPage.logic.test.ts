import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  draftTriggerLabel,
  formatDuration,
  matchesTaskQuery,
  overlayRunStatus,
  presentRunStatus,
  runDurationSeconds,
  runPullRequest,
  validateScheduledPageSearch,
} from "./scheduledPage.logic";

describe("validateScheduledPageSearch", () => {
  it("keeps only the recognised keys and drops blanks", () => {
    expect(validateScheduledPageSearch({ env: " ", task: "", tab: "nope", view: "list" })).toEqual(
      {},
    );
    expect(validateScheduledPageSearch({ env: "e1", task: "t1", tab: "runs" })).toEqual({
      env: "e1",
      task: "t1",
      tab: "runs",
    });
  });

  it("treats the create form as a task and ignores the all-runs view while a task is open", () => {
    expect(validateScheduledPageSearch({ task: "new" })).toEqual({ task: "new" });
    expect(validateScheduledPageSearch({ view: "runs" })).toEqual({ view: "runs" });
    expect(validateScheduledPageSearch({ view: "runs", task: "t1" })).toEqual({ task: "t1" });
  });
});

describe("matchesTaskQuery", () => {
  const task = { title: "Review new PRs", prompt: "Check out the pull request" };
  it("matches title or prompt without case and keeps everything for a blank query", () => {
    expect(matchesTaskQuery(task, "")).toBe(true);
    expect(matchesTaskQuery(task, "  ")).toBe(true);
    expect(matchesTaskQuery(task, "review")).toBe(true);
    expect(matchesTaskQuery(task, "PULL REQUEST")).toBe(true);
    expect(matchesTaskQuery(task, "deploy")).toBe(false);
  });
});

describe("presentRunStatus", () => {
  it("collapses the run lifecycle into live and settled tones", () => {
    expect(presentRunStatus("completed")).toEqual({
      label: "Completed",
      tone: "success",
      live: false,
    });
    expect(presentRunStatus("failed").tone).toBe("error");
    expect(presentRunStatus("starting")).toEqual({ label: "Running", tone: "info", live: true });
    expect(presentRunStatus("waiting").tone).toBe("warning");
    expect(presentRunStatus("interrupted").tone).toBe("secondary");
    // No run row yet: the message is still queued behind the bound thread's turn.
    expect(presentRunStatus(null)).toEqual({ label: "Queued", tone: "secondary", live: true });
  });
});

describe("run duration", () => {
  it("measures request to completion and formats compactly", () => {
    expect(
      runDurationSeconds({
        requestedAt: "2026-10-12T14:00:00.000Z",
        completedAt: "2026-10-12T14:01:30.000Z",
      }),
    ).toBe(90);
    expect(runDurationSeconds({ requestedAt: "2026-10-12T14:00:00.000Z", completedAt: null })).toBe(
      null,
    );
    expect(
      runDurationSeconds({
        requestedAt: "2026-10-12T14:01:00.000Z",
        completedAt: "2026-10-12T14:00:00.000Z",
      }),
    ).toBe(null);
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3_720)).toBe("1h 2m");
  });
});

describe("overlayRunStatus", () => {
  it("uses the live thread status only for the same run", () => {
    expect(
      overlayRunStatus(
        { runId: RunId.make("r1"), status: "running" },
        { runId: RunId.make("r1"), status: "completed" },
      ),
    ).toBe("completed");
    expect(
      overlayRunStatus(
        { runId: RunId.make("r1"), status: "running" },
        { runId: RunId.make("r2"), status: "completed" },
      ),
    ).toBe("running");
    expect(
      overlayRunStatus(
        { runId: null, status: null },
        { runId: RunId.make("r2"), status: "running" },
      ),
    ).toBe(null);
  });
});

describe("draftTriggerLabel", () => {
  const draft = {
    scheduleMode: "fixed" as const,
    intervalMinutes: "30",
    timeOfDay: "09:00",
    weekdays: new Set<number>(),
  };

  it("reads a fixed time Monday-first, folding every day and the work week", () => {
    expect(draftTriggerLabel({ ...draft, weekdays: new Set([0, 1, 3]) })).toBe(
      "Mon, Wed, Sun at 09:00",
    );
    expect(draftTriggerLabel({ ...draft, weekdays: new Set([1, 2, 3, 4, 5]) })).toBe(
      "Weekdays at 09:00",
    );
    expect(draftTriggerLabel({ ...draft, weekdays: new Set([0, 1, 2, 3, 4, 5, 6]) })).toBe(
      "Daily at 09:00",
    );
  });

  it("names an interval only while the typed minutes are usable", () => {
    expect(draftTriggerLabel({ ...draft, scheduleMode: "interval" })).toBe("Every 30 min");
    expect(draftTriggerLabel({ ...draft, scheduleMode: "interval", intervalMinutes: "" })).toBe(
      "Every interval",
    );
  });

  it("puts a GitHub PR trigger ahead of the webhook it is stored as", () => {
    expect(draftTriggerLabel({ ...draft, scheduleMode: "webhook" })).toBe("On webhook");
    expect(draftTriggerLabel({ ...draft, scheduleMode: "webhook", githubPrOpened: true })).toBe(
      "GitHub PR opened",
    );
  });
});

describe("runPullRequest", () => {
  const commit = "a".repeat(40);
  const linked = {
    repository: "owner/app",
    number: 12,
    url: "https://github.com/owner/app/pull/12",
  };

  it("prefers the PR a GitHub trigger named over the thread's links", () => {
    expect(
      runPullRequest(
        `scheduled-task-message:task:webhook:delivery:github:task:owner/no3y:108:${commit}`,
        { pullRequests: [linked] },
      ),
    ).toEqual({
      number: 108,
      label: "owner/no3y #108",
      url: "https://github.com/owner/no3y/pull/108",
    });
  });

  it("falls back to the thread's linked, then branch, pull request", () => {
    const messageId = "scheduled-task-message:task:webhook:delivery-1";
    expect(runPullRequest(messageId, { pullRequests: [linked] })?.number).toBe(12);
    expect(runPullRequest(messageId, { pullRequests: [], branchPullRequest: linked })?.label).toBe(
      "owner/app #12",
    );
    expect(runPullRequest(messageId, { pullRequests: [] })).toBeNull();
    expect(runPullRequest(messageId, null)).toBeNull();
  });
});
