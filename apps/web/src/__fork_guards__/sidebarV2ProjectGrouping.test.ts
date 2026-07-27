// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * Grouping re-buckets the active cards, so the one thing an upstream rewrite of
 * SidebarV2 can silently break without breaking the render is the ordered
 * thread list: it backs the jump labels, arrow navigation and range selection,
 * and nothing about a grouped list *looks* wrong when that list still holds the
 * flat order. Most of this file is about that seam.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { UNGROUPED_PROJECT_KEY, groupThreadsByProject } from "../custom/sidebarV2ProjectGrouping";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/SidebarV2.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");

describe("fork guard: sidebar-v2-project-grouping", () => {
  it("offers the switch from the project scope menu", () => {
    expect(chromeRows).toContain("Group by project");
    expect(chromeRows).toContain("onGroupByProjectChange");
    // Toggling a view preference must not dismiss the menu it lives in.
    expect(chromeRows).toContain("closeOnClick={false}");
    expect(sidebar).toContain("groupByProject={groupByProject}");
  });

  it("drives keyboard order from the grouped order, not the flat one", () => {
    // The whole point of the fenced hunk: orderedThreads is what jump hints,
    // arrow nav and shift-range selection read, so it has to be the order rows
    // are painted in.
    expect(sidebar).toContain("[...orderedActiveThreads, ...visibleSnoozedThreads");
    const definition = sidebar.indexOf("const orderedActiveThreads");
    const use = sidebar.indexOf("[...orderedActiveThreads,");
    expect(definition).toBeGreaterThanOrEqual(0);
    expect(use).toBeGreaterThan(definition);
  });

  it("groups the active cards only, and not while a project scope is set", () => {
    expect(sidebar).toContain("groupByProject && projectScopeKey === null");
    // The shelves keep their flat, time-ordered rendering.
    expect(sidebar).toContain("for (const thread of renderedSettledThreads)");
    expect(sidebar).toContain("for (const thread of visibleSnoozedThreads)");
  });

  it("drops the card's project name under a project header", () => {
    // Otherwise every card repeats the header two rows above it, and the branch
    // — the half that actually separates two threads on one project — keeps
    // yielding width to it.
    // Scoped to the grouped section on purpose: the snoozed and settled shelves
    // are not grouped, so their rows have no header to inherit the project
    // from and must keep naming it themselves.
    expect(sidebar).toContain('activeThreadProjectGroups !== null && section === "active"');
  });

  it("keeps every thread when a project no longer resolves to a group", () => {
    const groups = groupThreadsByProject(
      [
        { environmentId: "local", projectId: "p1" },
        { environmentId: "local", projectId: "deleted" },
      ],
      [
        {
          projectKey: "first",
          displayName: "First",
          memberProjectRefs: [{ environmentId: "local", projectId: "p1" }],
        },
      ],
    );

    expect(groups.flatMap((group) => group.threads)).toHaveLength(2);
    expect(groups.at(-1)?.projectKey).toBe(UNGROUPED_PROJECT_KEY);
  });

  it("keeps the caller's project order and each group's thread order", () => {
    // Grouping must not become a second sort: upstream already ordered both
    // the projects and the threads.
    const groups = groupThreadsByProject(
      [
        { id: "a", environmentId: "local", projectId: "p1" },
        { id: "b", environmentId: "local", projectId: "p2" },
        { id: "c", environmentId: "local", projectId: "p1" },
      ],
      [
        {
          projectKey: "second",
          displayName: "Second",
          memberProjectRefs: [{ environmentId: "local", projectId: "p2" }],
        },
        {
          projectKey: "first",
          displayName: "First",
          memberProjectRefs: [{ environmentId: "local", projectId: "p1" }],
        },
      ],
    );

    expect(groups.map((group) => group.projectKey)).toEqual(["second", "first"]);
    expect(groups[1]?.threads.map((thread) => thread.id)).toEqual(["a", "c"]);
  });
});
