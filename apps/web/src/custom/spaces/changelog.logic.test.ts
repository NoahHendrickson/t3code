import { describe, expect, it } from "vite-plus/test";

import { groupChangelogByWeek, parseConventionalTitle } from "./changelog.logic";

describe("parseConventionalTitle", () => {
  it("splits the kind and scope off a conventional title", () => {
    expect(parseConventionalTitle("feat(web): spaces in the sidebar")).toEqual({
      kind: "feat",
      scope: "web",
      subject: "spaces in the sidebar",
    });
    expect(parseConventionalTitle("fix!: drop the old cache")).toEqual({
      kind: "fix",
      scope: null,
      subject: "drop the old cache",
    });
  });

  it("keeps a plain title whole", () => {
    expect(parseConventionalTitle("Merge upstream: October")).toEqual({
      kind: null,
      scope: null,
      subject: "Merge upstream: October",
    });
  });
});

describe("groupChangelogByWeek", () => {
  // Friday 30 October 2026, local time.
  const now = new Date(2026, 9, 30, 12);
  const at = (month: number, day: number) => ({
    updatedAt: new Date(2026, month, day, 9).toISOString(),
  });

  it("files entries under this week, last week and older weeks, newest first", () => {
    const weeks = groupChangelogByWeek([at(9, 29), at(9, 27), at(9, 22), at(9, 7), at(9, 6)], now);
    expect(
      weeks.map((week) => [
        week.label.startsWith("Week of") ? "older" : week.label,
        week.entries.length,
      ]),
    ).toEqual([
      ["This week", 2],
      ["Last week", 1],
      ["older", 2],
    ]);
  });

  it("starts the week on Monday", () => {
    // Monday 26 October is this week; Sunday 25 October is last week.
    const weeks = groupChangelogByWeek([at(9, 26), at(9, 25)], now);
    expect(weeks.map((week) => week.label)).toEqual(["This week", "Last week"]);
  });

  it("drops entries without a readable date", () => {
    expect(groupChangelogByWeek([{ updatedAt: "not a date" }], now)).toEqual([]);
  });
});
