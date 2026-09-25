// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-glass-floor-color`.
 *
 * The estimate crosses three files by a channel string: the desktop method,
 * the preload bridge and the renderer helper. A sync that drops any one of
 * them leaves the others compiling and the popups quietly back on the
 * palette's hand-measured floor. The channel, the registration, the bridge
 * shape and the token the renderer writes are pinned here, and the helper's
 * own behaviour is run against a fake bridge.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_GLASS_FLOOR_TOKEN, syncForkGlassFloorColor } from "../custom/forkGlassFloorColor";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const desktopMethod = readSibling("../../../desktop/src/fork/ForkGlassFloorColor.ts");
const desktopHandlers = readSibling("../../../desktop/src/ipc/DesktopIpcHandlers.ts");
const desktopPreload = readSibling("../../../desktop/src/preload.ts");
const renderer = readSibling("../custom/forkGlassFloorColor.ts");
const forkTheme = readSibling("../custom/forkTheme.ts");
const palettes = readSibling("../theme.custom.palettes.css");
const customizations = readSibling("../../../../.fork/customizations.yaml");

const CHANNEL = "fork:glass-floor-color";
const CHANGED_CHANNEL = "fork:glass-floor-color-changed";

describe("fork guard: fork-glass-floor-color", () => {
  it("wires one channel through the desktop method, the preload and the handlers", () => {
    expect(desktopMethod).toContain(`FORK_GLASS_FLOOR_COLOR_CHANNEL = "${CHANNEL}"`);
    expect(desktopMethod).toContain(
      `FORK_GLASS_FLOOR_COLOR_CHANGED_CHANNEL = "${CHANGED_CHANNEL}"`,
    );
    expect(desktopPreload).toContain(`ipcRenderer.invoke("${CHANNEL}", { sidebarWidth })`);
    expect(desktopPreload).toContain(`ipcRenderer.on("${CHANGED_CHANNEL}", receive)`);
    expect(desktopPreload).toMatch(
      /fork:begin fork-glass-floor-color[\s\S]*?glassFloorColor: \{[\s\S]*?fork:end fork-glass-floor-color/u,
    );
    expect(desktopHandlers).toMatch(
      /fork:begin fork-glass-floor-color[\s\S]*?yield\* installForkGlassFloorColorIpc\(\);[\s\S]*?fork:end fork-glass-floor-color/u,
    );
    expect(customizations).toContain("- id: fork-glass-floor-color");
  });

  it("reads the wallpaper from macOS's store, never through Finder automation", () => {
    // The store needs no permission prompt; an osascript route would raise
    // one on first use.
    expect(desktopMethod).toContain("com.apple.wallpaper/Store/Index.plist");
    expect(desktopMethod).not.toContain("osascript");
    // The strip under the sidebar, composited under the panel tint the
    // palette paints (rgb(22 22 22 / 82%)); the alpha runs 3% heavier than
    // the stylesheet's, calibrated against the panel measured on screen.
    expect(desktopMethod).toContain("const PANEL_TINT = 22;");
    expect(desktopMethod).toContain("const PANEL_TINT_ALPHA = 0.85;");
    expect(palettes).toContain("--sidebar: rgb(22 22 22 / 82%);");
    // Anything unreadable resolves null rather than failing the invoke.
    expect(desktopMethod).toContain(".catch(() => null)");
    // Cover, not contain: the smaller ratio fills the longer side.
    expect(desktopMethod).toContain(
      "const scale = Math.min(thumbnail.width / display.width, thumbnail.height / display.height);",
    );
    // No sampling while glass is off, and no repeated full-size decode.
    expect(desktopMethod).toContain("if (!isForkGlassActive()) return;");
    expect(desktopMethod).toContain("thumbnailCache?.key === key");
    // The import sits in its own fence, not the vibrancy customization's.
    expect(desktopHandlers).toMatch(
      /fork:begin fork-glass-floor-color[^]*?import \{ installForkGlassFloorColorIpc \}[^]*?fork:end fork-glass-floor-color/u,
    );
  });

  it("writes the estimate over the floor token only while glass is on", async () => {
    expect(FORK_GLASS_FLOOR_TOKEN).toBe("--fork-popup-glass-floor");
    expect(renderer).toContain("root.style.setProperty(FORK_GLASS_FLOOR_TOKEN");
    // forkTheme chains it on the vibrancy answer, not on the palette choice.
    expect(forkTheme).toMatch(
      /syncForkSidebarVibrancy\(activePalette === COOL_DARKER_THEME\)\s*\.then\(\(applied\) => \{[\s\S]{0,120}?return syncForkGlassFloorColor\(applied\);\s*\}\)[\s\S]{0,240}?\.catch\(/u,
    );

    const listeners: Array<(color: { r: number; g: number; b: number }) => void> = [];
    let removed = 0;
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      glassFloorColor: {
        read: async () => ({ r: 40, g: 30, b: 50 }),
        onChange: (listener: (color: { r: number; g: number; b: number }) => void) => {
          listeners.push(listener);
          return () => {
            removed += 1;
          };
        },
      },
    };
    const style = new Map<string, string>();
    const root = {
      style: {
        setProperty: (name: string, value: string) => style.set(name, value),
        removeProperty: (name: string) => style.delete(name),
      },
    } as unknown as HTMLElement;
    try {
      await syncForkGlassFloorColor(true, root);
      expect(style.get(FORK_GLASS_FLOOR_TOKEN)).toBe("rgb(40 30 50)");
      listeners[0]?.({ r: 1, g: 2, b: 3 });
      expect(style.get(FORK_GLASS_FLOOR_TOKEN)).toBe("rgb(1 2 3)");
      await syncForkGlassFloorColor(false, root);
      expect(style.has(FORK_GLASS_FLOOR_TOKEN)).toBe(false);
      expect(removed).toBe(1);
      // A superseded change listener never writes.
      listeners[0]?.({ r: 9, g: 9, b: 9 });
      expect(style.has(FORK_GLASS_FLOOR_TOKEN)).toBe(false);
    } finally {
      delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
    }
  });
});
