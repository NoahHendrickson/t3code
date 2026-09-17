// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off -- The move/resize debounce runs on Electron window events outside any Effect fiber.
/**
 * Fork-owned desktop IPC — see `.fork/customizations.yaml#fork-glass-floor-color`.
 *
 * Estimates the colour the Glass sidebar reads on screen, so the opaque
 * popups (fork-popup-surface) can stand on it instead of on a hand-measured
 * constant. Nothing can read that colour off the screen: it is the desktop
 * wallpaper drawn by macOS behind a transparent window, outside the page and
 * outside `capturePage`. So it is rebuilt from the wallpaper image instead —
 * the file macOS records in its wallpaper store, shrunk to a thumbnail,
 * cropped to the strip under the sidebar using the window's bounds on its
 * display, averaged, and composited under the panel's own tint
 * (rgb(22 22 22) at 82%, theme.custom.palettes.css).
 *
 * The store is `~/Library/Application Support/com.apple.wallpaper/Store/
 * Index.plist`, a binary plist whose per-display choices embed their own
 * binary plists carrying a `file://` URL. Reading it needs no permission and
 * no Finder automation prompt; the trade is that it is undocumented, so a
 * store this code cannot read resolves `null` and the renderer keeps the
 * palette's measured token. Dynamic and video wallpapers resolve `null` the
 * same way — `sips` cannot thumbnail them to one frame worth trusting.
 *
 * macOS only, main window only. The renderer asks once when glass turns on
 * and is then told about changes: the window moving or resizing (the strip
 * under the sidebar moves across the wallpaper) and the app regaining focus
 * (the cheapest signal that the wallpaper may have been changed meanwhile).
 * Kept off `DesktopBridge` and out of `packages/contracts`, on the fork's own
 * bridge key, like the vibrancy call this rides on.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";

export const FORK_GLASS_FLOOR_COLOR_CHANNEL = "fork:glass-floor-color";
export const FORK_GLASS_FLOOR_COLOR_CHANGED_CHANNEL = "fork:glass-floor-color-changed";

/**
 * The Glass panel tint the wallpaper shows through: rgb(22 22 22 / 82%) in
 * theme.custom.palettes.css. The alpha here runs 3% heavier than the
 * stylesheet's because the vibrancy material dims the wallpaper a little on
 * top of the tint: calibrated against the panel measured on screen (rgb(51 33
 * 41) on a purple wallpaper), which a plain 82% blend overshot by ~8 levels.
 * This is the one dial if the popups drift from the panel.
 */
const PANEL_TINT = 22;
const PANEL_TINT_ALPHA = 0.85;
/** Thumbnail width the wallpaper is shrunk to before sampling. */
const SAMPLE_WIDTH = 96;
/** Window moves and resizes arrive per frame; one recompute per settle. */
const RECOMPUTE_DEBOUNCE_MS = 250;

const WALLPAPER_STORE = NodePath.join(
  NodeOS.homedir(),
  "Library/Application Support/com.apple.wallpaper/Store/Index.plist",
);

const Request = Schema.Struct({ sidebarWidth: Schema.Number });
const decodeRequest = Schema.decodeUnknownEffect(Request);

export type ForkGlassFloorColor = { readonly r: number; readonly g: number; readonly b: number };

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

/** The current wallpaper's path from macOS's wallpaper store, or null. */
async function readWallpaperPath(): Promise<string | null> {
  const xml = await execFile("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", WALLPAPER_STORE]);
  for (const match of xml.matchAll(/<data>([\s\S]*?)<\/data>/gu)) {
    const raw = Buffer.from((match[1] ?? "").replace(/\s+/gu, ""), "base64").toString("latin1");
    // Path characters only: a file URL percent-encodes spaces, so this never
    // reaches into the binary plist bytes around it.
    const url = /file:\/\/[A-Za-z0-9_\-.~%+@(),/]+/u.exec(raw);
    if (url) {
      const path = NodeURL.fileURLToPath(url[0]);
      try {
        await NodeFSP.access(path);
        return path;
      } catch {
        // A stale entry for a file that has since moved; keep looking.
      }
    }
  }
  return null;
}

/** A thumbnail of the wallpaper as a BGRA bitmap, via sips (HEIC included). */
async function readWallpaperThumbnail(
  wallpaperPath: string,
): Promise<{ width: number; height: number; bgra: Buffer } | null> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-fork-wallpaper-"));
  const thumbnail = NodePath.join(directory, "wallpaper.png");
  try {
    await execFile("/usr/bin/sips", [
      "-s",
      "format",
      "png",
      "-Z",
      String(SAMPLE_WIDTH),
      wallpaperPath,
      "--out",
      thumbnail,
    ]);
    const image = Electron.nativeImage.createFromPath(thumbnail);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    return { width, height, bgra: image.toBitmap() };
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
}

/**
 * The wallpaper's average under the sidebar's strip, composited under the
 * panel tint. macOS fills the display with the image (scaled to cover,
 * centred), so the strip's display coordinates map onto the thumbnail the
 * same way.
 */
function sampleFloor(
  thumbnail: { width: number; height: number; bgra: Buffer },
  display: Electron.Rectangle,
  strip: Electron.Rectangle,
): ForkGlassFloorColor {
  const scale = Math.max(thumbnail.width / display.width, thumbnail.height / display.height);
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
  const wallpaperPath = await readWallpaperPath();
  if (wallpaperPath === null) return null;
  const thumbnail = await readWallpaperThumbnail(wallpaperPath);
  if (thumbnail === null) return null;
  const bounds = window.getBounds();
  const display = Electron.screen.getDisplayMatching(bounds).bounds;
  const strip = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, sidebarWidth),
    height: bounds.height,
  };
  return sampleFloor(thumbnail, display, strip);
}

/** Windows already being followed for moves, resizes and focus. */
const followed = new WeakSet<Electron.BrowserWindow>();

function followWindow(window: Electron.BrowserWindow, sidebarWidth: number): void {
  if (followed.has(window)) return;
  followed.add(window);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  const recompute = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (inFlight || window.isDestroyed()) return;
      inFlight = true;
      void computeFloorColor(window, sidebarWidth)
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
    const platform = yield* HostProcessPlatform;
    const electronWindow = yield* ElectronWindow.ElectronWindow;

    yield* ipc.handle({
      channel: FORK_GLASS_FLOOR_COLOR_CHANNEL,
      handler: Effect.fn("desktop.ipc.fork.glassFloorColor")(function* (raw) {
        const { sidebarWidth } = yield* decodeRequest(raw);
        // The wallpaper store and the vibrancy it feeds are macOS's; elsewhere
        // the renderer keeps the palette token, and null says so.
        if (platform !== "darwin") return null;
        const main = yield* electronWindow.main;
        if (Option.isNone(main) || main.value.isDestroyed()) return null;
        const window = main.value;
        return yield* Effect.tryPromise({
          try: async () => {
            const color = await computeFloorColor(window, sidebarWidth);
            if (color !== null) followWindow(window, sidebarWidth);
            return color;
          },
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));
      }),
    });
  },
);
