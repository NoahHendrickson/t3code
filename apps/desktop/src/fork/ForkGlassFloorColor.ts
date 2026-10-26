// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off -- The move/resize debounce runs on Electron window events outside any Effect fiber.
/**
 * Fork-owned desktop IPC — see `.fork/customizations.yaml#fork-glass-floor-color`.
 *
 * Estimates the colour the Glass sidebar reads on screen, so the opaque
 * surface-glass overlays (the scroll-to-end pill and its kin) can stand on it
 * instead of on a hand-measured constant. Nothing can read that colour off the screen: it is the desktop
 * wallpaper drawn by macOS behind a transparent window, outside the page and
 * outside `capturePage`. So it is rebuilt from the wallpaper image instead —
 * the file macOS reports for the window's display, shrunk to a thumbnail,
 * cropped to the strip under the sidebar using the window's bounds on its
 * display, averaged, and composited under the panel's own tint
 * (--fork-glass-tint at --fork-glass-panel-alpha, theme.custom.palettes.css).
 *
 * The file comes from `NSWorkspace.desktopImageURLForScreen`, run as JXA in
 * a short-lived `osascript`: the ObjC bridge calls AppKit in-process and
 * sends no Apple Events, so unlike a Finder or System Events script it raises
 * no automation prompt. macOS answers for the screen and the space showing on
 * it, so two monitors or spaces on different wallpapers each get their own.
 * Electron's display id on macOS is the `CGDirectDisplayID` AppKit reports
 * as `NSScreenNumber`. A screen with no file, or a file this code cannot
 * read, resolves `null` and the renderer keeps the palette's measured token.
 *
 * macOS only. Each Glass window (the main window and the side chat) samples
 * under itself: the window that asks is the one measured and followed. The
 * renderer asks once when glass turns on and is then told about changes: the
 * window moving or resizing (the strip under the sidebar moves across the
 * wallpaper) and the window regaining focus (the cheapest signal that the
 * wallpaper may have been changed meanwhile).
 * The expensive step — `sips` decoding a full-resolution wallpaper — runs
 * once per (path, mtime) and is cached, so a move or a refocus with the same
 * wallpaper is an `osascript`, a `stat` and an average over a 96px bitmap. The
 * listeners stay attached for the window's life but do nothing while that
 * window's glass is off, read from the state the vibrancy IPC keeps. Kept off
 * `DesktopBridge` and out of `packages/contracts`, on the fork's own bridge
 * key, like the vibrancy call this rides on.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import { forkSenderWindow, isForkGlassActive } from "./ForkGlassState.ts";

const FORK_GLASS_FLOOR_COLOR_CHANNEL = "fork:glass-floor-color";
const FORK_GLASS_FLOOR_COLOR_CHANGED_CHANNEL = "fork:glass-floor-color-changed";

/**
 * The Glass panel tint the wallpaper shows through: --fork-glass-tint at
 * --fork-glass-panel-alpha in theme.custom.palettes.css, restated because the
 * main process cannot read the stylesheet. The alpha here runs 3% heavier
 * than the stylesheet's because the vibrancy material dims the wallpaper a
 * little on top of the tint. That offset was calibrated once, with the panel
 * at 82% (rgb(51 33 41) measured on a purple wallpaper, which a plain blend
 * at the stylesheet's alpha overshot by ~8 levels), and is extrapolated to
 * every alpha since; the material's dimming is multiplicative, so re-measure
 * if the overlays drift from the panel. This is the one dial when they do.
 */
const PANEL_TINT = 30;
const PANEL_TINT_ALPHA = 0.63;
/** Thumbnail width the wallpaper is shrunk to before sampling. */
const SAMPLE_WIDTH = 96;
/** Window moves and resizes arrive per frame; one recompute per settle. */
const RECOMPUTE_DEBOUNCE_MS = 250;

