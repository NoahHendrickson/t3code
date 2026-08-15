/**
 * Fork-owned desktop IPC — see `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Turns native macOS vibrancy on and off for the main window so the Cool Darker
 * sidebar can show the desktop wallpaper. The main window only — the preview
 * picture-in-picture window and the WSL splash carry their own fills and none of
 * the fork's CSS. Deliberately kept out of
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
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import { FORK_VIBRANCY_MATERIAL, setForkGlassActive } from "./ForkGlassState.ts";

export const FORK_SET_SIDEBAR_VIBRANCY_CHANNEL = "fork:set-sidebar-vibrancy";

/** Shared with the window's construction options — see ForkGlassState. */
const VIBRANCY_MATERIAL = FORK_VIBRANCY_MATERIAL;

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

    // The main window only, not syncAllAppearance. That walks every
    // BrowserWindow, which includes the picture-in-picture preview window
    // (preview/Manager.ts, its own #111111 fill and no fork CSS) and the WSL
    // connecting splash. Handing those the material makes any previewed page
    // without an opaque background render see-through, and restoring would
    // repaint them with the app's fill instead of their own. The sidebar lives
    // in the main window; the blast radius should match.
    const main = yield* electronWindow.main;
    const restore = opaqueWindowBackground();
    if (Option.isSome(main) && !main.value.isDestroyed()) {
      main.value.setVibrancy(enabled ? VIBRANCY_MATERIAL : null);
      main.value.setBackgroundColor(enabled ? TRANSPARENT_BACKGROUND : restore);
    }

    yield* Effect.logDebug("fork sidebar vibrancy applied", {
      requested: request.enabled,
      applied: enabled,
      platform,
    });

    return enabled;
  }),
});
