// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * The side chat spans the desktop main process, the preload and four seams
 * in the web app. Each seam compiles on its own if a sync drops another, so
 * the pieces that must agree — the shortcut, the surface flag, the fresh
 * channel, the storage isolation and the root's side-chat branch — are
 * pinned here.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sideChatWindow = readSibling("../../../desktop/src/fork/ForkSideChatWindow.ts");
const electronWindow = readSibling("../../../desktop/src/electron/ElectronWindow.ts");
const desktopHandlers = readSibling("../../../desktop/src/ipc/DesktopIpcHandlers.ts");
const desktopPreload = readSibling("../../../desktop/src/preload.ts");
const main = readSibling("../main.tsx");
const root = readSibling("../routes/__root.tsx");
const shell = readSibling("../custom/sideChat/SideChatShell.tsx");
const css = readSibling("../theme.custom.css");
const chatView = readSibling("../components/ChatView.tsx");

describe("fork guard: fork-side-chat", () => {
  it("registers the global shortcut when the desktop installs its handlers", () => {
    expect(sideChatWindow).toContain('FORK_SIDE_CHAT_ACCELERATOR = "CommandOrControl+Shift+Space"');
    expect(sideChatWindow).toContain("Electron.globalShortcut.register(FORK_SIDE_CHAT_ACCELERATOR");
    expect(desktopHandlers).toMatch(
      /fork:begin fork-side-chat[\s\S]*?yield\* installForkSideChat\(\);[\s\S]*?fork:end fork-side-chat/u,
    );
  });

  it("loads the app as the side-chat surface in a panel that does not stay on top", () => {
    expect(sideChatWindow).toContain('url.searchParams.set("surface", "side-chat")');
    expect(sideChatWindow).toContain('type: "panel"');
    expect(sideChatWindow).toContain("window.setAlwaysOnTop(false)");
    // Hide, never close, until quit.
    expect(sideChatWindow).toMatch(/if \(quitting\) return;\s*event\.preventDefault\(\);/u);
  });

  it("keeps the side chat out of the main window's fallback", () => {
    expect(sideChatWindow).toContain("markForkAuxiliaryWindow(window);");
    expect(electronWindow).toMatch(
      /fork:begin fork-side-chat[\s\S]*?\.find\(\(window\) => !isForkAuxiliaryWindow\(window\)\)[\s\S]*?fork:end fork-side-chat/u,
    );
  });

  it("sends a fresh chat on hide through the fork bridge", () => {
    expect(sideChatWindow).toContain('FORK_SIDE_CHAT_FRESH_CHANNEL = "fork:side-chat-fresh"');
    expect(desktopPreload).toMatch(
      /fork:begin fork-side-chat[\s\S]*?ipcRenderer\.on\("fork:side-chat-fresh", receive\)[\s\S]*?fork:end fork-side-chat/u,
    );
    expect(shell).toContain("readSideChatBridge()?.onFresh(");
    expect(shell).toContain("void startScratchThread(environmentId);");
  });

  it("isolates storage before any store loads", () => {
    // The first import in main.tsx, ahead of React and every store.
    expect(main).toMatch(
      /^\/\* fork:begin fork-side-chat[\s\S]*?\*\/\nimport "\.\/custom\/sideChat\/surface";/u,
    );
  });

  it("mounts only the chat in the side chat window", () => {
    const branch = /if \(isSideChatSurface\) \{([\s\S]*?)\n {2}\}/u.exec(root)?.[1] ?? "";
    expect(branch).toContain("<SideChatShell>");
    // None of the once-per-app coordinators.
    for (const coordinator of [
      "<EventRouter",
      "<ThreadNotificationCoordinator",
      "<ForkDictationHotkeyHost",
      "<SnapShotCoordinator",
      "<AppSidebarLayout",
    ]) {
      expect(branch).not.toContain(coordinator);
    }
  });

  it("hides the right-panel toggles in the side chat", () => {
    expect(chatView).toContain("data-workspace-titlebar-controls");
    expect(css).toContain(
      ':root[data-fork="noahhendrickson-t3code"][data-side-chat] [data-workspace-titlebar-controls]',
    );
  });
});