const WALLPAPER_SCRIPT = `function run(argv) {
  ObjC.import("AppKit");
  const screens = $.NSScreen.screens;
  for (let i = 0; i < screens.count; i++) {
    const screen = screens.objectAtIndex(i);
    if (screen.deviceDescription.objectForKey("NSScreenNumber").js !== Number(argv[0])) continue;
    const url = $.NSWorkspace.sharedWorkspace.desktopImageURLForScreen(screen);
    return url.isNil() ? "" : url.path.js;
  }
  return "";
}`;

const Request = Schema.Struct({ sidebarWidth: Schema.Number });
const decodeRequest = Schema.decodeUnknownEffect(Request);

export type ForkGlassFloorColor = { readonly r: number; readonly g: number; readonly b: number };

type Thumbnail = { readonly width: number; readonly height: number; readonly bgra: Buffer };

function execFile(file: string, args: ReadonlyArray<string>): Promise<string> {
  return new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      file,
      [...args],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

/** The wallpaper file macOS shows on the given display, or null. */
async function readWallpaperPath(displayId: number): Promise<string | null> {
  const output = await execFile("/usr/bin/osascript", [
    "-l",
    "JavaScript",
    "-e",
    WALLPAPER_SCRIPT,
    String(displayId),
  ]);
  const path = output.trim();
  if (path === "") return null;
  try {
    await NodeFSP.access(path);
    return path;
  } catch {
    return null;
  }
}

let thumbnailCache: { readonly key: string; readonly thumbnail: Thumbnail } | null = null;

/**
 * A thumbnail of the wallpaper as a BGRA bitmap, via sips (HEIC included),
 * cached on the file's path and mtime so the full-resolution decode runs
 * once per wallpaper rather than once per refocus.
 */
async function readWallpaperThumbnail(wallpaperPath: string): Promise<Thumbnail | null> {
  const stat = await NodeFSP.stat(wallpaperPath);
  const key = `${wallpaperPath}|${stat.mtimeMs}`;
  if (thumbnailCache?.key === key) return thumbnailCache.thumbnail;
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-fork-wallpaper-"));
  const thumbnailPath = NodePath.join(directory, "wallpaper.png");
  try {
    await execFile("/usr/bin/sips", [
      "-s",
      "format",
      "png",
      "-Z",
      String(SAMPLE_WIDTH),
      wallpaperPath,
      "--out",
      thumbnailPath,
    ]);
    const image = Electron.nativeImage.createFromPath(thumbnailPath);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const thumbnail = { width, height, bgra: image.toBitmap() };
    thumbnailCache = { key, thumbnail };
    return thumbnail;
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
}

/**
 * The wallpaper's average under the sidebar's strip, composited under the
 * panel tint. macOS fills the display with the image — scaled to cover,
 * centred, the overflow cropped — so the strip's display coordinates map
 * onto the thumbnail the same way. Cover is the smaller of the two ratios:
 * the image must be drawn big enough to fill the longer side.
 */
function sampleFloor(
  thumbnail: Thumbnail,
  display: Electron.Rectangle,
  strip: Electron.Rectangle,
): ForkGlassFloorColor {
  const scale = Math.min(thumbnail.width / display.width, thumbnail.height / display.height);
  const drawnWidth = thumbnail.width / scale;
  const drawnHeight = thumbnail.height / scale;
  const offsetX = (display.width - drawnWidth) / 2;
  const offsetY = (display.height - drawnHeight) / 2;
  const toImageX = (x: number) => Math.round((x - display.x - offsetX) * scale);
  const toImageY = (y: number) => Math.round((y - display.y - offsetY) * scale);
  const x0 = Math.max(0, toImageX(strip.x));
  const x1 = Math.min(thumbnail.width, toImageX(strip.x + strip.width));
  const y0 = Math.max(0, toImageY(strip.y));
  const y1 = Math.min(thumbnail.height, toImageY(strip.y + strip.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * thumbnail.width + x) * 4;
      b += thumbnail.bgra[i] ?? 0;
      g += thumbnail.bgra[i + 1] ?? 0;
      r += thumbnail.bgra[i + 2] ?? 0;
      n++;
    }
  }
  if (n === 0) {
    // The window is off its display's wallpaper entirely; take the whole image.
    for (let i = 0; i < thumbnail.bgra.length; i += 4) {
      b += thumbnail.bgra[i] ?? 0;
      g += thumbnail.bgra[i + 1] ?? 0;
      r += thumbnail.bgra[i + 2] ?? 0;
      n++;
    }
  }
  const under = (channel: number) =>
    Math.round(PANEL_TINT * PANEL_TINT_ALPHA + (channel / Math.max(n, 1)) * (1 - PANEL_TINT_ALPHA));
  return { r: under(r), g: under(g), b: under(b) };
}

async function computeFloorColor(
  window: Electron.BrowserWindow,
  sidebarWidth: number,
): Promise<ForkGlassFloorColor | null> {
  const bounds = window.getBounds();
  const display = Electron.screen.getDisplayMatching(bounds);
  const wallpaperPath = await readWallpaperPath(display.id);
  if (wallpaperPath === null) return null;
  const thumbnail = await readWallpaperThumbnail(wallpaperPath);
  if (thumbnail === null) return null;
  const strip = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, sidebarWidth),
    height: bounds.height,
  };
  return sampleFloor(thumbnail, display.bounds, strip);
}

