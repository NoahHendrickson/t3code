// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-neutral-dark-theme`.
 *
 * Neutral Dark is a selectable warm-gray dark palette. Losing the
 * preference wiring leaves the Appearance option as a dead label; losing the
 * CSS attribute selectors silently paints Neutral Dark with default Dark fills.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  FORK_PALETTE_LABELS,
  FORK_PALETTE_STORAGE_KEY,
  FORK_PALETTES,
  FORK_THEME_ATTRIBUTE,
  NEUTRAL_DARK_BACKGROUND,
  NEUTRAL_DARK_LABEL,
  NEUTRAL_DARK_THEME,
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
// Default Dark stage lives in theme.custom.css; Neutral/Cool overlays live in palettes.
const theme = [
  readSibling("../theme.custom.css"),
  readSibling("../theme.custom.palettes.css"),
].join("\n");
const themeRules = cssRules(theme);
const indexHtml = readSibling("../../index.html");
const settingsPanels = readSibling("../components/settings/SettingsPanels.tsx");
const forkTheme = readSibling("../custom/forkTheme.ts");
const customizations = readSibling("../../../../.fork/customizations.yaml");

const NEUTRAL_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${NEUTRAL_DARK_THEME}"]`];
const NEUTRAL_PANEL = [
  `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${NEUTRAL_DARK_THEME}"]`,
  '[data-sidebar-version="v2"]',
];
const DEFAULT_STAGE = [`${MARKER}.dark`];
const COOL_STAGE = [`${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="cool-dark"]`];

