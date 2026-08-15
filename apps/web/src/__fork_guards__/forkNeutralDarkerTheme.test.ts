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
  FORK_PALETTE_LABELS,
  FORK_PALETTE_STORAGE_KEY,
  FORK_PALETTES,
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
    // Appearance derives its fork rows from forkTheme's palette table, so
    // membership there is what puts Neutral Darker in the Select.
    expect(FORK_PALETTES).toContain(NEUTRAL_DARKER_THEME);
    expect(FORK_PALETTE_LABELS[NEUTRAL_DARKER_THEME]).toBe(NEUTRAL_DARKER_LABEL);
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
    applyForkPaletteAttribute(root, "neutral-darker");
    expect(attrs.get(FORK_THEME_ATTRIBUTE)).toBe(NEUTRAL_DARKER_THEME);
    applyForkPaletteAttribute(root, null);
    expect(attrs.has(FORK_THEME_ATTRIBUTE)).toBe(false);
  });

  it("paints a slightly darker chat stage and a much darker sidebar above it", () => {
    const stage = ruleBodyFor(themeRules, DARKER_STAGE);
    const panel = ruleBodyFor(themeRules, DARKER_PANEL);
    const neutralPanel = ruleBodyFor(themeRules, NEUTRAL_PANEL);
    const stageBg = declarationHex(stage, "--background");
    const panelBg = declarationHex(panel, "--background");
    const neutralPanelBg = declarationHex(neutralPanel, "--background");

    expect(stageBg).toBe(NEUTRAL_DARKER_BACKGROUND);
    expect(stageBg).not.toBe(NEUTRAL_DARK_BACKGROUND);
    expect(relativeLuminance(stageBg)).toBeLessThan(relativeLuminance(NEUTRAL_DARK_BACKGROUND));

    expect(panelBg).toBe("#212121");
    expect(panel).toContain("--sidebar: #212121");
    expect(relativeLuminance(panelBg)).toBeLessThan(relativeLuminance(neutralPanelBg));
    expect(relativeLuminance(panelBg)).toBeGreaterThan(relativeLuminance(stageBg));

    // Stage card/popover match the panel so menus open at the same lift.
    expect(declarationHex(stage, "--card")).toBe(panelBg);
    expect(declarationHex(stage, "--popover")).toBe(panelBg);

    // Vessel is a step above the sidebar so the control row reads against the stage.
    expect(stage).toContain("--fork-composer-vessel-bg: #252525");
    expect(relativeLuminance(declarationHex(stage, "--fork-composer-vessel-bg"))).toBeGreaterThan(
      relativeLuminance(panelBg),
    );
  });

  it("keeps Neutral Darker sidebar solid (wallpaper glass belongs to Cool Darker)", () => {
    const gap = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(`[${FORK_THEME_ATTRIBUTE}="neutral-darker"]`) &&
        rule.selector.includes('[data-slot="sidebar-gap"]'),
    );
    expect(gap).toBeUndefined();

    expect(theme).not.toContain("rgb(29 29 29 / 45%)");

    const panel = ruleBodyFor(themeRules, DARKER_PANEL);
    expect(panel).toContain("--sidebar: #212121");
    expect(panel).toContain("--sidebar-row-selected: #2e2e2e");

    // Vibrancy now exists for Cool Darker (see fork-cool-darker-sidebar-vibrancy),
    // so these assertions are scoped rather than global: no rule may put the
    // glass marker and the neutral-darker palette in the same selector, and the
    // Neutral Darker panel fills stay opaque hexes.
    for (const rule of cssRules(theme)) {
      if (!rule.selector.includes(`[${FORK_THEME_ATTRIBUTE}="neutral-darker"]`)) continue;
      expect(
        rule.selector,
        `neutral-darker must not opt into sidebar glass: ${rule.selector}`,
      ).not.toContain("data-fork-sidebar-vibrancy");
    }
    expect(panel).not.toMatch(/--sidebar(?:-row-[a-z]+)?:\s*rgb\([^)]*\/[^)]*\)/u);

    // Window construction does attach the vibrancy material on macOS — it is
    // construction-only in Electron, so it cannot be added later. What must stay
    // true is that attaching it changes nothing on its own: the window is still
    // created with an opaque backgroundColor, so no palette shows wallpaper
    // until ForkSidebarVibrancy explicitly clears that fill.
    const desktopWindow = readSibling("../../../desktop/src/window/DesktopWindow.ts");
    expect(desktopWindow).toContain("backgroundColor: getInitialWindowBackgroundColor(");
    expect(desktopWindow).not.toContain("transparent: true");

    // The chrome repaint in useTheme stays synchronous and palette-agnostic.
    const useTheme = readSibling("../hooks/useTheme.ts");
    expect(useTheme).not.toContain("data-fork-sidebar-vibrancy");
  });

  it("keeps Neutral Darker truly neutral (R = G = B on stage)", () => {
    const [r, g, b] = parseHex(
      declarationHex(ruleBodyFor(themeRules, DARKER_STAGE), "--background"),
    );
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("pre-paints Neutral Darker from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(NEUTRAL_DARKER_BACKGROUND);
    expect(indexHtml).toContain(
      `forkPaletteBackgrounds["neutral-darker"] = "${NEUTRAL_DARKER_BACKGROUND}"`,
    );
    expect(indexHtml).toMatch(
      /theme === "dark" &&\s*isDark &&\s*Object\.prototype\.hasOwnProperty\.call\(forkPaletteBackgrounds, forkPalette\)/u,
    );
    expect(indexHtml).toContain('setAttribute("data-fork-theme", activeForkPalette)');
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="neutral-darker"\] body\s*\{[^}]*background:\s*#1a1a1a/u,
    );
    expect(indexHtml).toContain("fork:begin fork-neutral-darker-theme");
  });

  it("does not leak Neutral Darker fills into light mode", () => {
    const darkerHexes = ["#1a1a1a", "#212121", "#252525", "#2b2b2b", "#2f2f2f", "#303030"];
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
