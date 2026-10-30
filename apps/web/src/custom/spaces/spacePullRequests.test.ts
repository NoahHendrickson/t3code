import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { spacePullRequestEntries } from "./spacePullRequests";

const space = {
  memberProjectRefs: [
    { environmentId: "mac" as EnvironmentId, projectId: "p1" as ProjectId },
    { environmentId: "box" as EnvironmentId, projectId: "p9" as ProjectId },
  ],
};

const entry = (environmentId: string, projectId: string, number: number, updatedAt: string) => ({
  environmentId,
  projectId,
  host: "github.com",
  repository: "acme/app",
  number,
  updatedAt,
});

describe("spacePullRequestEntries", () => {
  it("lists a pull request once when several machines answer for it, newest first", () => {
    const entries = spacePullRequestEntries(space, [
      entry("mac", "p1", 7, "2026-10-01T00:00:00Z"),
      entry("box", "p9", 7, "2026-10-01T00:00:00Z"),
      entry("box", "p9", 8, "2026-10-02T00:00:00Z"),
      entry("mac", "other", 9, "2026-10-03T00:00:00Z"),
    ]);
    expect(entries.map((pr) => pr.number)).toEqual([8, 7]);
  });
});
