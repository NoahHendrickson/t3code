// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-glass-popup-cutout`.
 *
 * The Glass popups paint a translucent tint that only reads as glass because
 * the cutout clears everything beneath them. Pinned here by behaviour: which
 * surfaces a popup cuts (the app root and only the portals opened before it),
 * that a moving popup never mints a new mask image, and that palette flips
 * resolving out of order leave the cutout matching the glass actually on.
 * The popup rule's arms and the script's selector are pinned together in
 * forkPopupSurface.test.ts.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { cutoutMaskStyle, planCutout, type CutoutHole } from "../custom/forkGlassPopupCutout";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const customizations = readSibling("../../../../.fork/customizations.yaml");

const VIEWPORT = { width: 1200, height: 800 };
const ROOT = { key: "root", layer: -1, rect: { x: 0, y: 0, ...VIEWPORT } };

const hole = (layer: number, x: number, y: number): CutoutHole => ({
  x,
  y,
  width: 200,
  height: 120,
  radius: 10,
  layer,
});

afterEach(() => {
  vi.doUnmock("../hooks/useTheme");
  vi.doUnmock("../custom/forkGlassPopupCutout");
  vi.doUnmock("../custom/forkGlassFloorColor");
  vi.resetModules();
  vi.unstubAllGlobals();
  delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
});

describe("fork guard: fork-glass-popup-cutout", () => {
  it("is registered in the manifest", () => {
    expect(customizations).toContain("- id: fork-glass-popup-cutout");
  });

  it("cuts the app root and only the portals opened before the popup", () => {
    // The Usage panel (layer 0) under its environments menu (layer 1): the
    // menu must clear the panel as well as the root, or the panel shows
    // through its tint. The menu's own positioner is never cut by itself.
    const usagePanel = {
      key: "usage",
      layer: 0,
      rect: { x: 100, y: 100, width: 600, height: 500 },
    };
    const menuPositioner = {
      key: "menu",
      layer: 1,
      rect: { x: 300, y: 200, width: 200, height: 120 },
    };
    const farToast = { key: "toast", layer: 0, rect: { x: 1000, y: 700, width: 150, height: 60 } };
    const menu = hole(1, 300, 200);

    const plan = planCutout([ROOT, usagePanel, menuPositioner, farToast], [menu]);

    expect(plan.get("root")).toEqual([menu]);
    expect(plan.get("usage")).toEqual([menu]);
    expect(plan.has("menu")).toBe(false);
    // A surface the hole does not reach is left unmasked.
    expect(plan.has("toast")).toBe(false);
  });

  it("never lets a popup cut a surface opened after it", () => {
    const panel = { key: "panel", layer: 0, rect: { x: 0, y: 0, width: 400, height: 400 } };
    const later = { key: "later", layer: 2, rect: { x: 0, y: 0, width: 400, height: 400 } };
    const plan = planCutout([panel, later], [hole(1, 50, 50)]);
    expect(plan.has("panel")).toBe(true);
    expect(plan.has("later")).toBe(false);
  });

  it("moves a hole by position alone, without a new mask image", () => {
    // Every new image is a decode and a rasterise under the whole app; a
    // tooltip sliding between triggers must only move its layer.
    const before = cutoutMaskStyle(ROOT.rect, [hole(0, 100, 100)], VIEWPORT);
    const after = cutoutMaskStyle(ROOT.rect, [hole(0, 140, 100)], VIEWPORT);
    expect(after["mask-image"]).toBe(before["mask-image"]);
    expect(after["mask-size"]).toBe(before["mask-size"]);
    expect(after["mask-position"]).not.toBe(before["mask-position"]);
  });

  it("subtracts every hole from one solid layer, keeping lower popups' shadows", () => {
    const style = cutoutMaskStyle(ROOT.rect, [hole(0, 100, 100), hole(1, 150, 150)], VIEWPORT);
    // Solid on top, subtracted from the union of the holes beneath it, so
    // overlapping popups merge rather than cancel.
    expect(style["mask-image"]?.startsWith("linear-gradient(#000, #000), url(")).toBe(true);
    expect(style["mask-composite"]).toBe("subtract, add, add");
    expect(style["mask-clip"]).toBe("no-clip");
  });

  it.each([
    ["an older disable answers after a newer enable", "cool-dark", "cool-darker", true],
    ["an older enable answers after a newer disable", "cool-darker", "cool-dark", false],
  ])("matches the glass actually on when %s", async (_label, first, second, expected) => {
    // Palette flips fire the vibrancy IPC without waiting, so answers can
    // land out of order. The cutout must follow the newest palette, never a
    // superseded answer.
    const attributes = new Map<string, string>();
    const classes = new Set<string>(["dark"]);
    const root = {
      classList: {
        add: (name: string) => classes.add(name),
        contains: (name: string) => classes.has(name),
        remove: (name: string) => classes.delete(name),
      },
      get offsetHeight() {
        return 0;
      },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      removeAttribute: (name: string) => attributes.delete(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    };
    const values = new Map<string, string>([["t3code:theme", "dark"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    vi.stubGlobal("document", { documentElement: root });
    vi.doMock("../hooks/useTheme", () => ({
      readThemePreference: () => values.get("t3code:theme") ?? "system",
      subscribeToThemeChanges: vi.fn(() => () => {}),
      syncBrowserChromeTheme: vi.fn(),
    }));
    const cutoutCalls: Array<boolean> = [];
    vi.doMock("../custom/forkGlassPopupCutout", () => ({
      syncForkGlassPopupCutout: (glassOn: boolean) => cutoutCalls.push(glassOn),
    }));
    vi.doMock("../custom/forkGlassFloorColor", () => ({
      syncForkGlassFloorColor: () => Promise.resolve(),
    }));

    const answers: Array<{ enabled: boolean; resolve: (applied: boolean) => void }> = [];
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: (enabled: boolean) =>
        new Promise<boolean>((resolve) => answers.push({ enabled, resolve })),
    };

    const { setForkAppearance } = await import("../custom/forkTheme");
    setForkAppearance(first as "cool-dark" | "cool-darker", () => true);
    setForkAppearance(second as "cool-dark" | "cool-darker", () => true);
    expect(answers).toHaveLength(2);

    // The newer request answers first, the superseded one last.
    const [older, newer] = answers;
    newer?.resolve(newer.enabled);
    await vi.waitFor(() => expect(cutoutCalls).toHaveLength(1));
    older?.resolve(older.enabled);
    await vi.waitFor(() => expect(cutoutCalls).toHaveLength(2));

    expect(cutoutCalls.at(-1)).toBe(expected);
  });
});
