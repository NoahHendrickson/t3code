import { describe, expect, it } from "vite-plus/test";

import type { SidebarV2CardTopStatus } from "../sidebarV2CardStatus";
import { buildSpaceSections, spaceOpenPullRequests, summarizeSpaceThreads } from "./spaceSidebar";
import { UNGROUPED_PROJECT_KEY } from "../sidebarV2ProjectGrouping";

const working: SidebarV2CardTopStatus = { label: "Working", tone: "working", mark: "working" };
const approval: SidebarV2CardTopStatus = { label: "Needs approval", tone: "approval", mark: "dot" };
const limited: SidebarV2CardTopStatus = {
  label: "Usage limit reached",
  tone: "approval",
  mark: "dot",
};
const failed: SidebarV2CardTopStatus = { label: "Failed", tone: "failed", mark: "dot" };
const done: SidebarV2CardTopStatus = { label: "Done", tone: "done", mark: "dot" };
const waiting: SidebarV2CardTopStatus = { label: "Waiting", mark: "monitoring" };
const monitoring: SidebarV2CardTopStatus = { label: "Monitoring", mark: "monitoring" };

const summarize = (statuses: readonly SidebarV2CardTopStatus[]) =>
  summarizeSpaceThreads(statuses, (status) => status);
const keys = (statuses: readonly SidebarV2CardTopStatus[]) =>
  summarize(statuses).marks.map((mark) => mark.key);

describe("summarizeSpaceThreads", () => {
  it("draws one of the cards' marks per mark present, in the row's order", () => {
    expect(summarize([null, done, working, failed]).count).toBe(4);
    expect(keys([null, done, working, failed])).toEqual([
      "working",
      "dot:failed",
      "dot:done",
      "idle",
    ]);
  });

  it("draws a mark once when several states share it on the cards", () => {
    expect(keys([approval, limited])).toEqual(["dot:approval"]);
    expect(keys([waiting, monitoring])).toEqual(["monitoring"]);
    // The card's own status, label and all.
    expect(summarize([approval]).marks[0]?.status).toBe(approval);
  });

  it("draws nothing for an empty space", () => {
    expect(summarize([])).toEqual({ count: 0, marks: [] });
  });
});

describe("buildSpaceSections", () => {
  type Thread = { readonly status: SidebarV2CardTopStatus; readonly pullRequests?: undefined };
  const groups = [{ projectKey: "a" }, { projectKey: "b" }];
  const sections: ReadonlyArray<{
    readonly header: { readonly projectKey: string } | null;
    readonly threads: readonly Thread[];
  }> = [
    { header: { projectKey: "a" }, threads: [{ status: working }] },
    { header: { projectKey: "b" }, threads: [] },
    { header: { projectKey: UNGROUPED_PROJECT_KEY }, threads: [{ status: done }] },
    { header: null, threads: [] },
  ];
  const spaces = buildSpaceSections({
    sections,
    groups,
    expanded: new Set(["b"]),
    statusOf: (thread: Thread) => thread.status,
  });

  it("models every space, folding its cards until its Threads row is expanded", () => {
    expect(spaces.get("a")?.threadsFolded).toBe(true);
    expect(spaces.get("b")?.threadsFolded).toBe(false);
    expect(spaces.get("a")?.summary.marks.map((mark) => mark.key)).toEqual(["working"]);
    expect(spaces.get("b")?.group).toBe(groups[1]);
  });

  it("leaves out the unresolved section, which is no space", () => {
    expect([...spaces.keys()]).toEqual(["a", "b"]);
  });
});

describe("spaceOpenPullRequests", () => {
  const link = (number: number, state: string | null, source = "agent") => ({
    host: "github.com",
    repository: "acme/lumen",
    number,
    source,
    snapshot: state === null ? null : { state },
  });

  it("lists each open pull request once, newest number first", () => {
    expect(
      spaceOpenPullRequests([
        { pullRequests: [link(409, "open"), link(88, "merged")] },
        { pullRequests: [link(412, "open"), link(409, "open")] },
        {},
      ]),
    ).toEqual([412, 409]);
  });

  it("counts a link not synced yet, and skips a dismissed stack member", () => {
    expect(
      spaceOpenPullRequests([
        { pullRequests: [link(7, null), link(8, "open", "stack-dismissed")] },
      ]),
    ).toEqual([7]);
  });
});
