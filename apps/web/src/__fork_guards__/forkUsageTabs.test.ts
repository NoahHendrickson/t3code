// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-usage-tabs`.
 *
 * The Usage page's tabs and the scheduled trigger picker are one component.
 * A sync that restores upstream's toggle-group import puts the Usage page
 * back on the larger segmented look while Scheduled keeps the fork's tabs.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const usagePage = readSibling("../components/usage/UsagePage.tsx");
const triggerTabs = readSibling("../custom/scheduled/ScheduledTriggerTabs.tsx");

describe("fork guard: fork-usage-tabs", () => {
  it("renders the Usage page tabs with the scheduled trigger picker's component", () => {
    expect(usagePage).toContain('from "../../custom/SegmentedTabs"');
    expect(usagePage).not.toContain('from "../ui/toggle-group"');
    expect(usagePage).not.toContain('variant="segmented"');
    expect(triggerTabs).toContain('from "../SegmentedTabs"');
  });
});
