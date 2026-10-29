// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * The side chat spans the desktop main process, the preload and several
 * seams in the web app. Each seam compiles on its own if a sync drops
 * another, so the pieces that must agree — the shortcut, the shared window
 * wiring, the surface flag, the fresh channel, the storage isolation, the
 * settings refresh, the root's side-chat branch and its Glass — are pinned
 * here.
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
const surface = readSibling("../custom/sideChat/surface.ts");
const glassStage = readSibling("../theme.custom.glass-stage.css");
const headline = readSibling("../overrides/components/chat/DraftHeroHeadline.tsx");

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
    // Upstream now skips its own auxiliary windows here too; the fork keeps both filters.
    expect(electronWindow).toMatch(
      /const first = Option\.fromNullishOr\(\s*\(yield\* listAppWindows\)\.find\(\(window\) => !auxiliaryWindows\.has\(window\)\) \?\? null,\s*\);/u,
    );
    // Menu actions, SnapShot and zoom never land in a focused side chat.
    expect(electronWindow).toMatch(
      /if \(Option\.isSome\(focused\) && isForkAuxiliaryWindow\(focused\.value\)\) \{\s*return yield\* currentMainOrFirst;/u,
    );
    // Preview frames and update state are not sent to it.
    expect(electronWindow.match(/const windows = yield\* listAppWindows;/gu)).toHaveLength(1);
    // The appearance sync is upstream's walk again: the side chat owns its
    // glass per window, so an OS light/dark switch repaints its opaque fill.
    expect(electronWindow).toMatch(
      /syncAllAppearance: [\s\S]*?const windows = yield\* listWindows;\s*for \(const window of windows\)/u,
    );
  });

  it("is one pane of Glass", () => {
    // Construction-only, like the main window: a window built without the
    // material can never gain it later.
    expect(sideChatWindow).toMatch(
      /vibrancy: FORK_VIBRANCY_MATERIAL,\s*visualEffectState: "active",/u,
    );
    // The stage card fills the window: no gutter, corners or rim.
    expect(surface).toContain(
      'document.documentElement.setAttribute("data-fork-side-chat", "true");',
    );
    expect(glassStage).toMatch(
      /\[data-fork-side-chat="true"\][^{]*\{\s*--fork-glass-card-inset: 0px;\s*--fork-glass-card-radius: 0px;\s*\}/u,
    );
    expect(glassStage).toMatch(
      /\[data-fork-side-chat="true"\][^{]*\[data-fork-stage-card\]\)::before \{\s*box-shadow: none;\s*\}/u,
    );
  });

  it("asks for a quick question on a fresh side chat", () => {
    expect(headline).toMatch(/isSideChatSurface\s*\?\s*"Got a question\?"/u);
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
      /fork:begin fork-side-chat[\s\S]*?if \(isElectron && typeof window !== "undefined"\) \{\s*window\.addEventListener\("focus", refreshClientSettingsOnFocus\);[\s\S]*?fork:end fork-side-chat/u,
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
