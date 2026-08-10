// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-neutral-darker-theme`.
 *
 * Neutral Darker is a deeper sibling of Neutral Dark. Losing the preference
 * wiring leaves the Appearance option as a dead label; losing the CSS
 * attribute selectors silently paints it with default Dark fills.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  FORK_PALETTE_STORAGE_KEY,
  FORK_THEME_ATTRIBUTE,
  NEUTRAL_DARK_BACKGROUND,
  NEUTRAL_DARKER_BACKGROUND,
  NEUTRAL_DARKER_LABEL,
  NEUTRAL_DARKER_THEME,
  applyForkPaletteAttribute,
  resolveActiveForkPalette,
  resolveAppearanceOption,
} from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const indexHtml = readSibling("../../index.html");
const settingsPanels = readSibling("../components/settings/SettingsPanels.tsx");
const forkTheme = readSibling("../custom/forkTheme.ts");
const customizations = readSibling("../../../../.fork/customizations.yaml");

function blockFor(css: string, selectorParts: readonly string[]): string {
  const pattern = new RegExp(
    `${selectorParts.map(escapeRegExp).join("\\s*")}\\s*\\{([^}]*)\\}`,
    "u",
  );
  const match = pattern.exec(css);
  expect(match, `no block found for selector ${selectorParts.join(" ")}`).not.toBeNull();
  return match?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function declarationHex(block: string, prop: string): string {
  const pattern = new RegExp(`${escapeRegExp(prop)}:\\s*(#[0-9a-f]{6})`, "iu");
  const match = pattern.exec(block);
  expect(match, `no ${prop} hex in block`).not.toBeNull();
  return (match?.[1] ?? "").toLowerCase();
}

function parseHex(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex.trim());
  expect(match, `expected #rrggbb, got ${hex}`).not.toBeNull();
  const n = Number.parseInt(match?.[1] ?? "0", 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

const DARKER_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${NEUTRAL_DARKER_THEME}"]`];
const DARKER_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${NEUTRAL_DARKER_THEME}"]`,
  '[data-sidebar-version="v2"]',
];
const NEUTRAL_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="neutral-dark"]`,
  '[data-sidebar-version="v2"]',
];

describe("fork guard: fork-neutral-darker-theme", () => {
  it("registers Neutral Darker on the shared fork palette key", () => {
    expect(customizations).toContain("id: fork-neutral-darker-theme");
    expect(customizations).toContain("t3code:fork-theme");
    expect(forkTheme).toContain(`export const NEUTRAL_DARKER_THEME = "${NEUTRAL_DARKER_THEME}"`);
    expect(forkTheme).toContain(
      `export const NEUTRAL_DARKER_BACKGROUND = "${NEUTRAL_DARKER_BACKGROUND}"`,
    );
    expect(forkTheme).toContain(`FORK_PALETTE_STORAGE_KEY = "${FORK_PALETTE_STORAGE_KEY}"`);
    expect(resolveAppearanceOption("dark", "neutral-darker")).toBe("neutral-darker");
    expect(resolveAppearanceOption("system", "neutral-darker")).toBe("system");
    expect(resolveActiveForkPalette("system", "neutral-darker")).toBeNull();
  });

  it("offers Neutral Darker in Appearance via the fork palette adapter", () => {
    expect(settingsPanels).toContain('value: "neutral-darker"');
    expect(settingsPanels).toContain("NEUTRAL_DARKER_LABEL");
    expect(forkTheme).toContain(`export const NEUTRAL_DARKER_LABEL = "${NEUTRAL_DARKER_LABEL}"`);
    expect(settingsPanels).toContain("fork:begin fork-neutral-darker-theme");
  });

  it("stamps and clears the fork theme attribute from the palette", () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
      removeAttribute(name: string) {
        attrs.delete(name);
      },
    };
    applyForkPaletteAttribute(root, "neutral-darker");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(NEUTRAL_DARKER_THEME);
    applyForkPaletteAttribute(root, null);
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints a slightly darker chat stage and a much darker sidebar above it", () => {
    const stage = blockFor(theme, DARKER_STAGE);
    const panel = blockFor(theme, DARKER_PANEL);
    const neutralPanel = blockFor(theme, NEUTRAL_PANEL);
    const stageBg = declarationHex(stage, "--background");
    const panelBg = declarationHex(panel, "--background");
    const neutralPanelBg = declarationHex(neutralPanel, "--background");

    expect(stageBg).toBe(NEUTRAL_DARKER_BACKGROUND);
    expect(stageBg).not.toBe(NEUTRAL_DARK_BACKGROUND);
    expect(relativeLuminance(stageBg)).toBeLessThan(relativeLuminance(NEUTRAL_DARK_BACKGROUND));

    expect(panelBg).toBe("#1d1d1d");
    expect(panel).toContain("--sidebar: #1d1d1d");
    expect(relativeLuminance(panelBg)).toBeLessThan(relativeLuminance(neutralPanelBg));
    expect(relativeLuminance(panelBg)).toBeGreaterThan(relativeLuminance(stageBg));

    expect(stage).toContain("--fork-composer-vessel-bg: #1d1d1d");
  });

  it("keeps Neutral Darker sidebar solid (no wallpaper vibrancy glass)", () => {
    const gap = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(`[${FORK_THEME_ATTRIBUTE}="neutral-darker"]`) &&
        rule.selector.includes('[data-slot="sidebar-gap"]'),
    );
    expect(gap).toBeUndefined();

    expect(theme).not.toContain("data-fork-sidebar-vibrancy");
    expect(theme).not.toContain("rgb(29 29 29 / 45%)");

    const panel = blockFor(theme, DARKER_PANEL);
    expect(panel).toContain("--sidebar: #1d1d1d");
    expect(panel).toContain("--sidebar-row-selected: #2e2e2e");

    // Helper remains only to clear leftover Electron vibrancy on hot sessions.
    expect(forkTheme).toContain("syncForkSidebarVibrancy");
    expect(customizations).toContain("apps/web/src/custom/forkSidebarVibrancy.ts");

    const useTheme = readSibling("../hooks/useTheme.ts");
    expect(useTheme).not.toContain("data-fork-sidebar-vibrancy");
  });

  it("keeps Neutral Darker truly neutral (R = G = B on stage)", () => {
    const [r, g, b] = parseHex(declarationHex(blockFor(theme, DARKER_STAGE), "--background"));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("pre-paints Neutral Darker from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(NEUTRAL_DARKER_BACKGROUND);
    expect(indexHtml).toContain('forkPalette === "neutral-darker" && theme === "dark"');
    expect(indexHtml).not.toContain('forkPalette === "neutral-darker" && isDark');
    expect(indexHtml).toContain(`data-fork-theme", "neutral-darker"`);
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="neutral-darker"\] body\s*\{[^}]*background:\s*#1a1a1a/u,
    );
    expect(indexHtml).toContain("fork:begin fork-neutral-darker-theme");
  });

  it("does not leak Neutral Darker fills into light mode", () => {
    const darkerHexes = ["#1a1a1a", "#1d1d1d", "#2b2b2b", "#2f2f2f", "#303030"];
    const lightRules = cssRules(theme).filter(
      (rule) => rule.selector.includes(MARKER) && !rule.selector.includes(".dark"),
    );
    for (const rule of lightRules) {
      for (const hex of darkerHexes) {
        expect(
          rule.body,
          `${hex} declared outside a .dark scope in: ${rule.selector}`,
        ).not.toContain(hex);
      }
    }
  });
});
