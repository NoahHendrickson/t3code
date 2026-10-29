// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-transcript-row-motion`.
 *
 * A sync that takes upstream's renderItem, drops the synced prop, or turns on
 * recycleItems compiles clean and silently breaks the motion — this pins all
 * three.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const timeline = readSibling("../components/chat/MessagesTimeline.tsx");
const chatView = readSibling("../components/ChatView.tsx");

describe("fork guard: fork-transcript-row-motion", () => {
  it("wraps every timeline row in the motion frame", () => {
    expect(timeline).toContain(
      "const rowMotion = useTimelineRowMotion(rows, listIdentityKey, forkTimelineSynced);",
    );
    // Upstream's frame now carries audio playback capture handlers, passed through.
    expect(timeline).toMatch(/<ForkTimelineRowFrame\s+motion=\{rowMotion\}\s+row=\{item\}/u);
  });

  it("tells the timeline when it shows a stand-in snapshot", () => {
    // Upstream dropped the paint-only timeline path (#25787), so sync phase alone decides.
    expect(chatView).toContain("forkTimelineSynced={threadSyncPhase === null}");
  });

  it("keeps the conversation list's containers keyed by row", () => {
    // The live-line slide watches its own container; with recycleItems on,
    // LegendList hands that container to other rows.
    const list = timeline.match(/<LegendList<MessagesTimelineRow>[^]*?\n\s*\/>/u)?.[0];
    expect(list).toBeDefined();
    expect(list).not.toContain("recycleItems");
  });
});