/**
 * Windows being followed for moves, resizes and focus, with the sidebar
 * width the renderer last reported — a later read with a resized sidebar
 * updates it, and every recompute samples the current strip.
 */
const followed = new WeakMap<Electron.BrowserWindow, { sidebarWidth: number }>();

function followWindow(window: Electron.BrowserWindow, sidebarWidth: number): void {
  const known = followed.get(window);
  if (known) {
    known.sidebarWidth = sidebarWidth;
    return;
  }
  const state = { sidebarWidth };
  followed.set(window, state);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  const recompute = () => {
    // Glass off means no one is listening and nothing to sample for; the
    // vibrancy IPC keeps this flag, so no second channel is needed.
    if (!isForkGlassActive(window)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (inFlight || window.isDestroyed() || !isForkGlassActive(window)) return;
      inFlight = true;
      void computeFloorColor(window, state.sidebarWidth)
        .then((color) => {
          if (color !== null && !window.isDestroyed()) {
            window.webContents.send(FORK_GLASS_FLOOR_COLOR_CHANGED_CHANNEL, color);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    }, RECOMPUTE_DEBOUNCE_MS);
  };
  const onFocus = (_event: Electron.Event, focused: Electron.BrowserWindow) => {
    if (focused === window) recompute();
  };
  window.on("move", recompute);
  window.on("resize", recompute);
  Electron.app.on("browser-window-focus", onFocus);
  window.once("closed", () => {
    if (timer) clearTimeout(timer);
    Electron.app.removeListener("browser-window-focus", onFocus);
  });
}

export const installForkGlassFloorColorIpc = Effect.fn("desktop.fork.installGlassFloorColor")(
  function* () {
    const ipc = yield* DesktopIpc.DesktopIpc;
    const platform = yield* HostProcess.Platform;

    yield* ipc.handle({
      channel: FORK_GLASS_FLOOR_COLOR_CHANNEL,
      handler: Effect.fn("desktop.ipc.fork.glassFloorColor")(function* (raw, event) {
        const { sidebarWidth } = yield* decodeRequest(raw);
        // The wallpaper lookup and the vibrancy it feeds are macOS's; elsewhere
        // the renderer keeps the palette token, and null says so.
        if (platform !== "darwin") return null;
        const window = yield* forkSenderWindow(event);
        if (window === null || window.isDestroyed()) return null;
        // Anything unreadable — the screen, the image, the display — resolves
        // null rather than failing the invoke; the renderer keeps its token.
        return yield* Effect.promise(() =>
          computeFloorColor(window, sidebarWidth)
            .then((color) => {
              if (color !== null) followWindow(window, sidebarWidth);
              return color;
            })
            .catch(() => null),
        );
      }),
    });
  },
);
