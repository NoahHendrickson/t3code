import { describe, expect, it } from "vite-plus/test";

import { createProjectRefIndex } from "./sidebarV2ProjectGrouping";
import { rankSidebarV2RecentProjectKeys } from "./sidebarV2RecentProjects";

// Built by the sidebar's own indexer, so the test cannot agree with itself on
// a key format the real index does not use.
const projectRefIndex = createProjectRefIndex([
  {
    projectKey: "repo-a",
    displayName: "a",
    memberProjectRefs: [
      { environmentId: "local", projectId: "a" },
      { environmentId: "remote", projectId: "a" },
    ],
  },
  {
    projectKey: "repo-b",
    displayName: "b",
    memberProjectRefs: [{ environmentId: "local", projectId: "b" }],
  },
  {
    projectKey: "repo-c",
    displayName: "c",
    memberProjectRefs: [{ environmentId: "local", projectId: "c" }],
  },
]);

function thread(
  ref: string,
  updatedAt: string,
  latestUserMessageAt: string | null = null,
): {
  environmentId: string;
  projectId: string;
  updatedAt: string;
  latestUserMessageAt: string | null;
} {
  const [environmentId, projectId] = ref.split(":") as [string, string];
  return { environmentId, projectId, updatedAt, latestUserMessageAt };
}

describe("rankSidebarV2RecentProjectKeys", () => {
  it("orders projects by their newest thread, last user message first", () => {
    expect(
      rankSidebarV2RecentProjectKeys({
        projectRefIndex,
        threads: [
          thread("local:a", "2026-10-01T00:00:00.000Z"),
          // Updated later, but the user last wrote here before repo-a's activity.
          thread("local:b", "2026-10-05T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
          thread("local:c", "2026-10-03T00:00:00.000Z"),
        ],
      }),
    ).toEqual(["repo-c", "repo-a", "repo-b"]);
  });

  it("ranks a project spanning environments once, by its newest member thread", () => {
    expect(
      rankSidebarV2RecentProjectKeys({
        projectRefIndex,
        threads: [
          thread("local:a", "2026-10-01T00:00:00.000Z"),
          thread("local:b", "2026-10-02T00:00:00.000Z"),
          thread("remote:a", "2026-10-03T00:00:00.000Z"),
        ],
      }),
    ).toEqual(["repo-a", "repo-b"]);
  });

  it("leaves out projects without threads and threads without a project, and caps", () => {
    expect(
      rankSidebarV2RecentProjectKeys({
        projectRefIndex,
        limit: 1,
        threads: [
          thread("local:gone", "2026-10-09T00:00:00.000Z"),
          thread("local:a", "2026-10-01T00:00:00.000Z"),
          thread("local:b", "2026-10-02T00:00:00.000Z"),
        ],
      }),
    ).toEqual(["repo-b"]);
  });
});
