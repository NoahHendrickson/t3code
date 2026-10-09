// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-new-agent-stage`.
 *
 * Glass's new-agent draft is a card 8px inside the stage (Figma 517:18256):
 * the dithered portrait behind the centred composer, the header inside the
 * card, the composer frosted over the picture, the gutter in the sidebar's
 * colour with no seam. Losing the import silently drops the whole stage;
 * losing the `:has()` lift leaves the art painted at opacity 0; a rule that
 * reaches the root with a margin, clip or fill changes a started thread,
 * which this customization promises not to touch; and a blur that escapes
 * the draft stamp flattens the native material under every thread's composer.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const GLASS = `${MARKER}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
const VIBRANCY = '[data-fork-sidebar-vibrancy="true"]';
const ROOT = "[data-chat-column-maximized-away]";
const HERO = '[data-chat-composer-overlay="true"][data-draft-hero]';

const sheet = readSibling("../theme.custom.glass.css");
const rules = cssRules(sheet);
const palettes = readSibling("../theme.custom.palettes.css");
const chatView = readSibling("../components/ChatView.tsx");
const customizations = readSibling("../../../../.fork/customizations.yaml");

// The formatter wraps `:has(` and `:not(` across lines; compare without whitespace.
const compact = (value: string) => value.replace(/\s+/gu, "");

