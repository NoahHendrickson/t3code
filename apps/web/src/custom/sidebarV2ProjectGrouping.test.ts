import { describe, expect, it } from "vite-plus/test";

import { UNGROUPED_PROJECT_KEY, groupThreadsByProject } from "./sidebarV2ProjectGrouping";

const project = (
  projectKey: string,
  displayName: string,
  refs: ReadonlyArray<[string, string]>,
) => ({
  projectKey,
  displayName,
  memberProjectRefs: refs.map(([environmentId, projectId]) => ({ environmentId, projectId })),
});

const thread = (id: string, environmentId: string, projectId: string) => ({
  id,
  environmentId,
  projectId,
});

describe("groupThreadsByProject", () => {
  it("buckets threads in the caller's project order, keeping thread order inside a group", () => {
    const groups = groupThreadsByProject(
      [thread("a", "local", "p1"), thread("b", "local", "p2"), thread("c", "local", "p1")],
      [
        project("second", "Second", [["local", "p2"]]),
        project("first", "First", [["local", "p1"]]),
      ],
    );

    expect(groups.map((group) => group.projectKey)).toEqual(["second", "first"]);
    expect(groups[1]?.threads.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("folds every member project of a logical group under one header", () => {
    const groups = groupThreadsByProject(
      [thread("a", "local", "p1"), thread("b", "remote", "p9")],
      [
        project("repo", "Repo", [
          ["local", "p1"],
          ["remote", "p9"],
        ]),
      ],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.threads.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("drops projects with no threads", () => {
    const groups = groupThreadsByProject(
      [thread("a", "local", "p1")],
      [project("first", "First", [["local", "p1"]]), project("empty", "Empty", [["local", "p2"]])],
    );

    expect(groups.map((group) => group.projectKey)).toEqual(["first"]);
  });

  it("keeps threads whose project has no group, under a trailing header", () => {
    // A thread must never vanish because its project was just deleted or its
    // environment has not loaded its projects yet.
    const groups = groupThreadsByProject(
      [thread("a", "local", "p1"), thread("orphan", "local", "gone")],
      [project("first", "First", [["local", "p1"]])],
    );

    expect(groups.map((group) => group.projectKey)).toEqual(["first", UNGROUPED_PROJECT_KEY]);
    expect(groups[1]?.threads.map((entry) => entry.id)).toEqual(["orphan"]);
  });

  it("does not confuse an environment/project id pair with a differently split one", () => {
    const groups = groupThreadsByProject(
      [thread("a", "env", "a:b")],
      [project("split", "Split", [["env:a", "b"]])],
    );

    expect(groups.map((group) => group.projectKey)).toEqual([UNGROUPED_PROJECT_KEY]);
  });
});
