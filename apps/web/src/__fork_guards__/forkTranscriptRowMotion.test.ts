// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-transcript-row-motion`.
 *
 * The row motion keys off ids it cannot import: the trailing live row ids in
 * MessagesTimeline.logic.ts. A sync that renames them, or takes upstream's
 * renderItem and drops the frame, compiles clean and silently stops the
 * motion — this pins both.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const timeline = readSibling("../components/chat/MessagesTimeline.tsx");
const logic = readSibling("../components/chat/MessagesTimeline.logic.ts");

describe("fork guard: fork-transcript-row-motion", () => {
  it("wraps every timeline row in the motion frame", () => {
    expect(timeline).toContain("const rowMotion = useTimelineRowMotion(rows, listIdentityKey);");
    expect(timeline).toContain("<ForkTimelineRowFrame motion={rowMotion} rowId={item.id}>");
  });

  it("still names the live rows the slide keys on", () => {
    expect(logic).toContain('const LIVE_ACTIVITY_ROW_ID = "live-activity-row";');
    expect(logic).toContain('id: "working-indicator-row"');
  });
});
