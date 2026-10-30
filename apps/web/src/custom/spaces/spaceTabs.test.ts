import { describe, expect, it } from "vite-plus/test";

import type { SidebarV2CardStatusKind } from "../sidebarV2CardStatus";

import {
  closeSpaceTabs,
  neighbourAfterClose,
  openSpaceTab,
  pairSpaceTabs,
  rankSpaceTabs,
  resolveSpaceTabs,
  SPACE_TABS_LIMIT,
} from "./spaceTabs";

const thread = (key: string, closed = false) => ({ key, closed });

describe("openSpaceTab", () => {
  it("appends a new thread and leaves an open one where it is", () => {
    expect(openSpaceTab(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    const keys = ["a", "b"];
    expect(openSpaceTab(keys, "a")).toBe(keys);
  });

  it("drops the oldest tabs past the cap", () => {
    const keys = Array.from({ length: SPACE_TABS_LIMIT }, (_, index) => `t${index}`);
    const next = openSpaceTab(keys, "new");
    expect(next).toHaveLength(SPACE_TABS_LIMIT);
    expect(next[0]).toBe("t1");
    expect(next.at(-1)).toBe("new");
  });
});

describe("closeSpaceTabs", () => {
  it("removes the closing keys and returns the same list when none match", () => {
    expect(closeSpaceTabs(["a", "b", "c"], new Set(["b"]))).toEqual(["a", "c"]);
    const keys = ["a"];
    expect(closeSpaceTabs(keys, new Set(["z"]))).toBe(keys);
  });
});

describe("resolveSpaceTabs", () => {
  it("draws only this space's threads, in the order they were opened", () => {
    const { tabs } = resolveSpaceTabs({
      openKeys: ["other-space", "b", "a"],
      activeKeys: ["a"],
      threads: [thread("a"), thread("b")],
    });
    expect(tabs.map((tab) => tab.key)).toEqual(["b", "a"]);
  });

  it("closes a settled tab, but keeps it while it is the open thread", () => {
    const background = resolveSpaceTabs({
      openKeys: ["a", "b"],
      activeKeys: ["a"],
      threads: [thread("a"), thread("b", true)],
    });
    expect(background.tabs.map((tab) => tab.key)).toEqual(["a"]);
    expect([...background.closedKeys]).toEqual(["b"]);

    const open = resolveSpaceTabs({
      openKeys: ["a", "b"],
      activeKeys: ["b"],
      threads: [thread("a"), thread("b", true)],
    });
    expect(open.tabs.map((tab) => tab.key)).toEqual(["a", "b"]);
    expect([...open.closedKeys]).toEqual(["b"]);
  });

  it("draws the open thread before it has been stored", () => {
    const { tabs } = resolveSpaceTabs({
      openKeys: ["a"],
      activeKeys: ["c"],
      threads: [thread("a"), thread("c")],
    });
    expect(tabs.map((tab) => tab.key)).toEqual(["a", "c"]);
  });
});

describe("neighbourAfterClose", () => {
  const tabs = [thread("a"), thread("b"), thread("c")];

  it("lands on the right neighbour, else the left, else nothing", () => {
    expect(neighbourAfterClose(tabs, "b")?.key).toBe("c");
    expect(neighbourAfterClose(tabs, "c")?.key).toBe("b");
    expect(neighbourAfterClose([thread("a")], "a")).toBeNull();
  });
});

describe("rankSpaceTabs", () => {
  const tab = (key: string, kind: SidebarV2CardStatusKind | null) => ({ key, kind });
  const order = (tabs: ReadonlyArray<{ key: string; kind: SidebarV2CardStatusKind | null }>) =>
    rankSpaceTabs(tabs, (entry) => entry.kind).map((entry) => entry.key);

  it("puts what needs you first, then done, working, monitoring and idle", () => {
    expect(
      order([
        tab("idle", null),
        tab("monitoring", "monitoring"),
        tab("working", "working"),
        tab("done", "done"),
        tab("input", "input"),
      ]),
    ).toEqual(["input", "done", "working", "monitoring", "idle"]);
  });

  it("ranks failed with needing you and woke with done", () => {
    expect(
      order([tab("woke", "woke"), tab("working", "working"), tab("failed", "failed")]),
    ).toEqual(["failed", "woke", "working"]);
  });

  it("keeps the opened order within a status", () => {
    expect(order([tab("b", "working"), tab("a", "approval"), tab("c", "working")])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("resolveSpaceTabs with a split", () => {
  it("draws both threads on screen, stored or not", () => {
    const { tabs } = resolveSpaceTabs({
      openKeys: ["a"],
      activeKeys: ["b", "c"],
      threads: [thread("a"), thread("b"), thread("c", true)],
    });
    expect(tabs.map((tab) => tab.key)).toEqual(["a", "b", "c"]);
  });
});

describe("pairSpaceTabs", () => {
  const tabs = [thread("a"), thread("b"), thread("c"), thread("d")];

  it("puts a split's two threads together where the first of them stands, in pane order", () => {
    const slots = pairSpaceTabs(tabs, ["d", "b"]);
    expect(
      slots.map((slot) =>
        slot.kind === "pair" ? slot.tabs.map((tab) => tab.key).join("+") : slot.tab.key,
      ),
    ).toEqual(["a", "d+b", "c"]);
  });

  it("leaves the strip alone without a full pair", () => {
    expect(pairSpaceTabs(tabs, ["b"]).every((slot) => slot.kind === "tab")).toBe(true);
    expect(pairSpaceTabs(tabs, ["b", "zz"]).every((slot) => slot.kind === "tab")).toBe(true);
  });
});
