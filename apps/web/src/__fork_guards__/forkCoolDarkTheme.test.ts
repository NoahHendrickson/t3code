// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Westworld (storage id "cool-dark") is a selectable alternate dark palette.
 * Losing the preference wiring leaves the Appearance option as a dead label;
 * losing the CSS attribute selectors silently paints it with default Dark fills.
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
// Default Dark stage lives in theme.custom.css; Westworld overlays live in palettes.
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

const COOL_STAGE_SELECTOR = `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARK_THEME}"]`;
const COOL_STAGE = [COOL_STAGE_SELECTOR];
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

  it("offers Westworld in Appearance via the fork palette adapter", () => {
    // Appearance derives its fork rows from forkTheme's palette table, so
    // membership there is what puts Westworld in the Select.
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
    // Restore Defaults clears every fork palette, not only Westworld.
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

  it("paints Westworld through attribute-scoped stage and panel selectors", () => {
    const stage = blockFor(theme, COOL_STAGE);
    const panel = blockFor(theme, COOL_PANEL);
    expect(declarationHex(stage, "--background")).toBe(COOL_DARK_BACKGROUND);
    expect(declarationHex(panel, "--background")).toBe("#2b2f33");
    expect(panel).toContain("--sidebar: #2b2f33");
    expect(panel).toContain("--sidebar-stage-fade: #2b2f33");
    expect(panel).toContain("--sidebar-border: #3c3f43");
    expect(relativeLuminance(declarationHex(panel, "--background"))).toBeGreaterThan(
      relativeLuminance(declarationHex(stage, "--background")),
    );
    // Figma 406:26993: the vessel is the sidebar fill and the prompt surface
    // sinks below the stage, a well cut into the vessel rather than a lift.
    expect(stage).toContain("--fork-composer-vessel-bg: #2b2f33");
    expect(stage).toContain("--fork-composer-bg: #161a1d");
    expect(relativeLuminance(declarationHex(stage, "--fork-composer-bg"))).toBeLessThan(
      relativeLuminance(declarationHex(stage, "--background")),
    );
  });

  it("paints the send button Figma blue and rounds the header pills to 8px", () => {
    const send = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.includes('[data-fork-composer-action="send"]') &&
        rule.selector.includes('[data-fork-composer-send-tone="flat"]'),
    );
    expect(send?.body).toContain("background: #179ddb");
    expect(send?.body).toContain("color: #ffffff");
    expect(blockFor(theme, COOL_STAGE)).toContain("--fork-pill-radius: 8px");
    expect(blockFor(theme, COOL_STAGE)).toContain("--fork-pill-border: #333333");
  });

  it("hangs the Figma portrait off the chat column's right edge, behind the composer", () => {
    // Figma 412:31131: 40% opacity, height-fitted, 42% of its width past the
    // right edge. The wrapper it paints on must already be positioned in
    // ChatView, and must be isolated so z-index -1 stays above the root fill.
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toMatch(
      /className="relative flex min-h-0 min-w-0 flex-1 flex-col"[\s\S]{0,900}data-chat-workspace-drop-target="true"/u,
    );
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/westworld-stage.png", import.meta.url)),
      ),
    ).toBe(true);
    const rules = cssRules(theme).filter((rule) => rule.selector.includes(COOL_STAGE_SELECTOR));
    const isolate = rules.find(
      (rule) =>
        rule.selector.endsWith('[data-chat-workspace-drop-target="true"]') &&
        rule.body.includes("isolation: isolate"),
    );
    expect(isolate).toBeDefined();
    const art = rules.find((rule) =>
      rule.selector.endsWith('[data-chat-workspace-drop-target="true"]::before'),
    );
    expect(art?.body).toContain('url("./custom/assets/westworld-stage.png")');
    expect(art?.body).toContain("z-index: -1");
    expect(art?.body).toContain("opacity: 0.4");
    expect(art?.body).toContain("transform: translateX(42%)");
    expect(art?.body).toContain("aspect-ratio: 2404 / 2006");
    // The composer backing must not slab over the portrait.
    const backing = rules.find((rule) =>
      rule.selector.endsWith('[data-chat-composer-overlay="true"]'),
    );
    expect(backing?.body).toMatch(/background:\s*none/u);
    // No other palette takes the artwork.
    const artRules = cssRules(theme).filter((rule) => rule.body.includes("westworld-stage.png"));
    expect(artRules.every((rule) => rule.selector.includes(COOL_STAGE_SELECTOR))).toBe(true);
  });

  it("turns working blue and recolours the brand mark's arms", () => {
    // Working is the one status token Westworld moves (#1877f2); it is
    // declared on the stage and the v2 panel because the default block does.
    const stage = blockFor(theme, COOL_STAGE);
    const panel = blockFor(theme, COOL_PANEL);
    expect(stage).toContain("--sidebar-v2-status-working: #1877f2");
    expect(panel).toContain("--sidebar-v2-status-working: #1877f2");
    // Figma 412:31179 — the same 23-cell grid as the default mark, every arm's
    // pair swapped for blues. The component's slots must match these names.
    const mark = readSibling("../custom/SidebarBrandMark.tsx");
    for (const [slot, hex] of [
      ["top", "#00bfff"],
      ["top-light", "#5ee7ff"],
      ["left", "#2a72e6"],
      ["left-light", "#4c90ff"],
      ["right", "#6c6ee0"],
      ["right-light", "#a089ff"],
      ["bottom", "#1aadfc"],
      ["bottom-light", "#72c4ff"],
    ]) {
      expect(stage).toContain(`--fork-brand-mark-${slot}: ${hex}`);
      expect(mark).toContain(`var(--fork-brand-mark-${slot},`);
    }
  });

  it("keeps Westworld lighter than the default Dark stage", () => {
    const defaultStage = declarationHex(blockFor(theme, DEFAULT_STAGE), "--background");
    const coolStage = declarationHex(blockFor(theme, COOL_STAGE), "--background");
    expect(relativeLuminance(coolStage)).toBeGreaterThan(relativeLuminance(defaultStage));
  });

  it("keeps Westworld barely cool without going blue-slate", () => {
    // Mild cool undertone (B ≥ R) but low chroma — the old blue-slate stage
    // had B−R ≈ 15; stay well under that so the option does not read blue.
    const [r, , b] = parseHex(declarationHex(blockFor(theme, COOL_STAGE), "--background"));
    expect(b).toBeGreaterThanOrEqual(r);
    expect(b - r).toBeLessThan(8);
  });

  it("states Westworld row fills as opaque values", () => {
    const panel = blockFor(theme, COOL_PANEL);
    expect(panel).toContain("--sidebar-row-hover: #33373a");
    expect(panel).toContain("--sidebar-row-active: #373b3f");
    expect(panel).toContain("--sidebar-row-selected: #373b3f");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("keeps Westworld chips opaque and default dark chips on the Figma white wash", () => {
    // Westworld chips share the vessel's RGB but stay opaque: design-mode
    // canvas transforms <body>, which disables backdrop-filter on descendants.
    // Default dark follows Figma 322:6316 — a white 12% wash that lifts off
    // any dark stage rather than sinking into it as a dark translucent fill did.
    const contextRules = cssRules(theme).filter((rule) =>
      rule.body.includes("--fork-context-chip-bg:"),
    );
    const defaultDark = contextRules.find((rule) => rule.selector === `${MARKER}.dark`);
    const coolDark = contextRules.find((rule) => rule.selector === COOL_STAGE_SELECTOR);
    expect(defaultDark?.body).toContain("--fork-context-chip-bg: rgb(255 255 255 / 12%)");
    expect(defaultDark?.body).toContain("--fork-context-chip-bg-hover: rgb(255 255 255 / 17%)");
    expect(coolDark?.body).toContain("--fork-context-chip-bg: #2b2f33");
    expect(coolDark?.body).not.toMatch(/--fork-context-chip-bg:[^;]*\//u);
    // The chips never carry a real filter. Matching the property outright used
    // to say that, until the vibrancy block started declaring `none` on them
    // and tripped its own guard. So match the VALUE: `none` is the point, and
    // anything else is the regression — dead weight under design-mode canvas,
    // and under native vibrancy a filter flattens the wallpaper it sits on.
    const chipFilters = cssRules(theme)
      .filter((rule) => rule.selector.includes("[data-fork-composer-context-row]"))
      .flatMap((rule) =>
        [...rule.body.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gu)].map((match) => ({
          selector: rule.selector,
          value: match[1]?.trim(),
        })),
      );
    expect(chipFilters.filter((filter) => filter.value !== "none")).toEqual([]);
  });

  it("pre-paints Westworld from the palette key so the load flash matches the stage", () => {
    expect(indexHtml).toContain(COOL_DARK_BACKGROUND);
    expect(indexHtml).toContain('t3code:fork-theme"');
    expect(indexHtml).toContain(`"cool-dark": "${COOL_DARK_BACKGROUND}"`);
    expect(indexHtml).toMatch(
      /theme === "dark" &&\s*isDark &&\s*Object\.prototype\.hasOwnProperty\.call\(forkPaletteBackgrounds, forkPalette\)/u,
    );
    expect(indexHtml).toContain('setAttribute("data-fork-theme", activeForkPalette)');
    expect(indexHtml).toContain(`html.dark[${FORK_THEME_ATTRIBUTE}="cool-dark"] body`);
    expect(indexHtml).toMatch(
      /html\.dark\[data-fork-theme="cool-dark"\] body\s*\{[^}]*background:\s*#1d2124/u,
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

  it("does not leak Westworld fills into light mode", () => {
    const coolHexes = [
      "#1d2124",
      "#2b2f33",
      "#33373a",
      "#373b3f",
      "#3c3f43",
      "#272b2e",
      "#161a1d",
      "#4a4f54",
      "#179ddb",
    ];
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
