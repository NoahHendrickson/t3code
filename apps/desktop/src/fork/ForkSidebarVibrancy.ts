/**
 * Fork-owned desktop IPC — see `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Turns native macOS vibrancy on and off for the window that asks, so the
 * Glass sidebar can show the desktop wallpaper. Only the main window and the
 * side chat (fork-side-chat) run the fork's renderer and its palette sync; the
 * preview picture-in-picture window and the WSL splash carry their own fills
 * and none of the fork's CSS, so they never ask. Deliberately kept out of
 * `packages/contracts` and out of the upstream `DesktopBridge`: the renderer
 * reaches it through the fork's own `forkDesktopBridge` key, so an upstream
 * sync never has to merge a contract this fork added.
 *
 * macOS only. Every other platform resolves `false` and leaves the window
 * opaque, which is why the renderer treats the resolved value — not the
 * requested one — as the answer to "is glass on right now".
 */
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import { isForkAuxiliaryWindow } from "./ForkAuxiliaryWindows.ts";
import { FORK_VIBRANCY_MATERIAL, setForkGlassActive } from "./ForkGlassState.ts";

const FORK_SET_SIDEBAR_VIBRANCY_CHANNEL = "fork:set-sidebar-vibrancy";

/**
 * The window is created with an opaque `backgroundColor`. Vibrancy only reaches
 * the glass if that fill stops painting, so enabling swaps in a fully
 * transparent background.
 */
const TRANSPARENT_BACKGROUND = "#00000000";

/**
 * Mirrors `getInitialWindowBackgroundColor` in `window/DesktopWindow.ts`, which
 * is module-private there. The renderer must NOT supply this: it only knows the
 * palette it is switching to, and an earlier cut had it ship Glass's stage
 * colour on every call — which repainted the window fill for Light, default
 * Dark, Westworld and both Neutral palettes. Resolving it here from
 * `nativeTheme` keeps the restore correct for whatever theme is actually
 * active. A fork guard pins these two values against DesktopWindow's.
 */
function opaqueWindowBackground(): string {
  return Electron.nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff";
}

function senderWindow(
  event: DesktopIpc.DesktopIpcInvokeEvent | undefined,
): Electron.BrowserWindow | null {
  const contents = event === undefined ? undefined : Electron.webContents.fromId(event.sender.id);
  return contents === undefined ? null : Electron.BrowserWindow.fromWebContents(contents);
}

export const ForkSidebarVibrancyRequest = Schema.Struct({
  enabled: Schema.Boolean,
});

export const setForkSidebarVibrancy = DesktopIpc.makeIpcMethod({
  channel: FORK_SET_SIDEBAR_VIBRANCY_CHANNEL,
  payload: ForkSidebarVibrancyRequest,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.fork.setSidebarVibrancy")(function* (request, event) {
    const platform = yield* HostProcess.Platform;
    const electronWindow = yield* ElectronWindow.ElectronWindow;

    // Vibrancy is a macOS material. Asking for it anywhere else is not an
    // error — the palette is still selectable, it just paints solid.
    const enabled = request.enabled && platform === "darwin";

    // The asking window only, not syncAllAppearance. That walks every
    // BrowserWindow, which includes the picture-in-picture preview window
    // (preview/Manager.ts, its own #111111 fill and no fork CSS) and the WSL
    // connecting splash. Handing those the material makes any previewed page
    // without an opaque background render see-through, and restoring would
    // repaint them with the app's fill instead of their own.
    const target = senderWindow(event) ?? Option.getOrNull(yield* electronWindow.main);
    if (target !== null && !target.isDestroyed()) {
      // The ownership flag belongs to the windows syncWindowAppearance walks,
      // which leaves out the side chat. Set before painting, so an appearance
      // sync racing this call sees the new owner and does not repaint the fill
      // out from under the material.
      if (!isForkAuxiliaryWindow(target)) setForkGlassActive(enabled);
      target.setVibrancy(enabled ? FORK_VIBRANCY_MATERIAL : null);
      target.setBackgroundColor(enabled ? TRANSPARENT_BACKGROUND : opaqueWindowBackground());
    }

    yield* Effect.logDebug("fork sidebar vibrancy applied", {
      requested: request.enabled,
      applied: enabled,
      platform,
    });

    return enabled;
  }),
});
