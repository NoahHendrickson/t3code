import { describe, expect, it } from "vite-plus/test";

import { physicalProjectOrderFromVisibleGroups } from "./sidebarV2ProjectSort";

describe("physicalProjectOrderFromVisibleGroups", () => {
  it("walks groups in visual order and keeps each group's members together", () => {
    expect(
      physicalProjectOrderFromVisibleGroups([
        {
          memberProjects: [
            { physicalProjectKey: "local:/repo-newer" },
            { physicalProjectKey: "remote:/repo-newer" },
          ],
        },
        { memberProjects: [{ physicalProjectKey: "local:/repo-older" }] },
      ]),
    ).toEqual(["local:/repo-newer", "remote:/repo-newer", "local:/repo-older"]);
  });

  it("returns an empty list when there are no groups", () => {
    expect(physicalProjectOrderFromVisibleGroups([])).toEqual([]);
  });
});