describe("fork guard: fork-neutral-dark-theme", () => {
  it("registers Neutral Dark on the shared fork palette key", () => {
    expect(customizations).toContain("id: fork-neutral-dark-theme");
    expect(customizations).toContain("t3code:fork-theme");
    expect(forkTheme).toContain(`export const NEUTRAL_DARK_THEME = "${NEUTRAL_DARK_THEME}"`);
    expect(forkTheme).toContain(
      `export const NEUTRAL_DARK_BACKGROUND = "${NEUTRAL_DARK_BACKGROUND}"`,
    );
    expect(forkTheme).toContain(`FORK_PALETTE_STORAGE_KEY = "${FORK_PALETTE_STORAGE_KEY}"`);
    expect(resolveAppearanceOption("dark", "neutral-dark")).toBe("neutral-dark");
    expect(resolveAppearanceOption("dark", null)).toBe("dark");
    expect(resolveAppearanceOption("system", "neutral-dark")).toBe("system");
    expect(resolveActiveForkPalette("system", "neutral-dark")).toBeNull();
  });

  it("offers Neutral Dark in Appearance via the fork palette adapter", () => {
    // Appearance derives its fork rows from forkTheme's palette table, so
    // membership there is what puts Neutral Dark in the Select.
    expect(FORK_PALETTES).toContain(NEUTRAL_DARK_THEME);
    expect(FORK_PALETTE_LABELS[NEUTRAL_DARK_THEME]).toBe(NEUTRAL_DARK_LABEL);
    expect(settingsPanels).toContain("FORK_PALETTES.map");
    expect(settingsPanels).toContain("useForkAppearance");
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
    applyForkPaletteAttribute(root, "neutral-dark");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(NEUTRAL_DARK_THEME);
    applyForkPaletteAttribute(root, null);
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints Neutral Dark through attribute-scoped stage and panel selectors", () => {
    const stage = ruleBodyFor(themeRules, NEUTRAL_STAGE);
    const panel = ruleBodyFor(themeRules, NEUTRAL_PANEL);
    expect(declarationHex(stage, "--background")).toBe(NEUTRAL_DARK_BACKGROUND);
    expect(declarationHex(panel, "--background")).toBe("#34322f");
    expect(panel).toContain("--sidebar: #34322f");
    expect(panel).toContain("--sidebar-stage-fade: #34322f");
    expect(stage).toContain("--fork-composer-vessel-bg: #3c3a37");
    expect(stage).toContain("--fork-composer-bg: rgb(71 69 66 / 80%)");
    expect(stage).toContain("--fork-context-chip-bg: rgb(75 73 70)");
  });

  it("keeps Neutral Dark lighter than the default Dark stage and distinct from Westworld", () => {
    const defaultStage = declarationHex(ruleBodyFor(themeRules, DEFAULT_STAGE), "--background");
    const coolStage = declarationHex(ruleBodyFor(themeRules, COOL_STAGE), "--background");
    const neutralStage = declarationHex(ruleBodyFor(themeRules, NEUTRAL_STAGE), "--background");
    expect(neutralStage).not.toBe(defaultStage);
    expect(neutralStage).not.toBe(coolStage);
    expect(neutralStage).toBe(NEUTRAL_DARK_BACKGROUND);
  });

  it("paints the stage as a darker shade of the warm sidebar", () => {
    const stage = parseHex(declarationHex(ruleBodyFor(themeRules, NEUTRAL_STAGE), "--background"));
    const panel = parseHex(declarationHex(ruleBodyFor(themeRules, NEUTRAL_PANEL), "--background"));
    const [r, g, b] = stage;
    expect(r).toBeLessThan(panel[0]);
    expect(g).toBeLessThan(panel[1]);
    expect(b).toBeLessThan(panel[2]);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("states Neutral Dark row fills as opaque values", () => {
    const panel = ruleBodyFor(themeRules, NEUTRAL_PANEL);
    expect(panel).toContain("--sidebar-row-hover: #42403d");
    expect(panel).toContain("--sidebar-row-active: #44423f");
    expect(panel).toContain("--sidebar-row-selected: #44423f");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("keeps context chips on an opaque fill", () => {
    const contextRules = cssRules(theme).filter((rule) =>
      rule.body.includes("--fork-context-chip-bg:"),
    );
    const neutralDark = contextRules.find((rule) => rule.selector === NEUTRAL_STAGE[0]);
    expect(neutralDark?.body).toContain("--fork-context-chip-bg: rgb(75 73 70)");
    expect(neutralDark?.body).not.toMatch(/--fork-context-chip-bg:[^;]*\//u);
  });

  it("pre-paints Neutral Dark from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(NEUTRAL_DARK_BACKGROUND);
    expect(indexHtml).toContain(
      `forkPaletteBackgrounds["neutral-dark"] = "${NEUTRAL_DARK_BACKGROUND}"`,
    );
    expect(indexHtml).toMatch(
      /theme === "dark" &&\s*isDark &&\s*Object\.prototype\.hasOwnProperty\.call\(forkPaletteBackgrounds, forkPalette\)/u,
    );
    expect(indexHtml).toContain('setAttribute("data-fork-theme", activeForkPalette)');
    expect(indexHtml).toContain(`html.dark[${FORK_THEME_ATTRIBUTE}="neutral-dark"] body`);
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="neutral-dark"\] body\s*\{[^}]*background:\s*#2c2a27/u,
    );
    expect(indexHtml).toContain("fork:begin fork-neutral-dark-theme");
  });

  it("opens popups flat by overriding the shared frost's tokens", () => {
    const stage = ruleBodyFor(themeRules, NEUTRAL_STAGE);
    expect(stage).toContain("--fork-popup-fill: var(--popover)");
    expect(stage).toContain("--fork-popup-border: var(--border)");
    expect(stage).toContain("--fork-popup-filter: none");
    // Restating the frost rule's arms would let a new arm stay frosted here.
    const restated = themeRules.filter(
      (rule) =>
        rule.selector.includes(`[${FORK_THEME_ATTRIBUTE}="${NEUTRAL_DARK_THEME}"]`) &&
        rule.selector.includes(".dropdown-glass"),
    );
    expect(restated).toHaveLength(0);
  });

  it("draws unchecked checkboxes as a flat hairline", () => {
    const checkbox = ruleBodyFor(themeRules, [
      ...NEUTRAL_STAGE,
      '[data-slot="checkbox"][data-unchecked]:not([aria-invalid="true"])',
    ]);
    expect(checkbox).toContain("border-color: rgb(255 255 255 / 16%)");
    expect(checkbox).toContain("background: transparent");
    expect(checkbox).toContain("box-shadow: none");
    const highlight = ruleBodyFor(themeRules, [
      ...NEUTRAL_STAGE,
      '[data-slot="checkbox"][data-unchecked]:not([aria-invalid="true"])::before',
    ]);
    expect(highlight).toContain("box-shadow: none");
  });

  it("does not leak Neutral Dark fills into light mode", () => {
    const neutralHexes = [
      "#2c2a27",
      "#34322f",
      "#383633",
      "#403e3b",
      "#3c3a37",
      "#42403d",
      "#44423f",
      "#494744",
      "#4b4946",
      "#54524e",
      "#5c5a57",
    ];
    const lightRules = cssRules(theme).filter(
      (rule) => rule.selector.includes(MARKER) && !rule.selector.includes(".dark"),
    );
    for (const rule of lightRules) {
      for (const hex of neutralHexes) {
        expect(
          rule.body,
          `${hex} declared outside a .dark scope in: ${rule.selector}`,
        ).not.toContain(hex);
      }
    }
  });
});
