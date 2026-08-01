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
  COOL_DARK_THEME,
  FORK_THEME_ATTRIBUTE,
  applyForkThemeAttribute,
  toDesktopTheme,
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
const useThemeOverride = readSibling("../overrides/hooks/useTheme.ts");
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

const COOL_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARK_THEME}"]`];
const COOL_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARK_THEME}"]`,
  '[data-sidebar-version="v2"]',
];
const DEFAULT_STAGE = [`${MARKER}.dark`];

describe("fork guard: fork-cool-dark-theme", () => {
  it("registers the customization and keeps the preference helpers", () => {
    expect(customizations).toContain("id: fork-cool-dark-theme");
    expect(forkTheme).toContain(`export const COOL_DARK_THEME = "${COOL_DARK_THEME}"`);
    expect(forkTheme).toContain(`export const COOL_DARK_BACKGROUND = "${COOL_DARK_BACKGROUND}"`);
    expect(toDesktopTheme("cool-dark")).toBe("dark");
    expect(toDesktopTheme("dark")).toBe("dark");
    expect(toDesktopTheme("system")).toBe("system");
  });

  it("offers Cool Dark in Appearance and accepts it as a theme value", () => {
    expect(settingsPanels).toContain('value: "cool-dark"');
    expect(settingsPanels).toContain('label: "Cool Dark"');
    expect(settingsPanels).toContain('value === "cool-dark"');
    expect(settingsPanels).toContain('from "~/hooks/useTheme"');
    expect(settingsPanels).toContain("fork:begin fork-cool-dark-theme");
  });

  it("overrides useTheme so cool-dark persists and maps to desktop dark", () => {
    expect(useThemeOverride).toContain('"cool-dark"');
    expect(useThemeOverride).toContain("applyForkThemeAttribute");
    expect(useThemeOverride).toContain("toDesktopTheme");
    expect(useThemeOverride).toContain(
      'ThemePreference = Schema.Literals(["light", "dark", "cool-dark", "system"]',
    );
  });

  it("stamps and clears the fork theme attribute", () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
      removeAttribute(name: string) {
        attrs.delete(name);
      },
    };
    applyForkThemeAttribute(root, "cool-dark");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(COOL_DARK_THEME);
    applyForkThemeAttribute(root, "dark");
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints Cool Dark through attribute-scoped stage and panel selectors", () => {
    const stage = blockFor(theme, COOL_STAGE);
    const panel = blockFor(theme, COOL_PANEL);
    expect(declarationHex(stage, "--background")).toBe(COOL_DARK_BACKGROUND);
    expect(declarationHex(panel, "--background")).toBe("#232628");
    expect(panel).toContain("--sidebar: #232628");
    expect(panel).toContain("--sidebar-stage-fade: #232628");
    expect(relativeLuminance(declarationHex(panel, "--background"))).toBeGreaterThan(
      relativeLuminance(declarationHex(stage, "--background")),
    );
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
    expect(panel).toContain("--sidebar-row-hover: #2c2f33");
    expect(panel).toContain("--sidebar-row-active: #32363a");
    expect(panel).toContain("--sidebar-row-selected: #32363a");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("pre-paints Cool Dark in index.html so the load flash matches the stage", () => {
    expect(indexHtml).toContain(COOL_DARK_BACKGROUND);
    expect(indexHtml).toContain('storedTheme === "cool-dark"');
    expect(indexHtml).toContain(`data-fork-theme", "cool-dark"`);
    expect(indexHtml).toContain(`html.dark[${FORK_THEME_ATTRIBUTE}="cool-dark"] body`);
    expect(indexHtml).toContain("fork:begin fork-cool-dark-theme");
  });

  it("does not leak Cool Dark fills into light mode", () => {
    const coolHexes = ["#1c1e20", "#232628", "#2c2f33", "#32363a", "#34383c", "#393d42"];
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
