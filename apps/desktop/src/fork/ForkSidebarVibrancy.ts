/**
 * Fork-owned desktop IPC — see `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Turns native macOS vibrancy on and off for every open window so the Cool
 * Darker sidebar can show the desktop wallpaper. Deliberately kept out of
 * `packages/contracts` and out of the upstream `DesktopBridge`: the renderer
 * reaches it through the fork's own `forkDesktopBridge` key, so an upstream
 * sync never has to merge a contract this fork added.
 *
 * macOS only. Every other platform resolves `false` and leaves the window
 * opaque, which is why the renderer treats the resolved value — not the
 * requested one — as the answer to "is glass on right now".
 */
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import { setForkGlassActive } from "./ForkGlassState.ts";

export const FORK_SET_SIDEBAR_VIBRANCY_CHANNEL = "fork:set-sidebar-vibrancy";

/**
 * `under-window` is the material Cursor-style sidebars use: it samples the
 * wallpaper rather than the windows stacked behind the app, so the glass stays
 * calm when other apps move underneath it.
 */
const VIBRANCY_MATERIAL = "under-window" as const;

/**
 * The window is created with an opaque `backgroundColor`. Vibrancy only reaches
 * the glass if that fill stops painting, so enabling swaps in a fully
 * transparent background.
 */
const TRANSPARENT_BACKGROUND = "#00000000";

/**
 * Mirrors `getInitialWindowBackgroundColor` in `window/DesktopWindow.ts`, which
 * is module-private there. The renderer must NOT supply this: it only knows the
 * palette it is switching to, and an earlier cut had it ship Cool Darker's stage
 * colour on every call — which repainted the window fill for Light, default
 * Dark, Cool Dark and both Neutral palettes. Resolving it here from
 * `nativeTheme` keeps the restore correct for whatever theme is actually
 * active. A fork guard pins these two values against DesktopWindow's.
 */
function opaqueWindowBackground(): string {
  return Electron.nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff";
}

export const ForkSidebarVibrancyRequest = Schema.Struct({
  enabled: Schema.Boolean,
});

export const setForkSidebarVibrancy = DesktopIpc.makeIpcMethod({
  channel: FORK_SET_SIDEBAR_VIBRANCY_CHANNEL,
  payload: ForkSidebarVibrancyRequest,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.fork.setSidebarVibrancy")(function* (request) {
    const platform = yield* HostProcessPlatform;
    const electronWindow = yield* ElectronWindow.ElectronWindow;

    // Vibrancy is a macOS material. Asking for it anywhere else is not an
    // error — the palette is still selectable, it just paints solid.
    const enabled = request.enabled && platform === "darwin";

    // Set before painting, so an appearance sync racing this call sees the new
    // owner and does not repaint the fill out from under the material.
    setForkGlassActive(enabled);

    const restore = opaqueWindowBackground();
    yield* electronWindow.syncAllAppearance((window) =>
      Effect.sync(() => {
        window.setVibrancy(enabled ? VIBRANCY_MATERIAL : null);
        window.setBackgroundColor(enabled ? TRANSPARENT_BACKGROUND : restore);
      }),
    );

    yield* Effect.logDebug("fork sidebar vibrancy applied", {
      requested: request.enabled,
      applied: enabled,
      platform,
    });

    return enabled;
  }),
});
