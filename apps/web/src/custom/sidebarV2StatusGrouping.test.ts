import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildStatusThreadSections,
  createSidebarV2CompletedHoldTracker,
  sidebarV2StatusBucketForTopStatus,
  statusSectionCardTitleRecedes,
  statusSectionProjectCount,
  type SidebarV2StatusBucket,
} from "./sidebarV2StatusGrouping";
import { createProjectRefIndex } from "./sidebarV2ProjectGrouping";

const HOLD_MS = 5 * 60_000;

function observe(
  tracker: ReturnType<typeof createSidebarV2CompletedHoldTracker>,
  buckets: Record<string, SidebarV2StatusBucket>,
  nowMs: number,
  openThreadKey: string | null = null,
) {
  tracker.observe({ buckets: new Map(Object.entries(buckets)), openThreadKey, nowMs });
}

describe("createSidebarV2CompletedHoldTracker", () => {
  it("holds nothing on the first observation, so mounting never reshuffles", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "idle" }, 0);
    expect(tracker.isHeld("a")).toBe(false);
  });

  it("holds a read completion until the delay passes after you leave", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "done" }, 0);
    // Opened and read: the dot clears, the card stays in Completed.
    observe(tracker, { a: "idle" }, 1_000, "a");
    expect(tracker.isHeld("a")).toBe(true);
    // Still open long past the delay: never released while you are on it.
    observe(tracker, { a: "idle" }, 1_000 + HOLD_MS * 3, "a");
    expect(tracker.isHeld("a")).toBe(true);
    // Left at t; released only once the delay has run from there.
    const leftAt = 2_000 + HOLD_MS * 3;
    observe(tracker, { a: "idle" }, leftAt, null);
    observe(tracker, { a: "idle" }, leftAt + HOLD_MS - 1);
    expect(tracker.isHeld("a")).toBe(true);
    observe(tracker, { a: "idle" }, leftAt + HOLD_MS);
    expect(tracker.isHeld("a")).toBe(false);
  });

  it("holds a run that finished while you were watching it", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "working" }, 0, "a");
    observe(tracker, { a: "idle" }, 1_000, "a");
    expect(tracker.isHeld("a")).toBe(true);
  });

  it("drops the hold as soon as the thread moves again", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "done" }, 0);
    observe(tracker, { a: "idle" }, 1_000);
    observe(tracker, { a: "working" }, 2_000);
    observe(tracker, { a: "working" }, 3_000);
    expect(tracker.isHeld("a")).toBe(false);
  });

  it("does not start a hold for an idle thread you merely open", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "idle" }, 0);
    observe(tracker, { a: "idle" }, 1_000, "a");
    expect(tracker.isHeld("a")).toBe(false);
  });

  it("forgets everything when reset", () => {
    const tracker = createSidebarV2CompletedHoldTracker(HOLD_MS);
    observe(tracker, { a: "done" }, 0);
    observe(tracker, { a: "idle" }, 1_000);
    tracker.observe(null);
    expect(tracker.isHeld("a")).toBe(false);
    // And the next observation is a fresh baseline.
    observe(tracker, { a: "idle" }, 2_000);
    expect(tracker.isHeld("a")).toBe(false);
  });
});

describe("sidebarV2StatusBucketForTopStatus", () => {
  it("puts anything waiting on you, failures included, in Needs input", () => {
    for (const kind of ["approval", "input", "failed", "limited"] as const) {
      expect(sidebarV2StatusBucketForTopStatus(kind)).toBe("input");
    }
  });

  it("treats a woken snooze as a result to look at, not a blocked agent", () => {
    expect(sidebarV2StatusBucketForTopStatus("woke")).toBe("done");
  });

  it("keeps background work in Working", () => {
    expect(sidebarV2StatusBucketForTopStatus("waiting")).toBe("working");
  });
});

describe("buildStatusThreadSections", () => {
  const environmentId = EnvironmentId.make("local");
  const thread = (id: string, createdAt: string, sentAt: string | null = null) => ({
    id: ThreadId.make(id),
    environmentId,
    createdAt,
    unsettledAt: null,
    latestRun: null,
    latestUserAuthoredMessageAt: sentAt,
  });

  it("orders sections input, done, working, idle and drops empty ones", () => {
    const threads = [
      thread("idle", "2026-01-01T00:00:00.000Z"),
      thread("working", "2026-01-01T00:00:00.000Z"),
      thread("input", "2026-01-01T00:00:00.000Z"),
    ];
    const result = buildStatusThreadSections({
      threads,
      bucketOf: (entry) => entry.id as SidebarV2StatusBucket,
    });
    expect(result.map((section) => section.status)).toEqual(["input", "working", "idle"]);
    expect(result.every((section) => section.header === null)).toBe(true);
  });

  it("lists Working by your last send and the rest newest return first", () => {
    const result = buildStatusThreadSections({
      threads: [
        thread("old-send", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"),
        thread("new-send", "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z"),
        thread("older", "2026-01-01T00:00:00.000Z"),
        thread("newer", "2026-01-05T00:00:00.000Z"),
      ],
      bucketOf: (entry) => (entry.id.endsWith("send") ? "working" : "idle"),
    });
    expect(result.map((section) => section.threads.map((entry) => entry.id))).toEqual([
      ["new-send", "old-send"],
      ["newer", "older"],
    ]);
  });
});

describe("statusSectionCardTitleRecedes", () => {
  const recedes = (status: SidebarV2StatusBucket, isActive = false, isSelected = false) =>
    statusSectionCardTitleRecedes({ status, isActive, isSelected });

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

describe("statusSectionProjectCount", () => {
  const group = (projectKey: string, refs: ReadonlyArray<[string, string]>) => ({
    projectKey,
    displayName: projectKey,
    memberProjectRefs: refs.map(([environmentId, projectId]) => ({ environmentId, projectId })),
  });
  const at = (environmentId: string, projectId: string) => ({ environmentId, projectId });

  it("counts each logical project once and skips unresolved ones", () => {
    // "web" spans two checkouts; cards from either are one project.
    const groups = [
      group("web", [
        ["local", "p1"],
        ["local", "p2"],
      ]),
      group("api", [["local", "p3"]]),
    ];
    const count = statusSectionProjectCount({
      threads: [at("local", "p3"), at("local", "p2"), at("local", "gone"), at("local", "p1")],
      projectRefIndex: createProjectRefIndex(groups),
    });
    expect(count).toBe(2);
  });
});