describe("fork guard: fork-glass-new-agent-stage", () => {
  it("registers the stage and loads its sheet from the palettes sheet", () => {
    expect(customizations).toContain("id: fork-glass-new-agent-stage");
    expect(customizations).toContain("apps/web/src/theme.custom.glass.css");
    expect(customizations).toContain("apps/web/src/custom/assets/glass-hero.png");
    // Both sheets @import before any rule; Westworld's stays first.
    const westworld = palettes.indexOf('@import "./theme.custom.westworld.css";');
    const glass = palettes.indexOf('@import "./theme.custom.glass.css";');
    expect(westworld).toBeGreaterThanOrEqual(0);
    expect(glass).toBeGreaterThan(westworld);
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/glass-hero.png", import.meta.url)),
      ),
    ).toBe(true);
  });

  it("scopes every rule to Glass and leaves a started thread alone", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selector, `unscoped rule "${rule.selector}"`).toContain(MARKER);
      expect(rule.selector, `rule not scoped to Glass "${rule.selector}"`).toContain(
        `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`,
      );
    }
    // The one rule that reaches the root element itself declares the
    // containing block and the stacking context and nothing else — no
    // margin, clip, fill or border — so a started Glass thread is laid out
    // and painted exactly as before. Everything else is keyed on the draft.
    const root = rules.filter(
      (rule) => compact(rule.selector).endsWith(ROOT) && !rule.selector.includes(VIBRANCY),
    );
    expect(root).toHaveLength(1);
    expect(root[0]?.body.replace(/\s+/gu, " ").trim()).toBe(
      'position: relative; isolation: isolate; anchor-name: --fork-glass-card; --fork-glass-card-fade: linear-gradient(to bottom, #000 59%, rgb(0 0 0 / 35%) 94%); --fork-glass-card-scrim: linear-gradient(to bottom, rgb(12 12 14 / 55%), rgb(12 12 14 / 0%) 96px); --fork-glass-frost-image: url("./custom/assets/glass-hero-frost.png"); --fork-glass-frost-veil: 10%; --fork-glass-frost-floor: var(--background);',
    );
    const unkeyed = rules.filter(
      (rule) => !compact(rule.selector).includes(HERO) && !compact(rule.selector).endsWith(ROOT),
    );
    // Only the at-rest art and its reduced-motion twin paint without the stamp.
    expect(unkeyed.map((rule) => compact(rule.selector))).toEqual([
      `${compact(GLASS)}${ROOT}::after`,
      `${compact(GLASS)}${ROOT}::after`,
    ]);
    // The glass floor override is a token on the root too, and paints nothing.
    const rootRules = rules.filter((rule) => compact(rule.selector).endsWith(ROOT));
    expect(rootRules).toHaveLength(2);
    expect(rootRules[1]?.body.replace(/\s+/gu, " ").trim()).toBe(
      "--fork-glass-frost-floor: var(--fork-popup-glass-floor);",
    );
    // The root is upstream's own stamp, and the overlay's stamp is the fork's
    // layout mode: nothing in ChatView is stamped for the theme.
    expect(chatView).not.toContain("data-fork-glass");
    expect(chatView).toMatch(/data-chat-column-maximized-away=\{rightPanelMaximized/u);
    expect(chatView).toContain("data-draft-hero={isDraftHeroState || undefined}");
    expect(chatView).toContain("data-chat-header");
  });

  it("paints the dithered portrait as the card, 8px inside the chat view and faded at rest", () => {
    // Frame 558 draws no fill or hairline: the box is the picture, so it is
    // the pseudo-element that is inset and rounded, not the root.
    const art = rules.find(
      (rule) =>
        compact(rule.selector) === `${compact(GLASS)}${ROOT}::after` &&
        rule.body.includes("content:"),
    );
    expect(art?.body).toMatch(/inset:\s*8px/u);
    expect(art?.body).toMatch(/border-radius:\s*8px/u);
    expect(art?.body).toContain("z-index: -1");
    expect(art?.body).toContain("pointer-events: none");
    expect(art?.body).toContain('url("./custom/assets/glass-hero.png") 51% top / cover no-repeat');
    // Always painted, lifted by opacity alone, on the composer's own clock.
    expect(art?.body).toMatch(/opacity:\s*0;/u);
    expect(art?.body).toMatch(/transition:\s*opacity 400ms cubic-bezier\(0\.32, 0\.72, 0, 1\)/u);
    const reduced = rules.find(
      (rule) =>
        rule.atRules.some((atRule) => atRule.includes("prefers-reduced-motion")) &&
        compact(rule.selector).endsWith(`${ROOT}::after`),
    );
    expect(reduced?.body).toMatch(/transition:\s*none/u);
    // No other palette takes the asset.
    const every = cssRules(
      [
        readSibling("../theme.custom.css"),
        palettes,
        readSibling("../theme.custom.westworld.css"),
        sheet,
      ].join("\n"),
    );
    const takers = every.filter((rule) => rule.body.includes("glass-hero.png"));
    expect(takers.length).toBeGreaterThan(0);
    expect(takers.every((rule) => rule.selector.includes(GLASS))).toBe(true);
  });

  it("lifts the art to the drawn 30% and clears the header only while the draft is empty", () => {
    const lift = rules.find(
      (rule) => compact(rule.selector) === `${compact(GLASS)}${ROOT}:has(${HERO})::after`,
    );
    expect(lift?.body).toMatch(/opacity:\s*0\.8;/u);
    // The header rides inside the card: its opaque bg-background paints
    // nothing on a draft, via the shorthand so the colour resets too.
    const header = rules.find(
      (rule) =>
        compact(rule.selector) === `${compact(GLASS)}${ROOT}:has(${HERO})[data-chat-header]`,
    );
    expect(header?.body).toMatch(/background:\s*none/u);
    // The crumbs in full white with a soft shadow, on every descendant since
    // the crumbs carry text-foreground themselves.
    const crumb = rules.find(
      (rule) =>
        compact(rule.selector).startsWith(
          `${compact(GLASS)}${ROOT}:has(${HERO})[data-chat-header]:is(ol:has([data-slot="workspace-breadcrumb-text"])`,
        ) && compact(rule.selector).includes('ol:has([data-slot="workspace-breadcrumb-text"])*)'),
    );
    expect(crumb?.body).toMatch(/color:\s*#ffffff/u);
    expect(crumb?.body).toMatch(/text-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 45%\)/u);
  });

  it("colours the gutter like the sidebar on both clients and drops the seam", () => {
    // An opaque client meets the v2 panel's own fill; the glass client meets
    // the panel's tint. Both values are read back from the palettes sheet so
    // a retuned panel fails here instead of leaving a two-tone gutter.
    const panelHex = /\[data-sidebar-version="v2"\]\s*\{[^}]*--sidebar:\s*(#[0-9a-f]{6})/iu.exec(
      palettes.slice(palettes.indexOf(`[data-fork-theme="${COOL_DARKER_THEME}"]`)),
    )?.[1];
    expect(panelHex).toBeDefined();
    const opaque = rules.find(
      (rule) =>
        compact(rule.selector) ===
        `${compact(GLASS)}:not(${VIBRANCY})[data-slot="sidebar-inset"]:has(${HERO})`,
    );
    expect(opaque?.body.replace(/\s+/gu, " ").trim()).toBe(`background-color: ${panelHex};`);

    const panelTint = /--sidebar:\s*rgb\((\d+ \d+ \d+) \/ (\d+)%\)/u.exec(palettes);
    expect(panelTint, "the glass panel must declare an explicit tint").not.toBeNull();
    // Gated ON the marker, not merely mentioning it: the opaque rule names
    // the same attribute inside its :not().
    const glassGutter = rules.find(
      (rule) =>
        compact(rule.selector).startsWith(`${compact(MARKER)}${VIBRANCY}`) &&
        compact(rule.selector).endsWith(`[data-slot="sidebar-inset"]:has(${HERO})`),
    );
    expect(glassGutter?.body).toMatch(/background-image:\s*linear-gradient\(/u);
    const stop = /rgb\((\d+ \d+ \d+) \/ (\d+)%\)/u.exec(glassGutter?.body ?? "");
    expect(stop?.[1]).toBe(panelTint?.[1]);
    expect(stop?.[2]).toBe(panelTint?.[2]);
    expect(Number(stop?.[2])).toBeGreaterThanOrEqual(70);
    // Only these two rules paint the inset, and the opaque one never reaches
    // the glass client — an opaque fill there covers the material.
    const insetRules = rules.filter((rule) =>
      rule.selector.includes('[data-slot="sidebar-inset"]'),
    );
    expect(insetRules).toHaveLength(2);

    const seam = rules.find((rule) =>
      compact(rule.selector).endsWith('[data-slot="sidebar-container"][data-sidebar-version="v2"]'),
    );
    expect(compact(seam?.selector ?? "")).toContain(`:has(${HERO})`);
    // The panel's own fill, never transparent: under the desktop glass a
    // transparent border is a 1px strip of raw wallpaper down the seam.
    expect(seam?.body).toMatch(/border-color:\s*var\(--sidebar\)/u);
    for (const rule of rules) {
      expect(rule.body, `went transparent: ${rule.selector}`).not.toContain("transparent");
    }
  });

  it("frosts the composer and pills with a baked, anchored copy of the picture, only on the draft", () => {
    // The pill's look — a white 8% wash over the stage — carried onto the
    // vessel and the well, restated on the draft overlay.
    const fills = rules.find(
      (rule) =>
        compact(rule.selector) === `${compact(GLASS)}${HERO}` && rule.body.includes("--fork-"),
    );
    expect(fills?.body).toContain("--fork-composer-vessel-bg: rgb(255 255 255 / 5%)");
    expect(fills?.body).toContain("--fork-composer-bg: rgb(0 0 0 / 41%)");
    expect(fills?.body).toContain("--fork-composer-border: rgb(255 255 255 / 24%)");
    expect(fills?.body).toContain("--fork-context-chip-bg: rgb(255 255 255 / 0%)");
    // The control row's ink and the effort label, lifted over the picture.
    expect(fills?.body).toContain("--fork-composer-control-ink: rgb(255 255 255 / 80%)");
    const traits = rules.find((rule) =>
      compact(rule.selector).endsWith(`${HERO}[data-chat-provider-model-picker-traits]`),
    );
    expect(traits?.body).toMatch(/color:\s*rgb\(255 255 255 \/ 65%\)/u);
    // The frost composites onto the stage as it reads on screen: the
    // palette's fill on an opaque client, the measured glass floor under the
    // desktop glass (fork-glass-floor-color's token, never a literal).
    // Declared on the chat view, not the overlay: the header's pills take the
    // frost too and sit outside the overlay.
    expect(fills?.body).not.toContain("--fork-glass-frost-floor");
    const glassFloor = rules.find(
      (rule) =>
        compact(rule.selector) ===
        `${compact(MARKER)}${VIBRANCY}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]${ROOT}`,
    );
    expect(glassFloor?.body.replace(/\s+/gu, " ").trim()).toBe(
      "--fork-glass-frost-floor: var(--fork-popup-glass-floor);",
    );

    // No filter anywhere: under the desktop glass a backdrop-filter blurs the
    // picture in the renderer's composite and not on screen (the vibrancy
    // entry's standing rule, re-confirmed 2026-10-08 at blur(40px)).
    for (const rule of rules) {
      expect(rule.body, `filter in ${rule.selector}`).not.toMatch(/backdrop-filter/u);
    }

    // The blur is baked: a pre-blurred, translucent twin of the picture on a
    // fixed pseudo-element whose insets are anchor() reads of the chat view's
    // box plus the card's 8px, so it lands on the stage picture wherever the
    // sidebar, panel and window put it. Same crop as the sharp copy; the
    // element's own wash on top, the floor beneath.
    const STACK = `${HERO}[data-fork-composer-stack="true"]`;
    const VESSEL = `${STACK}[data-fork-composer-vessel]`;
    const PILL = `${STACK}[data-fork-composer-context-row]:is(button,[data-slot="button"],[data-fork-context-chip],[data-fork-pr-chip])`;
    const SUPPORTS = ["@supports (anchor-name: --fork-glass-card)"];
    const art = rules.find((rule) => rule.body.includes("glass-hero.png"));
    expect(art?.body).toContain('url("./custom/assets/glass-hero.png") 51% top / cover');
    // A scrim from the top edge, so the header reads over the sky; the frost
    // copies carry it too (below) so the header pills keep matching.
    expect(art?.body.replace(/\s+/gu, " ")).toContain(
      'background: var(--fork-glass-card-scrim), url("./custom/assets/glass-hero.png") 51% top / cover no-repeat;',
    );
    // The picture fades out toward the bottom of the card; the frost copies
    // carry the same mask on the same box so they keep matching it.
    expect(art?.body).toContain("mask-image: var(--fork-glass-card-fade)");
    for (const [target, wash, radius] of [
      [VESSEL, "--fork-composer-vessel-bg", "var(--fork-composer-radius)"],
      [PILL, "--fork-glass-chip-wash", "6px"],
    ] as const) {
      const host = rules.find((rule) => compact(rule.selector) === `${compact(GLASS)}${target}`);
      expect(host?.atRules, target).toEqual(SUPPORTS);
      // clip-path, not overflow: overflow cannot clip a fixed descendant.
      expect(host?.body, target).toMatch(/isolation:\s*isolate/u);
      expect(host?.body, target).toContain(`clip-path: inset(0 round ${radius})`);
      // The floor sits on the host, unmasked, so the fade thins the copy to
      // the stage colour and never to the sharp picture behind.
      expect(host?.body, target).toContain("background: var(--fork-glass-frost-floor)");
      const frost = rules.find(
        (rule) => compact(rule.selector) === `${compact(GLASS)}${target}::before`,
      );
      expect(frost?.atRules, target).toEqual(SUPPORTS);
      expect(frost?.body, target).toMatch(/position:\s*fixed/u);
      for (const edge of ["top", "right", "bottom", "left"]) {
        expect(frost?.body, target).toMatch(
          new RegExp(`${edge}:\\s*calc\\(anchor\\(--fork-glass-card ${edge}\\) \\+ 8px\\)`, "u"),
        );
      }
      expect(frost?.body, target).toContain("z-index: -1");
      expect(frost?.body, target).toContain("pointer-events: none");
      expect(frost?.body.replace(/\s+/gu, " "), target).toContain(
        `background: linear-gradient(var(${wash}), var(${wash})), linear-gradient( rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)), rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)) ), var(--fork-glass-card-scrim), var(--fork-glass-frost-image) 51% top / cover no-repeat;`,
      );
      expect(frost?.body, target).toContain("mask-image: var(--fork-glass-card-fade)");
    }
    // The pill's wash follows its hover lift through the token, since the
    // frost covers the chip's own fill.
    const hover = rules.find(
      (rule) =>
        compact(rule.selector).startsWith(
          `${compact(GLASS)}${STACK}[data-fork-composer-context-row]`,
        ) && rule.selector.includes(":hover"),
    );
    expect(hover?.body.replace(/\s+/gu, " ").trim()).toBe(
      "--fork-glass-chip-wash: var(--fork-context-chip-bg-hover);",
    );
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/assets/glass-hero-frost.png", import.meta.url)),
      ),
    ).toBe(true);

    // The anchor only resolves against the viewport if no ancestor of the
    // pseudo-element is transformed, so the draft overlay must centre
    // without a translate (fork-new-agent-draft owns that rule).
    const overlayRule = cssRules(readSibling("../theme.custom.css")).find(
      (rule) =>
        compact(rule.selector) === `${compact(MARKER)}${HERO}` &&
        rule.body.includes("margin-block"),
    );
    expect(overlayRule?.body).toMatch(/height:\s*fit-content/u);
    expect(overlayRule?.body).not.toMatch(/translate|transform/u);
  });

  it("frosts the header's pills and panel toggles the same way, only on the draft", () => {
    const HEADER = `${ROOT}:has(${HERO})[data-chat-header]`;
    const HOSTS = `${HEADER}:is([data-fork-pill],[data-workspace-titlebar-controls]span:has(>button))`;
    const SUPPORTS = ["@supports (anchor-name: --fork-glass-card)"];
    const host = rules.find((rule) => compact(rule.selector) === `${compact(GLASS)}${HOSTS}`);
    expect(host?.atRules).toEqual(SUPPORTS);
    expect(host?.body).toContain("--fork-glass-header-wash: rgb(255 255 255 / 18%)");
    expect(host?.body).toMatch(/isolation:\s*isolate/u);
    expect(host?.body).toContain("background: var(--fork-glass-frost-floor)");
    // Pills clip at the pill radius, toggles at the Toggle's 6px.
    const pillClip = rules.find(
      (rule) => compact(rule.selector) === `${compact(GLASS)}${HEADER}[data-fork-pill]`,
    );
    expect(pillClip?.body).toContain("clip-path: inset(0 round var(--fork-pill-radius))");
    const toggleClip = rules.find(
      (rule) =>
        compact(rule.selector) ===
        `${compact(GLASS)}${HEADER}[data-workspace-titlebar-controls]span:has(>button)`,
    );
    expect(toggleClip?.body).toContain("clip-path: inset(0 round 6px)");
    // The lone pill's hover lifts through the token: the floor covers its fill.
    const hover = rules.find(
      (rule) =>
        compact(rule.selector) ===
        `${compact(GLASS)}${HEADER}button[data-fork-pill]:is(:hover,[data-pressed])`,
    );
    expect(hover?.body.replace(/\s+/gu, " ").trim()).toBe(
      "--fork-glass-header-wash: rgb(255 255 255 / 26%);",
    );
    const frost = rules.find(
      (rule) => compact(rule.selector) === `${compact(GLASS)}${HOSTS}::before`,
    );
    expect(frost?.atRules).toEqual(SUPPORTS);
    expect(frost?.body).toMatch(/position:\s*fixed/u);
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(frost?.body).toMatch(
        new RegExp(`${edge}:\\s*calc\\(anchor\\(--fork-glass-card ${edge}\\) \\+ 8px\\)`, "u"),
      );
    }
    expect(frost?.body).toContain("z-index: -1");
    expect(frost?.body.replace(/\s+/gu, " ")).toContain(
      "background: linear-gradient(var(--fork-glass-header-wash), var(--fork-glass-header-wash)), linear-gradient( rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)), rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)) ), var(--fork-glass-card-scrim), var(--fork-glass-frost-image) 51% top / cover no-repeat;",
    );
    expect(frost?.body).toContain("mask-image: var(--fork-glass-card-fade)");
    // The toggles are scoped to the header: at the root titlebar layout they
    // precede the chat view in the tree and the anchor could not resolve.
    const toggleRules = rules.filter((rule) =>
      rule.selector.includes("[data-workspace-titlebar-controls]"),
    );
    expect(toggleRules.length).toBeGreaterThan(0);
    for (const rule of toggleRules) {
      expect(compact(rule.selector)).toContain(`${HEADER}`);
    }
    // The header hooks this leans on.
    const chatHeaderFile = readSibling("../components/chat/PanelLayoutControls.tsx");
    expect(chatHeaderFile).toContain(
      '<TooltipTrigger render={<span className="flex shrink-0" />}>',
    );
    expect(chatView).toContain("data-workspace-titlebar-controls");
  });
});
