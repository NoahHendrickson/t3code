import { describe, expect, it } from "vite-plus/test";

import type { SidebarV2CardStatusKind } from "../sidebarV2CardStatus";
import { spaceOpenPullRequests, spaceThreadsFolded, summarizeSpaceThreads } from "./spaceSidebar";
import { UNGROUPED_PROJECT_KEY } from "../sidebarV2ProjectGrouping";

const summarize = (kinds: ReadonlyArray<SidebarV2CardStatusKind | null>) =>
  summarizeSpaceThreads(kinds, (kind) => kind);

describe("summarizeSpaceThreads", () => {
  it("draws one mark per state present, in the row's order", () => {
    expect(summarize([null, "done", "working", "failed"])).toEqual({
      count: 4,
      marks: ["working", "failed", "done", "idle"],
    });
  });

  it("gives every blocked-on-you state the one amber mark the cards share", () => {
    expect(summarize(["approval", "input", "limited"])).toEqual({ count: 3, marks: ["blocked"] });
  });

  it("takes waiting as monitoring, the mark its card draws", () => {
    expect(summarize(["waiting", "monitoring"])).toEqual({ count: 2, marks: ["monitoring"] });
  });

  it("draws nothing for an empty space", () => {
    expect(summarize([])).toEqual({ count: 0, marks: [] });
  });
});

describe("spaceThreadsFolded", () => {
  it("folds a space until its Threads row is expanded", () => {
    expect(spaceThreadsFolded({ projectKey: "p" }, new Set())).toBe(true);
    expect(spaceThreadsFolded({ projectKey: "p" }, new Set(["p"]))).toBe(false);
  });

  it("never folds the unresolved section, which has no Threads row to open it", () => {
    expect(spaceThreadsFolded({ projectKey: UNGROUPED_PROJECT_KEY }, new Set())).toBe(false);
    expect(spaceThreadsFolded(null, new Set())).toBe(false);
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
