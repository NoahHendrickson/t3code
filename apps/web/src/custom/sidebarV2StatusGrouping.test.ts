import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarV2CardStatusKind } from "./sidebarV2CardStatus";
import { createProjectRefIndex } from "./sidebarV2ProjectGrouping";
import { threadCardTitleRecedes } from "./sidebarV2RowPolicy";
import {
  countSidebarV2Projects,
  createSidebarV2CompletedHoldTracker,
  groupSidebarV2StatusSections,
  sidebarV2StatusBucketForKind,
  type SidebarV2StatusBucket,
} from "./sidebarV2StatusGrouping";

const HOLD_MS = 5 * 60_000;

/** Applies one rebuild and returns the painted bucket of each key. */
function apply(
  tracker: ReturnType<typeof createSidebarV2CompletedHoldTracker>,
  buckets: Record<string, SidebarV2StatusBucket>,
  nowMs: number,
  openThreadKey: string | null = null,
) {
  return tracker.apply({ buckets: new Map(Object.entries(buckets)), openThreadKey, nowMs });
}

describe("createSidebarV2CompletedHoldTracker", () => {
  it("holds nothing on the first rebuild, so mounting never reshuffles", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    expect(apply(tracker, { a: "idle" }, 0).get("a")).toBe("idle");
  });

  it("holds a read completion until the delay passes after you leave", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "done" }, 0);
    // Opened and read: the dot clears, the card stays in Completed.
    expect(apply(tracker, { a: "idle" }, 1_000, "a").get("a")).toBe("done");
    // Still open long past the delay: never released while you are on it.
    expect(apply(tracker, { a: "idle" }, 1_000 + HOLD_MS * 3, "a").get("a")).toBe("done");
    // Left at t; released only once the delay has run from there.
    const leftAt = 2_000 + HOLD_MS * 3;
    apply(tracker, { a: "idle" }, leftAt, null);
    expect(apply(tracker, { a: "idle" }, leftAt + HOLD_MS - 1).get("a")).toBe("done");
    expect(apply(tracker, { a: "idle" }, leftAt + HOLD_MS).get("a")).toBe("idle");
  });

  it("holds a run that finished while you were watching it", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "working" }, 0, "a");
    expect(apply(tracker, { a: "idle" }, 1_000, "a").get("a")).toBe("done");
  });

  it("keeps a hold while the project scope hides the thread for a moment", () => {
    // The list is scope-filtered before it gets here: a thread missing from
    // one rebuild is usually scoped out, not gone.
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "done" }, 0);
    apply(tracker, { a: "idle" }, 1_000);
    apply(tracker, {}, 2_000);
    expect(apply(tracker, { a: "idle" }, 3_000).get("a")).toBe("done");
  });

  it("drops the hold as soon as the thread moves again", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "done" }, 0);
    apply(tracker, { a: "idle" }, 1_000);
    apply(tracker, { a: "working" }, 2_000);
    expect(apply(tracker, { a: "working" }, 3_000).get("a")).toBe("working");
  });

  it("does not start a hold for an idle thread you merely open", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "idle" }, 0);
    expect(apply(tracker, { a: "idle" }, 1_000, "a").get("a")).toBe("idle");
  });

  it("forgets everything when reset, and starts again from a baseline", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    apply(tracker, { a: "done" }, 0);
    apply(tracker, { a: "idle" }, 1_000);
    tracker.reset();
    expect(apply(tracker, { a: "idle" }, 2_000).get("a")).toBe("idle");
  });
});

describe("resolveSidebarV2CardStatusKind", () => {
  const kind = (over: Partial<Parameters<typeof resolveSidebarV2CardStatusKind>[0]>) =>
    resolveSidebarV2CardStatusKind({
      status: "ready",
      isUnread: false,
      isWoke: false,
      hasPendingBackgroundTasks: false,
      ...over,
    });

  it("lets live and blocked statuses outrank read state", () => {
    expect(kind({ status: "approval", isUnread: true, isWoke: true })).toBe("approval");
    expect(kind({ status: "waiting", hasPendingBackgroundTasks: true })).toBe("waiting");
  });

  it("ranks woke over done, and both over a commands-only roster", () => {
    expect(kind({ isWoke: true, isUnread: true })).toBe("woke");
    expect(kind({ isUnread: true, hasPendingBackgroundTasks: true })).toBe("done");
    expect(kind({ hasPendingBackgroundTasks: true })).toBe("monitoring");
    expect(kind({})).toBeNull();
  });
});

