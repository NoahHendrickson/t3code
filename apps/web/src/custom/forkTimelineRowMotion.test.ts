import { describe, expect, it } from "vite-plus/test";
import type { MessagesTimelineRow } from "~/components/chat/MessagesTimeline.logic";
import { createTimelineRowMotion } from "./forkTimelineRowMotion";

const message = (id: string) => ({ kind: "message", id }) as MessagesTimelineRow;
const work = (id: string) => ({ kind: "work-toggle", id }) as MessagesTimelineRow;
const live = { kind: "thinking", id: "live-activity-row" } as MessagesTimelineRow;

describe("createTimelineRowMotion", () => {
  it("keeps the thread's first rows still", () => {
    const motion = createTimelineRowMotion();
    motion.observe([], "thread");
    motion.observe([message("a"), live], "thread");
    expect(motion.takeEntrance("a")).toBe(false);
    expect(motion.takeEntrance(live.id)).toBe(false);
    expect(motion.insertedRecently()).toBe(false);
  });

  it("enters a response landing above the live line, once", () => {
    const motion = createTimelineRowMotion();
    motion.observe([message("a"), live], "thread");
    motion.observe([message("a"), work("w"), message("b"), live], "thread");
    expect(motion.insertedRecently()).toBe(true);
    expect(motion.takeEntrance("b")).toBe(true);
    expect(motion.takeEntrance("b")).toBe(false);
    // The settled work row replaces the live line in place.
    expect(motion.takeEntrance("w")).toBe(false);
  });

  it("keeps prepended history still", () => {
    const motion = createTimelineRowMotion();
    motion.observe([message("b")], "thread");
    motion.observe([message("a"), message("b")], "thread");
    expect(motion.takeEntrance("a")).toBe(false);
    expect(motion.insertedRecently()).toBe(false);
  });

  it("enters the live line again on the next turn", () => {
    const motion = createTimelineRowMotion();
    motion.observe([message("a")], "thread");
    motion.observe([message("a"), live], "thread");
    expect(motion.takeEntrance(live.id)).toBe(true);
    motion.observe([message("a"), message("b")], "thread");
    motion.observe([message("a"), message("b"), message("c"), live], "thread");
    expect(motion.takeEntrance(live.id)).toBe(true);
  });

  it("re-primes on a thread switch", () => {
    const motion = createTimelineRowMotion();
    motion.observe([message("a")], "one");
    motion.observe([message("x"), message("y")], "two");
    expect(motion.takeEntrance("y")).toBe(false);
  });
});
