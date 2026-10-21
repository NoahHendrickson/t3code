// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * The side chat spans the desktop main process, the preload and several
 * seams in the web app. Each seam compiles on its own if a sync drops
 * another, so the pieces that must agree — the shortcut, the shared window
 * wiring, the surface flag, the fresh channel, the storage isolation, the
 * settings refresh and the root's side-chat branch — are pinned here.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sideChatWindow = readSibling("../../../desktop/src/fork/ForkSideChatWindow.ts");
const electronWindow = readSibling("../../../desktop/src/electron/ElectronWindow.ts");
const desktopApp = readSibling("../../../desktop/src/app/DesktopApp.ts");
const desktopWindow = readSibling("../../../desktop/src/window/DesktopWindow.ts");
const desktopPreload = readSibling("../../../desktop/src/preload.ts");
const main = readSibling("../main.tsx");
const root = readSibling("../routes/__root.tsx");
const shell = readSibling("../custom/sideChat/SideChatShell.tsx");
const settings = readSibling("../hooks/useSettings.ts");

describe("fork guard: fork-side-chat", () => {
  it("registers the global shortcut on macOS when the app boots", () => {
    expect(sideChatWindow).toContain('FORK_SIDE_CHAT_ACCELERATOR = "Command+Shift+Space"');
    // Ctrl+Shift+Space is taken by IDEs and IMEs on Windows and Linux.
    expect(sideChatWindow).toContain('if (environment.platform !== "darwin") return;');
    expect(sideChatWindow).toContain("Electron.globalShortcut.register(FORK_SIDE_CHAT_ACCELERATOR");
    expect(desktopApp).toMatch(
      /fork:begin fork-side-chat[\s\S]*?yield\* installForkSideChat\(\);[\s\S]*?fork:end fork-side-chat/u,
    );
  });

  it("wires the side chat like the main window", () => {
    // Context menu, links, navigation guard and the quit shortcut come from
    // the one function the main window uses, not a copy.
    expect(sideChatWindow).toContain("yield* desktopWindow.wireRendererWindow(window);");
    expect(desktopWindow).toMatch(
      /const wireRendererWindow = \(window: Electron\.BrowserWindow\): void => \{[\s\S]*?installContextMenu\(window, window\.webContents\);[\s\S]*?isSameOriginRendererNavigation\([\s\S]*?makeQuitShortcutHandler\(/u,
    );
    expect(desktopWindow).toMatch(/\n {4}wireRendererWindow\(window\);\n/u);
    // Quitting is the app's own state, not a second flag.
    expect(sideChatWindow).toContain("if (Ref.getUnsafe(state.quitting)) return;");
  });

  it("loads the app as the side-chat surface in a panel that does not stay on top", () => {
    expect(sideChatWindow).toContain('url.searchParams.set("surface", "side-chat")');
    expect(sideChatWindow).toContain('type: "panel"');
    expect(sideChatWindow).toContain("window.setAlwaysOnTop(false)");
    // Hide, never close, until quit.
    expect(sideChatWindow).toMatch(
      /if \(Ref\.getUnsafe\(state\.quitting\)\) return;\s*event\.preventDefault\(\);/u,
    );
  });

  it("keeps the side chat out of window lookups and broadcasts", () => {
    expect(sideChatWindow).toContain("markForkAuxiliaryWindow(window);");
    expect(electronWindow).toContain("windows.filter((window) => !isForkAuxiliaryWindow(window))");
    expect(electronWindow).toContain(
      "const first = Option.fromNullishOr((yield* listAppWindows)[0] ?? null);",
    );
    // Menu actions, SnapShot and zoom never land in a focused side chat.
    expect(electronWindow).toMatch(
      /if \(Option\.isSome\(focused\) && isForkAuxiliaryWindow\(focused\.value\)\) \{\s*return yield\* currentMainOrFirst;/u,
    );
    // Preview frames and update state are not sent to it.
    expect(electronWindow.match(/const windows = yield\* listAppWindows;/gu)).toHaveLength(2);
  });

  it("sends a fresh chat on hide through the fork bridge", () => {
    expect(sideChatWindow).toContain('FORK_SIDE_CHAT_FRESH_CHANNEL = "fork:side-chat-fresh"');
    expect(desktopPreload).toMatch(
      /fork:begin fork-side-chat[\s\S]*?ipcRenderer\.on\("fork:side-chat-fresh", receive\)[\s\S]*?fork:end fork-side-chat/u,
    );
    expect(shell).toContain("readSideChatBridge()?.onFresh(");
    expect(shell).toContain("void startScratchThread(environmentId);");
    // A draft is kept; anything else reloads to `/`, which drops the storage copies.
    expect(shell).toContain(
      'if (!router.state.location.pathname.startsWith("/draft/")) reloadToFreshChat();',
    );
  });

  it("keeps the index landing from racing the first side chat", () => {
    expect(shell).toContain('{pathname === "/" ? null : children}');
  });

  it("re-reads client settings when a desktop window gains focus", () => {
    expect(settings).toMatch(
      /fork:begin fork-side-chat[\s\S]*?if \(isElectron\) window\.addEventListener\("focus", refreshClientSettingsOnFocus\);[\s\S]*?fork:end fork-side-chat/u,
    );
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
});