describe("sidebarV2StatusBucketForKind", () => {
  it("puts anything waiting on you, failures included, in Needs input", () => {
    for (const entry of ["approval", "input", "failed", "limited"] as const) {
      expect(sidebarV2StatusBucketForKind(entry)).toBe("input");
    }
  });

  it("treats a woken snooze as a result to look at, not a blocked agent", () => {
    expect(sidebarV2StatusBucketForKind("woke")).toBe("done");
  });

  it("keeps background work that will wake the agent in Working", () => {
    expect(sidebarV2StatusBucketForKind("waiting")).toBe("working");
  });

  it("files a commands-only roster under Idle, unlike its card mark", () => {
    expect(sidebarV2StatusBucketForKind("monitoring")).toBe("idle");
  });
});

describe("groupSidebarV2StatusSections", () => {
  const environmentId = EnvironmentId.make("local");
  const thread = (
    id: string,
    createdAt: string,
    options: { sentAt?: string; projectId?: string } = {},
  ) => ({
    id: ThreadId.make(id),
    environmentId,
    projectId: ProjectId.make(options.projectId ?? "p1"),
    createdAt,
    unsettledAt: null,
    latestRun: null,
    latestUserAuthoredMessageAt: options.sentAt ?? null,
  });
  const projectRefIndex = createProjectRefIndex([
    {
      projectKey: "one",
      displayName: "One",
      memberProjectRefs: [{ environmentId, projectId: "p1" }],
    },
    {
      projectKey: "two",
      displayName: "Two",
      memberProjectRefs: [{ environmentId, projectId: "p2" }],
    },
  ]);

  it("orders sections input, done, working, idle and drops empty ones", () => {
    const result = groupSidebarV2StatusSections({
      threads: [
        thread("idle", "2026-01-01T00:00:00.000Z"),
        thread("working", "2026-01-01T00:00:00.000Z"),
        thread("input", "2026-01-01T00:00:00.000Z"),
      ],
      bucketOf: (entry) => entry.id as SidebarV2StatusBucket,
      projectRefIndex,
    });
    expect(result.map((section) => section.status)).toEqual(["input", "working", "idle"]);
    expect(result.every((section) => section.kind === "status")).toBe(true);
  });

  it("lists Working by your last send and the rest newest return first", () => {
    const result = groupSidebarV2StatusSections({
      threads: [
        thread("old-send", "2026-01-01T00:00:00.000Z", { sentAt: "2026-01-02T00:00:00.000Z" }),
        thread("new-send", "2026-01-01T00:00:00.000Z", { sentAt: "2026-01-03T00:00:00.000Z" }),
        thread("older", "2026-01-01T00:00:00.000Z"),
        thread("newer", "2026-01-05T00:00:00.000Z"),
      ],
      bucketOf: (entry) => (entry.id.endsWith("send") ? "working" : "idle"),
      projectRefIndex,
    });
    expect(result.map((section) => section.threads.map((entry) => entry.id))).toEqual([
      ["new-send", "old-send"],
      ["newer", "older"],
    ]);
  });

  it("counts each section's cards and projects while the section is whole", () => {
    const [section] = groupSidebarV2StatusSections({
      threads: [
        thread("a", "2026-01-01T00:00:00.000Z", { projectId: "p1" }),
        thread("b", "2026-01-01T00:00:00.000Z", { projectId: "p2" }),
        thread("c", "2026-01-01T00:00:00.000Z", { projectId: "p1" }),
      ],
      bucketOf: () => "idle",
      projectRefIndex,
    });
    expect(section?.threadCount).toBe(3);
    expect(section?.projectCount).toBe(2);
  });
});

describe("countSidebarV2Projects", () => {
  it("counts each logical project once and skips unresolved ones", () => {
    // "web" spans two checkouts; cards from either are one project.
    const projectRefIndex = createProjectRefIndex([
      {
        projectKey: "web",
        displayName: "web",
        memberProjectRefs: [
          { environmentId: "local", projectId: "p1" },
          { environmentId: "local", projectId: "p2" },
        ],
      },
      {
        projectKey: "api",
        displayName: "api",
        memberProjectRefs: [{ environmentId: "local", projectId: "p3" }],
      },
    ]);
    const at = (projectId: string) => ({
      environmentId: EnvironmentId.make("local"),
      projectId: ProjectId.make(projectId),
    });
    expect(
      countSidebarV2Projects([at("p3"), at("p2"), at("gone"), at("p1")], projectRefIndex),
    ).toBe(2);
  });
});

describe("threadCardTitleRecedes under a status section", () => {
  const recedes = (statusSection: SidebarV2StatusBucket, isActive = false, isSelected = false) =>
    threadCardTitleRecedes({ isDone: false, isIdle: false, isActive, isSelected, statusSection });

  it("keeps only Needs input and Completed titles bright", () => {
    expect(recedes("input")).toBe(false);
    expect(recedes("done")).toBe(false);
    expect(recedes("working")).toBe(true);
    expect(recedes("idle")).toBe(true);
  });

  it("never dims the open or selected card", () => {
    expect(recedes("idle", true)).toBe(false);
    expect(recedes("working", false, true)).toBe(false);
  });
});
