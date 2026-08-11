// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Cool Dark is a selectable alternate dark palette. Losing the preference
 * wiring leaves the Appearance option as a dead label; losing the CSS
 * attribute selectors silently paints Cool Dark with the default Dark fills.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  COOL_DARK_BACKGROUND,
  COOL_DARK_LABEL,
  COOL_DARK_THEME,
  FORK_PALETTE_LABELS,
  FORK_PALETTE_STORAGE_KEY,
  FORK_PALETTES,
  FORK_THEME_ATTRIBUTE,
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
// Default Dark stage lives in theme.custom.css; Cool Dark overlays live in palettes.
const theme = [
  readSibling("../theme.custom.css"),
  readSibling("../theme.custom.palettes.css"),
].join("\n");
const indexHtml = readSibling("../../index.html");
const main = readSibling("../main.tsx");
const settingsPanels = readSibling("../components/settings/SettingsPanels.tsx");
const forkTheme = readSibling("../custom/forkTheme.ts");
const useTheme = readSibling("../hooks/useTheme.ts");
const customizations = readSibling("../../../../.fork/customizations.yaml");
const useThemeOverridePath = NodeURL.fileURLToPath(
  new URL("../overrides/hooks/useTheme.ts", import.meta.url),
);

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

const COOL_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARK_THEME}"]`];
const COOL_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARK_THEME}"]`,
  '[data-sidebar-version="v2"]',
];
const DEFAULT_STAGE = [`${MARKER}.dark`];

