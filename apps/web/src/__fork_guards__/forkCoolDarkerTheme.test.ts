// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-darker-theme`.
 *
 * Cool Darker is a deeper sibling of Cool Dark. Losing the preference wiring
 * leaves the Appearance option as a dead label; losing the CSS attribute
 * selectors silently paints it with default Dark fills.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  COOL_DARK_BACKGROUND,
  COOL_DARKER_BACKGROUND,
  COOL_DARKER_LABEL,
  COOL_DARKER_THEME,
  FORK_PALETTE_LABELS,
  FORK_PALETTE_STORAGE_KEY,
  FORK_PALETTES,
  FORK_THEME_ATTRIBUTE,
  applyForkPaletteAttribute,
  resolveActiveForkPalette,
  resolveAppearanceOption,
} from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules, declarationHex, parseHex, ruleBodyFor } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = [
  readSibling("../theme.custom.css"),
  readSibling("../theme.custom.palettes.css"),
].join("\n");
const themeRules = cssRules(theme);
const indexHtml = readSibling("../../index.html");
const settingsPanels = readSibling("../components/settings/SettingsPanels.tsx");
const forkTheme = readSibling("../custom/forkTheme.ts");
const customizations = readSibling("../../../../.fork/customizations.yaml");

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

const DARKER_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`];
const DARKER_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`,
  '[data-sidebar-version="v2"]',
];
const COOL_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="cool-dark"]`,
  '[data-sidebar-version="v2"]',
];

describe("fork guard: fork-cool-darker-theme", () => {
  it("registers Cool Darker on the shared fork palette key", () => {
    expect(customizations).toContain("id: fork-cool-darker-theme");
    expect(customizations).toContain("t3code:fork-theme");
    expect(forkTheme).toContain(`export const COOL_DARKER_THEME = "${COOL_DARKER_THEME}"`);
    expect(forkTheme).toContain(
      `export const COOL_DARKER_BACKGROUND = "${COOL_DARKER_BACKGROUND}"`,
    );
    expect(forkTheme).toContain(`FORK_PALETTE_STORAGE_KEY = "${FORK_PALETTE_STORAGE_KEY}"`);
    // FORK_PALETTES is the single source of truth — no hand-extended || chain.
    expect(forkTheme).toMatch(
      /function isForkPalette[\s\S]*?\(FORK_PALETTES as readonly string\[\]\)\.includes\(value\)/u,
    );
    expect(resolveAppearanceOption("dark", "cool-darker")).toBe("cool-darker");
    expect(resolveAppearanceOption("system", "cool-darker")).toBe("system");
    expect(resolveActiveForkPalette("system", "cool-darker")).toBeNull();
  });

  it("offers Cool Darker in Appearance via the fork palette adapter", () => {
    expect(FORK_PALETTES).toContain(COOL_DARKER_THEME);
    expect(FORK_PALETTE_LABELS[COOL_DARKER_THEME]).toBe(COOL_DARKER_LABEL);
    expect(settingsPanels).toContain("FORK_PALETTES.map");
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
    applyForkPaletteAttribute(root, "cool-darker");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(COOL_DARKER_THEME);
    applyForkPaletteAttribute(root, null);
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints a darker cool stage and a darker sidebar above it", () => {
    const stage = ruleBodyFor(themeRules, DARKER_STAGE);
    const panel = ruleBodyFor(themeRules, DARKER_PANEL);
    const coolPanel = ruleBodyFor(themeRules, COOL_PANEL);
    const stageBg = declarationHex(stage, "--background");
    const panelBg = declarationHex(panel, "--background");
    const coolPanelBg = declarationHex(coolPanel, "--background");

    expect(stageBg).toBe(COOL_DARKER_BACKGROUND);
    expect(stageBg).not.toBe(COOL_DARK_BACKGROUND);
    expect(relativeLuminance(stageBg)).toBeLessThan(relativeLuminance(COOL_DARK_BACKGROUND));

    expect(panelBg).toBe("#181b1e");
    expect(panel).toContain("--sidebar: #181b1e");
    expect(relativeLuminance(panelBg)).toBeLessThan(relativeLuminance(coolPanelBg));
    expect(relativeLuminance(panelBg)).toBeGreaterThan(relativeLuminance(stageBg));

    expect(stage).toContain("--fork-composer-vessel-bg: #222629");
    expect(relativeLuminance(declarationHex(stage, "--fork-composer-vessel-bg"))).toBeGreaterThan(
      relativeLuminance(panelBg),
    );
    expect(stage).toContain("--fork-composer-bg: #282d30");
  });

  it("keeps Cool Darker barely cool without going blue-slate", () => {
    const [r, , b] = parseHex(
      declarationHex(ruleBodyFor(themeRules, DARKER_STAGE), "--background"),
    );
    expect(b).toBeGreaterThanOrEqual(r);
    expect(b - r).toBeLessThan(8);
  });

  it("states Cool Darker row fills as opaque values", () => {
    const panel = ruleBodyFor(themeRules, DARKER_PANEL);
    expect(panel).toContain("--sidebar-row-hover: #282d30");
    expect(panel).toContain("--sidebar-row-active: #2c3134");
    expect(panel).toContain("--sidebar-row-selected: #2c3134");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("pre-paints Cool Darker from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(COOL_DARKER_BACKGROUND);
    expect(indexHtml).toContain(
      `forkPaletteBackgrounds["cool-darker"] = "${COOL_DARKER_BACKGROUND}"`,
    );
    expect(indexHtml).toMatch(
      /theme === "dark" &&\s*isDark &&\s*Object\.prototype\.hasOwnProperty\.call\(forkPaletteBackgrounds, forkPalette\)/u,
    );
    expect(indexHtml).toContain('setAttribute("data-fork-theme", activeForkPalette)');
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="cool-darker"\] body\s*\{[^}]*background:\s*#141618/u,
    );
    expect(indexHtml).toContain("fork:begin fork-cool-darker-theme");
  });

  it("does not leak Cool Darker fills into light mode", () => {
    const darkerHexes = ["#141618", "#1c1f22", "#222629", "#282d30", "#2f3336", "#444a4f"];
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
