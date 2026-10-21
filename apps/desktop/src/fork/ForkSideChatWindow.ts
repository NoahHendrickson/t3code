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
 * closed, so later presses open instantly. Hiding tells the renderer, which
 * readies a fresh chat for the next open. It is a non-activating panel at the
 * normal window level: the shortcut puts it in front of whatever app is
 * active without pulling the main T3 window forward, and clicking another
 * window sends it behind like any other window.
 *
 * macOS only. Ctrl+Shift+Space, the chord's Windows and Linux form, is
 * JetBrains' and VS Code's parameter hints and a common IME switch, and a
 * global shortcut would take it from every app.
 */
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as DesktopState from "../app/DesktopState.ts";
import { getDesktopUrl } from "../electron/ElectronProtocol.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import { markForkAuxiliaryWindow } from "./ForkAuxiliaryWindows.ts";

/** Not a macOS system shortcut, and not taken by T3's keymap, SnapShot,
    ChatGPT (⌥Space) or Claude (double ⌥). */
const FORK_SIDE_CHAT_ACCELERATOR = "Command+Shift+Space";
/** Main → side-chat renderer: the window was hidden; ready the next chat. */
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
  if (environment.platform !== "darwin") return;
  const state = yield* DesktopState.DesktopState;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const electronTheme = yield* ElectronTheme.ElectronTheme;
  // The app's context, so the shortcut's logs reach the desktop logger.
  const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
  const applicationUrl = getDesktopUrl(environment.isDevelopment);

  let sideChat: Electron.BrowserWindow | null = null;

  const live = (): Electron.BrowserWindow | null =>
    sideChat !== null && !sideChat.isDestroyed() ? sideChat : null;

  const bringForward = (window: Electron.BrowserWindow) => {
    // Front without activating the app (show() would), then key.
    window.showInactive();
    window.focus();
  };

  const hide = (window: Electron.BrowserWindow) => {
    window.hide();
    // Asked for now, while hidden, so the next open never shows the previous
    // chat first.
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
      type: "panel",
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      backgroundColor: shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
      titleBarStyle: "hiddenInset",
      // The main window's lights sit on its 52px header's axis; the side
      // chat's header is the same chat header.
      trafficLightPosition: { x: 16, y: 19 },
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
    window.setAlwaysOnTop(false);
    yield* desktopWindow.wireRendererWindow(window);
    // The red button and ⌘W hide it; only quitting closes it.
    window.on("close", (event) => {
      if (Ref.getUnsafe(state.quitting)) return;
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