describe("fork guard: fork-cool-dark-theme", () => {
  it("registers the customization as a separate palette, not a useTheme override", () => {
    expect(customizations).toContain("id: fork-cool-dark-theme");
    expect(customizations).toContain("t3code:fork-theme");
    expect(customizations).not.toContain("apps/web/src/overrides/hooks/useTheme.ts");
    expect(customizations).not.toMatch(/shadows:\s*\n\s*- apps\/web\/src\/hooks\/useTheme\.ts/u);
    expect(NodeFS.existsSync(useThemeOverridePath)).toBe(false);
    expect(forkTheme).toContain(`export const COOL_DARK_THEME = "${COOL_DARK_THEME}"`);
    expect(forkTheme).toContain(`export const COOL_DARK_BACKGROUND = "${COOL_DARK_BACKGROUND}"`);
    expect(forkTheme).toContain(`FORK_PALETTE_STORAGE_KEY = "${FORK_PALETTE_STORAGE_KEY}"`);
    expect(forkTheme).toContain("useForkAppearance");
    expect(forkTheme).toContain("subscribeToThemeChanges(syncForkPaletteFromStorage)");
    expect(forkTheme).toContain('import type { ThemePreference } from "../themePalette"');
    expect(forkTheme).not.toContain("type UpstreamTheme = string");
    expect(forkTheme).not.toContain("useEffect");
    expect(useTheme).toMatch(
      /fork:begin fork-cool-dark-theme[\s\S]*export function subscribeToThemeChanges[\s\S]*fork:end fork-cool-dark-theme/u,
    );
    expect(main).toContain("initializeForkTheme();");
    expect(customizations).toContain("apps/web/src/custom/forkTheme.test.ts");
    expect(resolveAppearanceOption("dark", "cool-dark")).toBe("cool-dark");
    expect(resolveAppearanceOption("dark", null)).toBe("dark");
    expect(resolveAppearanceOption("system", "cool-dark")).toBe("system");
    expect(resolveActiveForkPalette("system", "cool-dark")).toBeNull();
  });

  it("offers Cool Dark in Appearance via the fork palette adapter", () => {
    // Appearance derives its fork rows from forkTheme's palette table, so
    // membership there is what puts Cool Dark in the Select.
    expect(FORK_PALETTES).toContain(COOL_DARK_THEME);
    expect(FORK_PALETTE_LABELS[COOL_DARK_THEME]).toBe(COOL_DARK_LABEL);
    expect(settingsPanels).toContain("FORK_PALETTES.map");
    expect(settingsPanels).toContain("FORK_PALETTE_OPTIONS.map");
    expect(forkTheme).toContain(`export const COOL_DARK_LABEL = "${COOL_DARK_LABEL}"`);
    expect(settingsPanels).toContain("useForkAppearance");
    expect(settingsPanels).toContain("setAppearance");
    expect(settingsPanels).toContain('from "../../hooks/useTheme"');
    expect(settingsPanels).not.toContain('from "~/hooks/useTheme"');
    expect(settingsPanels).toContain("fork:begin fork-cool-dark-theme");
    expect(settingsPanels).toMatch(
      /fork:begin fork-cool-dark-theme[^\n]*\n\s*\.\.\.\(isForkPalette\(appearance\)[^\n]*\n\s*\/\* fork:end fork-cool-dark-theme/u,
    );
    expect([
      ...settingsPanels.matchAll(
        /fork:begin fork-cool-dark-theme[^\n]*\n\s*appearance,\n\s*\/\* fork:end fork-cool-dark-theme/gu,
      ),
    ]).toHaveLength(2);
    expect(settingsPanels).toMatch(
      /fork:begin fork-cool-dark-theme[^\n]*\n\s*setAppearance,\n\s*\/\* fork:end fork-cool-dark-theme/u,
    );
    // Restore Defaults clears every fork palette, not only Cool Dark.
    expect(settingsPanels).toMatch(
      /fork:begin fork-cool-dark-theme[^\n]*\n\s*if \(isForkPalette\(appearance\)\) setAppearance\("dark"\);\n\s*\/\* fork:end fork-cool-dark-theme/u,
    );
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
    applyForkPaletteAttribute(root, "cool-dark");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(COOL_DARK_THEME);
    applyForkPaletteAttribute(root, null);
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints Cool Dark through attribute-scoped stage and panel selectors", () => {
    const stage = blockFor(theme, COOL_STAGE);
    const panel = blockFor(theme, COOL_PANEL);
    expect(declarationHex(stage, "--background")).toBe(COOL_DARK_BACKGROUND);
    expect(declarationHex(panel, "--background")).toBe("#2b3033");
    expect(panel).toContain("--sidebar: #2b3033");
    expect(panel).toContain("--sidebar-stage-fade: #2b3033");
    expect(relativeLuminance(declarationHex(panel, "--background"))).toBeGreaterThan(
      relativeLuminance(declarationHex(stage, "--background")),
    );
    expect(stage).toContain("--fork-composer-vessel-bg: #2b3033");
    expect(stage).toContain("--fork-composer-bg: #353a3d");
  });

  it("keeps Cool Dark lighter than the default Dark stage", () => {
    const defaultStage = declarationHex(blockFor(theme, DEFAULT_STAGE), "--background");
    const coolStage = declarationHex(blockFor(theme, COOL_STAGE), "--background");
    expect(relativeLuminance(coolStage)).toBeGreaterThan(relativeLuminance(defaultStage));
  });

  it("keeps Cool Dark barely cool without going blue-slate", () => {
    // Mild cool undertone (B ≥ R) but low chroma — the old blue-slate stage
    // had B−R ≈ 15; stay well under that so the option does not read blue.
    const [r, , b] = parseHex(declarationHex(blockFor(theme, COOL_STAGE), "--background"));
    expect(b).toBeGreaterThanOrEqual(r);
    expect(b - r).toBeLessThan(8);
  });

  it("states Cool Dark row fills as opaque values", () => {
    const panel = blockFor(theme, COOL_PANEL);
    expect(panel).toContain("--sidebar-row-hover: #353a3d");
    expect(panel).toContain("--sidebar-row-active: #3c4143");
    expect(panel).toContain("--sidebar-row-selected: #3c4143");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("keeps context chips on an opaque match of the composer fill", () => {
    // Chips share the composer's RGB but stay opaque: design-mode canvas
    // transforms <body>, which disables backdrop-filter on descendants.
    const contextRules = cssRules(theme).filter((rule) =>
      rule.body.includes("--fork-context-chip-bg:"),
    );
    const defaultDark = contextRules.find((rule) => rule.selector === `${MARKER}.dark`);
    const coolDark = contextRules.find((rule) => rule.selector === COOL_STAGE[0]);
    expect(defaultDark?.body).toContain("--fork-context-chip-bg: rgb(41 41 41)");
    expect(coolDark?.body).toContain("--fork-context-chip-bg: #353a3d");
    expect(defaultDark?.body).not.toMatch(/--fork-context-chip-bg:[^;]*\//u);
    const chipBlur = cssRules(theme).find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.body.includes("backdrop-filter"),
    );
    expect(chipBlur).toBeUndefined();
  });

  it("pre-paints Cool Dark from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(COOL_DARK_BACKGROUND);
    expect(indexHtml).toContain('t3code:fork-theme"');
    expect(indexHtml).toContain(`"cool-dark": "${COOL_DARK_BACKGROUND}"`);
    expect(indexHtml).toMatch(
      /theme === "dark" &&\s*isDark &&\s*Object\.prototype\.hasOwnProperty\.call\(forkPaletteBackgrounds, forkPalette\)/u,
    );
    expect(indexHtml).toContain('setAttribute("data-fork-theme", activeForkPalette)');
    expect(indexHtml).toContain(`html.dark[${FORK_THEME_ATTRIBUTE}="cool-dark"] body`);
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="cool-dark"\] body\s*\{[^}]*background:\s*#202326/u,
    );
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="cool-dark"\] body\s*\{[^}]*color:\s*#e8e8e8/u,
    );
    expect(indexHtml).not.toContain("#e9eaec");
    expect(indexHtml).toContain("fork:begin fork-cool-dark-theme");
    expect(indexHtml).toMatch(
      /delete document\.documentElement\.dataset\.themeSelected;\s*\/\* fork:begin fork-cool-dark-theme[^]*?removeAttribute\("data-fork-theme"\);\s*\/\* fork:end fork-cool-dark-theme/u,
    );
    // Legacy migration still recognized, but cool-dark is not a live theme union member.
    expect(indexHtml).toContain('storedTheme === "cool-dark"');
  });

  it("does not leak Cool Dark fills into light mode", () => {
    const coolHexes = ["#202326", "#2b3033", "#353a3d", "#3c4143", "#3f3f3f", "#5c6368"];
    const lightRules = cssRules(theme).filter(
      (rule) => rule.selector.includes(MARKER) && !rule.selector.includes(".dark"),
    );
    for (const rule of lightRules) {
      for (const hex of coolHexes) {
        expect(
          rule.body,
          `${hex} declared outside a .dark scope in: ${rule.selector}`,
        ).not.toContain(hex);
      }
    }
  });
});
