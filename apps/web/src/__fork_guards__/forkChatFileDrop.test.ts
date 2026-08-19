// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-chat-file-drop`.
 *
 * Upstream's own chat column owns attaching dropped files
 * (data-chat-workspace-drop-target + makeWorkspaceFileDropHandlers); the
 * fork's one surviving piece is a window-level guard that swallows file drops
 * nothing claimed, so a missed drop cannot navigate the app away. That guard
 * is a fenced hook call in ChatView — exactly the shape a sync can drop while
 * everything still compiles, because nothing looks broken until a screenshot
 * released over the sidebar replaces the session with the file. Handler
 * semantics belong to `custom/chatFileDrop.test.ts`.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = readSibling("../components/ChatView.tsx");
const guardSource = readSibling("../custom/chatFileDrop.ts");

describe("fork guard: fork-chat-file-drop", () => {
  it("keeps the stray-drop guard mounted while a chat column exists", () => {
    expect(chatView).toContain('from "~/custom/chatFileDrop"');
    expect(chatView).toContain("useStrayFileDropGuard()");
    // Upstream's column drop target is the thing the guard defers to; if a
    // sync renames or drops it, attaching regresses to composer-only and the
    // guard would start swallowing drops upstream meant to accept.
    expect(chatView).toContain('data-chat-workspace-drop-target="true"');
  });

  it("defers to claimed drops and swallows the rest", () => {
    // Bubble-phase window listeners are what let every real target answer
    // first; the defaultPrevented bow-out is what keeps the guard additive.
    expect(guardSource).toMatch(/window\.addEventListener\("dragover"/u);
    expect(guardSource).toMatch(/window\.addEventListener\("drop"/u);
    expect(guardSource).not.toContain('addEventListener("dragover", onDragOver, true');
    expect(guardSource).toContain("if (event.defaultPrevented) return;");
    expect(guardSource).toContain('dropEffect = "none"');
  });

  it("keeps both fence markers around the ChatView edit", () => {
    const begin = chatView.match(/fork:begin fork-chat-file-drop/gu) ?? [];
    const end = chatView.match(/fork:end fork-chat-file-drop/gu) ?? [];
    expect(begin.length).toBeGreaterThan(0);
    expect(end.length).toBe(begin.length);
  });
});
