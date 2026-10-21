/**
 * The side chat — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * A system-wide shortcut opens a small window that is only a chat: the same
 * renderer as the main window, loaded with `?surface=side-chat` so the web
 * app mounts its side-chat shell (apps/web/src/custom/sideChat) instead of
 * the workspace. Each side chat is an ordinary "No project" thread, so it
 * also shows in the main window's sidebar.
 *
 * The window is created on the first press and then hidden rather than
 * closed, so later presses open instantly. Hiding asks the renderer for a
 * fresh chat, ready for the next open. On macOS it is a non-activating panel
 * at the normal window level: the shortcut puts it in front of whatever app
 * is active without pulling the main T3 window forward, and clicking another
 * window sends it behind like any other window.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import { getDesktopUrl } from "../electron/ElectronProtocol.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { isForkAuxiliaryWindow, markForkAuxiliaryWindow } from "./ForkAuxiliaryWindows.ts";

/** Not a macOS system shortcut, and not taken by T3's keymap, SnapShot,
    ChatGPT (⌥Space) or Claude (double ⌥). */
const FORK_SIDE_CHAT_ACCELERATOR = "CommandOrControl+Shift+Space";
/** Main → side-chat renderer: replace the open chat with a fresh one. */
const FORK_SIDE_CHAT_FRESH_CHANNEL = "fork:side-chat-fresh";

const SIDE_CHAT_WIDTH = 560;
const SIDE_CHAT_HEIGHT = 680;

const { logInfo, logWarning } = makeComponentLogger("fork-side-chat");

/** The side chat's URL: the app root with the surface flag ahead of the hash,
    so it survives every hash-router navigation inside the window. */
function sideChatUrl(applicationUrl: string): string {
  const url = new URL(applicationUrl);
  url.searchParams.set("surface", "side-chat");
  return url.toString();
}

export const installForkSideChat = Effect.fn("desktop.fork.installSideChat")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const electronShell = yield* ElectronShell.ElectronShell;
  const electronTheme = yield* ElectronTheme.ElectronTheme;
  const context = yield* Effect.context<ElectronShell.ElectronShell>();
  const runPromise = Effect.runPromiseWith(context);
  const isMac = environment.platform === "darwin";
  const applicationUrl = getDesktopUrl(environment.isDevelopment);

  let sideChat: Electron.BrowserWindow | null = null;
  let quitting = false;

  const live = (): Electron.BrowserWindow | null =>
    sideChat !== null && !sideChat.isDestroyed() ? sideChat : null;

  const bringForward = (window: Electron.BrowserWindow) => {
    if (isMac) {
      // Front without activating the app (show() would), then key.
      window.showInactive();
    } else {
      window.show();
    }
    window.focus();
  };

  const hide = (window: Electron.BrowserWindow) => {
    window.hide();
    // Fresh every time: the next open starts a new chat. Asked for now, while
    // hidden, so the open itself never shows the previous chat first.
    window.webContents.send(FORK_SIDE_CHAT_FRESH_CHANNEL);
  };

  const create = Effect.gen(function* () {
    const shouldUseDarkColors = yield* electronTheme.shouldUseDarkColors;
    const cursorDisplay = Electron.screen.getDisplayNearestPoint(
      Electron.screen.getCursorScreenPoint(),
    ).workArea;
    const window = yield* electronWindow.create({
      width: SIDE_CHAT_WIDTH,
      height: SIDE_CHAT_HEIGHT,
      minWidth: 400,
      minHeight: 420,
      x: Math.round(cursorDisplay.x + (cursorDisplay.width - SIDE_CHAT_WIDTH) / 2),
      y: Math.round(cursorDisplay.y + (cursorDisplay.height - SIDE_CHAT_HEIGHT) / 2),
      show: false,
      title: "Side chat",
      autoHideMenuBar: true,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      backgroundColor: shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
      ...(isMac
        ? {
            type: "panel",
            titleBarStyle: "hiddenInset" as const,
            // The main window's lights sit on its 52px header's axis; the side
            // chat's header is the same chat header.
            trafficLightPosition: { x: 16, y: 19 },
          }
        : {}),
      webPreferences: {
        preload: environment.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    markForkAuxiliaryWindow(window);
    // A panel floats by default; the side chat should only come forward when
    // asked, and fall behind other windows once it loses focus.
    if (isMac) window.setAlwaysOnTop(false);

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (Option.isSome(ElectronShell.parseSafeExternalUrl(url))) {
        void runPromise(electronShell.openExternal(url));
      }
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin === new URL(applicationUrl).origin) return;
      event.preventDefault();
      if (Option.isSome(ElectronShell.parseSafeExternalUrl(url))) {
        void runPromise(electronShell.openExternal(url));
      }
    });
    // The red button and ⌘W hide it; only quitting closes it.
    window.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      hide(window);
    });
    window.on("page-title-updated", (event) => event.preventDefault());
    window.on("closed", () => {
      if (sideChat === window) sideChat = null;
    });
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) bringForward(window);
    });
    void window.loadURL(sideChatUrl(applicationUrl)).catch(() => undefined);
    return window;
  });

  const toggle = Effect.gen(function* () {
    const window = live();
    if (window === null) {
      // The renderer starts its first chat on mount, and ready-to-show opens it.
      sideChat = yield* create;
      return;
    }
    if (window.isVisible() && window.isFocused()) {
      hide(window);
      return;
    }
    // Hidden (already holding a fresh chat) or open behind other windows.
    bringForward(window);
  }).pipe(
    Effect.catch((error) => logWarning("failed to open the side chat", { message: String(error) })),
  );

  yield* Effect.sync(() => {
    Electron.app.on("before-quit", () => {
      quitting = true;
    });
    // A hidden side chat still counts as an open window, which would keep
    // Windows and Linux running after the main window closes. Close it with
    // the last real window so the app quits as it did before.
    Electron.app.on("browser-window-created", (_event, created) => {
      created.once("closed", () => {
        if (isMac) return;
        const window = live();
        if (window === null) return;
        const others = Electron.BrowserWindow.getAllWindows().filter(
          (candidate) => !candidate.isDestroyed() && !isForkAuxiliaryWindow(candidate),
        );
        if (others.length === 0) window.destroy();
      });
    });
    Electron.app.on("will-quit", () => {
      Electron.globalShortcut.unregister(FORK_SIDE_CHAT_ACCELERATOR);
    });
  });

  const registered = yield* Effect.sync(() =>
    Electron.globalShortcut.register(FORK_SIDE_CHAT_ACCELERATOR, () => {
      void runPromise(toggle);
    }),
  );
  if (registered) {
    yield* logInfo("side chat shortcut registered", { accelerator: FORK_SIDE_CHAT_ACCELERATOR });
  } else {
    // Another app already owns the chord; the rest of the app is unaffected.
    yield* logWarning("side chat shortcut is taken by another app", {
      accelerator: FORK_SIDE_CHAT_ACCELERATOR,
    });
  }
});
