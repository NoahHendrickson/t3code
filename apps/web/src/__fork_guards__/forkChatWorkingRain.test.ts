// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-chat-working-rain`.
 *
 * The transcript's working row draws the Sidebar V2 pixel rain, not
 * upstream's three pulsing dots. A sync that takes upstream's
 * WorkingTimelineRow compiles clean and silently splits the working
 * vocabulary back into two marks — this pins the swap.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const timeline = readSibling("../components/chat/MessagesTimeline.tsx");

describe("fork guard: fork-chat-working-rain", () => {
  it("renders the sidebar rain in the working row", () => {
    expect(timeline).toContain('from "~/custom/SidebarV2StatusIndicator"');
    expect(timeline).toContain("<SidebarV2WorkingRain seed={row.id} />");
  });

  it("no longer ships upstream's pulsing-dot cluster", () => {
    // The dots were the only animate-status-pulse use in this file; their
    // return is exactly the silent un-port this guard exists to catch.
    expect(timeline).not.toContain("animate-status-pulse");
  });
});
