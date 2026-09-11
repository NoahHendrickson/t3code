// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Westworld (storage id "cool-dark") is a selectable alternate dark palette.
 * Losing the preference wiring leaves the Appearance option as a dead label;
 * losing the CSS attribute selectors silently paints it with default Dark
 * fills, and losing the stage-card or hero-art rules quietly flattens the
 * Figma 416:7408 layout back to a plain column.
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
    // Figma 416:7408: the sidebar, header and stage are one #26272c surface;
    // the stage card below, not a darker panel, separates work from chrome.
    expect(declarationHex(panel, "--background")).toBe(COOL_DARK_BACKGROUND);
    expect(panel).toContain("--sidebar: #26272c");
    expect(panel).toContain("--sidebar-stage-fade: #26272c");
    expect(panel).toContain("--sidebar-border: #33343a");
    // Figma 423:13864: a started thread's composer is white glass over an
    // opaque prompt surface — the palette-root values.
    expect(stage).toContain("--fork-composer-vessel-bg: rgb(255 255 255 / 8%)");
    expect(stage).toContain("--fork-composer-bg: #1f1f1f");
    expect(stage).toContain("--fork-composer-border: rgb(255 255 255 / 12%)");
    expect(stage).toContain("--fork-westworld-vessel-blur: 20px");
    expect(stage).toContain("--fork-westworld-chip-blur: 18px");
    // Figma 416:8420: the new-agent draft restates dark glass on its overlay,
    // which every composer element descends from.
    const hero = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.endsWith('[data-chat-composer-overlay="true"][data-draft-hero]'),
    );
    expect(hero?.body).toContain("--fork-composer-vessel-bg: rgb(47 47 47 / 50%)");
    expect(hero?.body).toContain("--fork-composer-bg: rgb(36 40 43 / 80%)");
    expect(hero?.body).toContain("--fork-composer-border: rgb(255 255 255 / 28%)");
    expect(hero?.body).toContain("--fork-composer-border-focus: rgb(255 255 255 / 45%)");
    expect(hero?.body).toContain("--fork-context-chip-bg: rgb(47 47 47 / 50%)");
    expect(hero?.body).toContain("--fork-westworld-vessel-blur: 16px");
    expect(hero?.body).toContain("--fork-westworld-chip-blur: 4px");
  });

  it("blurs the glass composer over the art, and only there", () => {
    // The fork's one deliberate backdrop-blur exception, reading the two
    // radius tokens so the draft and thread frames can disagree; scoped to
    // the palette so Glass's no-filter rules never see it.
    const rules = cssRules(theme).filter((rule) => rule.selector.includes(COOL_STAGE_SELECTOR));
    const vessel = rules.find((rule) => rule.selector.endsWith("[data-fork-composer-vessel]"));
    expect(vessel?.body).toMatch(/backdrop-filter:\s*blur\(var\(--fork-westworld-vessel-blur\)\)/u);
    expect(vessel?.body).toContain(
      "-webkit-backdrop-filter: blur(var(--fork-westworld-vessel-blur))",
    );
    const chips = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.body.includes("backdrop-filter"),
    );
    expect(chips?.body).toMatch(/backdrop-filter:\s*blur\(var\(--fork-westworld-chip-blur\)\)/u);
    const blurred = cssRules(theme).filter(
      (rule) =>
        /backdrop-filter:\s*blur\(/u.test(rule.body) &&
        (rule.selector.includes("[data-fork-composer-vessel]") ||
          rule.selector.includes("[data-fork-composer-context-row]")),
    );
    expect(
      blurred.every((rule) => rule.selector.includes(COOL_STAGE_SELECTOR)),
      "no other fork palette blurs the composer",
    ).toBe(true);
  });

  it("inks the model and effort triggers white over the glass control row", () => {
    // The shared #a6a6a6 ghost ink sinks into the blue glass; Westworld lifts
    // it to the foreground white. The mode chip is excluded and keeps its hue.
    const ink = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.includes("[data-fork-composer-model-controls]") &&
        rule.selector.includes(":not([data-fork-composer-mode-chip])") &&
        /color:/u.test(rule.body),
    );
    expect(ink?.body).toMatch(/color:\s*#e8e8e8/u);
  });

  it("draws no seam between the panel and the stage", () => {
    // One surface: the card's hairline separates work from chrome, so the
    // container's full-height border-r goes transparent. Rings inside the
    // panel still read --sidebar-border, so the token itself stays opaque.
    const seam = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.endsWith('[data-slot="sidebar-container"][data-sidebar-version="v2"]'),
    );
    expect(seam?.body).toMatch(/border-color:\s*transparent/u);
    expect(blockFor(theme, COOL_PANEL)).toContain("--sidebar-border: #33343a");
  });

  it("frames the chat column as the stage card", () => {
    // Figma 416:7408 "Frame 56": 8px inset, 8px radius, white 12% hairline and
    // the drawn stage drop shadow, on the same wrapper the artwork paints on.
    const card = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.endsWith('[data-chat-workspace-drop-target="true"]') &&
        rule.body.includes("isolation: isolate"),
    );
    expect(card?.body).toMatch(/margin:\s*8px/u);
    expect(card?.body).toMatch(/border-radius:\s*8px/u);
    expect(card?.body).toMatch(/border:\s*1px solid rgb\(255 255 255 \/ 12%\)/u);
    // Two-tone edge plus a shadow that falls under the card, not the drawn
    // offset blur: a dark keyline outside the hairline, a contact shadow, and
    // a downward blur with negative spread so it never widens past the edges.
    expect(card?.body).toMatch(
      /box-shadow:\s*0 0 0 1px rgb\(0 0 0 \/ 35%\),\s*0 2px 6px rgb\(0 0 0 \/ 25%\),\s*0 12px 32px -12px rgb\(0 0 0 \/ 55%\)/u,
    );
    expect(card?.body).toMatch(/overflow:\s*clip/u);
  });

  it("shows the portrait under the wash while the draft is empty", () => {
    // The ::after is the new-agent picture (Figma 421:12528 under the blue
    // wash), always painted at opacity 0 and lifted by the stamp ChatView sets
    // for exactly the draft-hero state, so it can crossfade with the thread
    // picture on the same 400ms clock as the composer's slide and fold.
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toContain("data-fork-stage-hero={isDraftHeroState || undefined}");
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/westworld-hero.png", import.meta.url)),
      ),
    ).toBe(true);
    const rules = cssRules(theme).filter((rule) => rule.selector.includes(COOL_STAGE_SELECTOR));
    const hero = rules.find((rule) =>
      rule.selector.endsWith('[data-chat-workspace-drop-target="true"]::after'),
    );
    expect(hero?.body).toContain('url("./custom/assets/westworld-hero.png") 66% 50% / cover');
    expect(hero?.body).toContain("rgb(24 119 242 / 40%)");
    expect(hero?.body).toContain("rgb(24 119 242 / 10%)");
    expect(hero?.body).not.toContain("radial-gradient");
    expect(hero?.body).toContain("z-index: -1");
    expect(hero?.body).toMatch(/opacity:\s*0;/u);
    expect(hero?.body).toMatch(/transition:\s*opacity 400ms/u);
    const heroLift = rules.find((rule) =>
      rule.selector.endsWith(
        '[data-chat-workspace-drop-target="true"][data-fork-stage-hero]::after',
      ),
    );
    expect(heroLift?.body).toMatch(/opacity:\s*1/u);
    const threadDrop = rules.find((rule) =>
      rule.selector.endsWith(
        '[data-chat-workspace-drop-target="true"][data-fork-stage-hero]::before',
      ),
    );
    expect(threadDrop?.body).toMatch(/opacity:\s*0/u);
  });

  it("paints the draft's send button Figma blue and rounds the header pills to 8px", () => {
    // Blue send only over the portrait (416:8420); a started thread keeps the
    // flat white send (423:13864), so the rule is scoped to the draft overlay.
    const send = cssRules(theme).find(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.includes('[data-chat-composer-overlay="true"][data-draft-hero]') &&
        rule.selector.includes('[data-fork-composer-action="send"]') &&
        rule.selector.includes('[data-fork-composer-send-tone="flat"]'),
    );
    expect(send?.body).toContain("background: #1877f2");
    expect(send?.body).toContain("color: #ffffff");
    const sendRules = cssRules(theme).filter(
      (rule) =>
        rule.selector.includes(COOL_STAGE_SELECTOR) &&
        rule.selector.includes('[data-fork-composer-action="send"]'),
    );
    expect(sendRules.every((rule) => rule.selector.includes("[data-draft-hero]"))).toBe(true);
    expect(blockFor(theme, COOL_STAGE)).toContain("--fork-pill-radius: 8px");
    expect(blockFor(theme, COOL_STAGE)).toContain("--fork-pill-border: #333333");
  });

  it("paints the thread texture under a top-down fade behind started threads", () => {
    // The ::before is the started-thread picture (Figma 424:14398), anchored
    // to the card's right edge under a fade from the surface colour so the
    // transcript reads over plain stage. The wrapper it paints on must already
    // be positioned in ChatView, and must be isolated so z-index -1 stays
    // above the root fill.
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toMatch(
      /className="relative flex min-h-0 min-w-0 flex-1 flex-col"[\s\S]{0,900}data-chat-workspace-drop-target="true"/u,
    );
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/westworld-thread.png", import.meta.url)),
      ),
    ).toBe(true);
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/westworld-stage.png", import.meta.url)),
      ),
    ).toBe(false);
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
    expect(art?.body).toContain('url("./custom/assets/westworld-thread.png") right 30% / cover');
    expect(art?.body).toMatch(
      /linear-gradient\(to bottom, #26272c 0%, rgb\(38 39 44 \/ 50%\) 80\.7%, rgb\(38 39 44 \/ 0%\) 100%\)/u,
    );
    expect(art?.body).toContain("z-index: -1");
    expect(art?.body).toMatch(/opacity:\s*1;/u);
    expect(art?.body).toMatch(/transition:\s*opacity 400ms/u);
    // The composer backing must not slab over the art.
    const backing = rules.find((rule) =>
      rule.selector.endsWith('[data-chat-composer-overlay="true"]'),
    );
    expect(backing?.body).toMatch(/background:\s*none/u);
    // No other palette takes either artwork, and the old right-hung portrait is gone.
    const artRules = cssRules(theme).filter(
      (rule) =>
        rule.body.includes("westworld-hero.png") || rule.body.includes("westworld-thread.png"),
    );
    expect(artRules.every((rule) => rule.selector.includes(COOL_STAGE_SELECTOR))).toBe(true);
    expect(theme).not.toContain("westworld-stage.png");
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
    expect(panel).toContain("--sidebar-row-hover: #2e2f34");
    expect(panel).toContain("--sidebar-row-active: #333438");
    expect(panel).toContain("--sidebar-row-selected: #333438");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("makes Westworld chips glass and keeps default dark chips on the Figma white wash", () => {
    // Westworld chips are white 12% glass on a thread and rgb(47 47 47) 50% on
    // a draft (the blur is pinned above). Default dark follows Figma
    // 322:6316 — a white 12% wash that lifts off any dark stage.
    const contextRules = cssRules(theme).filter((rule) =>
      rule.body.includes("--fork-context-chip-bg:"),
    );
    const defaultDark = contextRules.find((rule) => rule.selector === `${MARKER}.dark`);
    const coolDark = contextRules.find((rule) => rule.selector === COOL_STAGE_SELECTOR);
    expect(defaultDark?.body).toContain("--fork-context-chip-bg: rgb(255 255 255 / 12%)");
    expect(defaultDark?.body).toContain("--fork-context-chip-bg-hover: rgb(255 255 255 / 17%)");
    expect(coolDark?.body).toContain("--fork-context-chip-bg: rgb(255 255 255 / 12%)");
    // Outside Westworld the chips never carry a real filter: under native
    // vibrancy a filter flattens the wallpaper it sits on, and under
    // design-mode canvas it is dead weight. Match the VALUE, since the
    // vibrancy block declares `none` on them deliberately.
    const chipFilters = cssRules(theme)
      .filter(
        (rule) =>
          rule.selector.includes("[data-fork-composer-context-row]") &&
          !rule.selector.includes(COOL_STAGE_SELECTOR),
      )
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
      /html\.dark\[data-fork-theme="cool-dark"\] body\s*\{[^}]*background:\s*#26272c/u,
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
      "#26272c",
      "#303137",
      "#2e2f34",
      "#333438",
      "#393f44",
      "#434a50",
      "#33343a",
      "#7d848b",
      "#1877f2",
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
