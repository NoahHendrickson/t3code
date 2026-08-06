// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-chat-file-drop`.
 *
 * The customization is two lines in two upstream files — a hook call in
 * ChatComposer and the marker attribute on ChatView's chat column — which is
 * exactly the shape a sync can drop while everything still compiles: the
 * composer's own drop handler stays, a drag aimed at the composer still
 * works, and nothing looks broken until a screenshot released over the
 * timeline navigates the app away to the file. Both halves are asserted here.
 * Handler semantics belong to `custom/chatFileDrop.test.ts` — a guard that
 * re-tests them buys no sync safety and drifts from the unit file.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { CHAT_FILE_DROP_ZONE_ATTRIBUTE } from "../custom/chatFileDrop";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const chatView = readSibling("../components/ChatView.tsx");

describe("fork guard: fork-chat-file-drop", () => {
  it("keeps ChatComposer subscribed to the chat-wide drop", () => {
    expect(chatComposer).toContain('from "../../custom/chatFileDrop"');
    // The drop feeds the same attachment path as paste, and focuses the
    // composer so the dropped file can be typed about immediately.
    expect(chatComposer).toMatch(/useChatFileDrop\(\{[\s\S]*?addComposerImages\([\s\S]*?\}\);/u);
    expect(chatComposer).toMatch(/useChatFileDrop\(\{[\s\S]*?focusComposer\(\)[\s\S]*?\}\);/u);
    // Same state the composer paints its drag-over tint from, so a drag over
    // the timeline still shows where the file will land.
    expect(chatComposer).toMatch(/useChatFileDrop\(\{[\s\S]*?setIsDragOverComposer[\s\S]*?\}\);/u);
  });

  it("keeps the drop zone marked on ChatView's chat column", () => {
    // Without the marker the hook hit-tests every drag as outside the chat and
    // silently discards it — worse than upstream, which at least accepted a
    // drop aimed at the composer.
    expect(chatView).toContain(`${CHAT_FILE_DROP_ZONE_ATTRIBUTE}="true"`);
  });

  it("keeps both fence markers around each edit", () => {
    for (const [name, source] of [
      ["ChatComposer.tsx", chatComposer],
      ["ChatView.tsx", chatView],
    ] as const) {
      const begin = source.match(/fork:begin fork-chat-file-drop/gu) ?? [];
      const end = source.match(/fork:end fork-chat-file-drop/gu) ?? [];
      expect(begin.length, `${name} fence begins`).toBeGreaterThan(0);
      expect(end.length, `${name} fence ends`).toBe(begin.length);
    }
  });
});
