import { describe, expect, it } from "vite-plus/test";

import {
  UNGROUPED_PROJECT_KEY,
  buildActiveThreadSections,
  createProjectRefIndex,
  threadsVisibleInProjectSection,
} from "./sidebarV2ProjectGrouping";

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

const sections = (
  threads: ReadonlyArray<ReturnType<typeof thread>>,
  projectGroups: ReadonlyArray<ReturnType<typeof project>>,
  grouped = true,
) =>
  buildActiveThreadSections({
    threads,
    projectGroups,
    projectRefIndex: createProjectRefIndex(projectGroups),
    grouped,
  });

const headerKeys = (result: ReturnType<typeof sections>) =>
  result.map((section) => section.header?.projectKey ?? null);

const paintOrder = (result: ReturnType<typeof sections>) =>
  result.flatMap((section) => section.threads.map((entry) => entry.id));

describe("buildActiveThreadSections", () => {
  it("returns one headerless section when grouping is off", () => {
    const threads = [thread("a", "local", "p1"), thread("b", "local", "p2")];
    const result = sections(threads, [project("first", "First", [["local", "p1"]])], false);

    expect(headerKeys(result)).toEqual([null]);
    expect(result[0]?.threads).toBe(threads);
  });

  it("sections in the caller's project order, keeping thread order inside a section", () => {
    const result = sections(
      [thread("a", "local", "p1"), thread("b", "local", "p2"), thread("c", "local", "p1")],
      [
        project("second", "Second", [["local", "p2"]]),
        project("first", "First", [["local", "p1"]]),
      ],
    );

    expect(headerKeys(result)).toEqual(["second", "first"]);
    // Grouping re-buckets an already-sorted list; it never re-sorts within one.
    expect(paintOrder(result)).toEqual(["b", "a", "c"]);
  });

  it("folds every member project of a logical group under one header", () => {
    const result = sections(
      [thread("a", "local", "p1"), thread("b", "remote", "p9")],
      [
        project("repo", "Repo", [
          ["local", "p1"],
          ["remote", "p9"],
        ]),
      ],
    );

    expect(result).toHaveLength(1);
    expect(paintOrder(result)).toEqual(["a", "b"]);
  });

  it("drops projects with no threads", () => {
    const result = sections(
      [thread("a", "local", "p1")],
      [project("first", "First", [["local", "p1"]]), project("empty", "Empty", [["local", "p2"]])],
    );

    expect(headerKeys(result)).toEqual(["first"]);
  });

  it("keeps threads whose project has no group, under a trailing header", () => {
    // A thread must never vanish because its project was just deleted or its
    // environment has not loaded its projects yet. The header's label is left
    // to the render site, so this stays free of user-facing copy.
    const result = sections(
      [thread("a", "local", "p1"), thread("orphan", "local", "gone")],
      [project("first", "First", [["local", "p1"]])],
    );

    expect(headerKeys(result)).toEqual(["first", UNGROUPED_PROJECT_KEY]);
    expect(result.at(-1)?.header?.displayName).toBeNull();
    expect(paintOrder(result)).toEqual(["a", "orphan"]);
  });

  it("does not confuse an environment/project id pair with a differently split one", () => {
    const result = sections(
      [thread("a", "env", "a:b")],
      [project("split", "Split", [["env:a", "b"]])],
    );

    expect(headerKeys(result)).toEqual([UNGROUPED_PROJECT_KEY]);
  });

  it("keeps every thread in both modes", () => {
    const threads = [
      thread("a", "local", "p1"),
      thread("b", "local", "p2"),
      thread("orphan", "local", "gone"),
    ];
    const projects = [
      project("first", "First", [["local", "p1"]]),
      project("second", "Second", [["local", "p2"]]),
    ];

    expect(paintOrder(sections(threads, projects, false))).toEqual(["a", "b", "orphan"]);
    expect(paintOrder(sections(threads, projects, true)).toSorted()).toEqual(
      ["a", "b", "orphan"].toSorted(),
    );
  });
});

describe("createProjectRefIndex", () => {
  it("maps every member ref of every group to that group's key", () => {
    const index = createProjectRefIndex([
      project("repo", "Repo", [
        ["local", "p1"],
        ["remote", "p9"],
      ]),
      project("other", "Other", [["local", "p2"]]),
    ]);

    expect(index.size).toBe(3);
    expect([...index.values()].toSorted()).toEqual(["other", "repo", "repo"]);
  });
});

describe("threadsVisibleInProjectSection", () => {
  const threads = [thread("a", "local", "p1"), thread("b", "local", "p1")];

  it("returns every thread when the group is open", () => {
    expect(
      threadsVisibleInProjectSection({
        threads,
        collapsed: false,
        keepThread: () => false,
      }),
    ).toBe(threads);
  });

  it("hides every thread when collapsed with nothing to keep", () => {
    expect(
      threadsVisibleInProjectSection({
        threads,
        collapsed: true,
        keepThread: () => false,
      }),
    ).toEqual([]);
  });

  it("keeps only the matching thread when collapsed", () => {
    expect(
      threadsVisibleInProjectSection({
        threads,
        collapsed: true,
        keepThread: (entry) => entry.id === "b",
      }).map((entry) => entry.id),
    ).toEqual(["b"]);
  });
});
