// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-new-agent-stage`.
 *
 * Glass's new-agent draft is a card 8px inside the stage (Figma 517:18256):
 * the dithered portrait behind the centred composer, the header inside the
 * card, the composer and the header's controls frosted over the picture,
 * the gutter in the sidebar's colour with no seam. Losing the import
 * silently drops the whole stage; losing the `:has()` lift leaves the art
 * painted at opacity 0; a rule that reaches the root with a margin, clip or
 * fill changes a started thread, which this customization promises not to
 * touch; and a backdrop-filter anywhere flattens the native material and
 * blurs nothing on screen.
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
const DRAFT = `${ROOT}:has(${HERO})`;
// A popup the cutout frosts over the draft card instead of cutting.
const FROSTED = "[data-fork-glass-frost]";
const TOKENS = `:is(${ROOT},${FROSTED})`;
const POPUP = `body.dropdown-glass${FROSTED}`;
const SUPPORTS = ["@supports (anchor-name: --fork-glass-card)"];
// The three frost hosts, as the sheet lists them inside one :is().
const HOSTS =
  ':is([data-fork-composer-stack="true"][data-fork-composer-vessel],[data-fork-composer-stack="true"][data-fork-composer-context-row]:is(button,[data-slot="button"],[data-fork-context-chip],[data-fork-pr-chip]),[data-chat-header][data-fork-pill])';

const sheet = readSibling("../theme.custom.glass.css");
const rules = cssRules(sheet);
const palettes = readSibling("../theme.custom.palettes.css");
const chatView = readSibling("../components/ChatView.tsx");
const customizations = readSibling("../../../../.fork/customizations.yaml");

// The formatter wraps selectors across lines; compare without whitespace.
const compact = (value: string) => value.replace(/\s+/gu, "");
const flat = (value: string | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();
const find = (selector: string) =>
  rules.find((rule) => compact(rule.selector) === compact(selector));

describe("fork guard: fork-glass-new-agent-stage", () => {
  it("registers the stage and loads its sheet from the palettes sheet", () => {
    expect(customizations).toContain("id: fork-glass-new-agent-stage");
    expect(customizations).toContain("apps/web/src/theme.custom.glass.css");
    expect(customizations).toContain("apps/web/src/custom/assets/glass-hero.png");
    expect(customizations).toContain("apps/web/src/custom/assets/glass-hero-frost.png");
    expect(customizations).toContain("apps/web/src/components/chat/PanelLayoutControls.tsx");
    // Both sheets @import before any rule; Westworld's stays first.
    const westworld = palettes.indexOf('@import "./theme.custom.westworld.css";');
    const glass = palettes.indexOf('@import "./theme.custom.glass.css";');
    expect(westworld).toBeGreaterThanOrEqual(0);
    expect(glass).toBeGreaterThan(westworld);
    for (const asset of ["glass-hero.png", "glass-hero-frost.png"]) {
      expect(
        NodeFS.existsSync(
          NodeURL.fileURLToPath(new URL(`../custom/assets/${asset}`, import.meta.url)),
        ),
        asset,
      ).toBe(true);
    }
  });

  it("scopes every rule to Glass and leaves a started thread alone", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selector, `unscoped rule "${rule.selector}"`).toContain(MARKER);
      expect(rule.selector, `rule not scoped to Glass "${rule.selector}"`).toContain(
        `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`,
      );
      // No filter on the frost: under the desktop glass a backdrop-filter on
      // the vessel blurs the picture in the renderer's composite and not on
      // screen (the vibrancy entry's standing rule, re-confirmed 2026-10-08 at
      // blur(40px)). The panel toggles are the one exception: they wear the
      // thread details menu's material, blur included, and a native window
      // capture (2026-10-10) showed that blur on screen.
      if (!rule.selector.includes("[data-fork-panel-toggle]")) {
        expect(rule.body, `filter in ${rule.selector}`).not.toMatch(/backdrop-filter/u);
      }
      // Never transparent: under the desktop glass that is a hole to the
      // raw wallpaper (the seam read orange against a sunset).
      expect(rule.body, `went transparent: ${rule.selector}`).not.toContain("transparent");
    }
    // The three rules that reach the root element itself declare the
    // containing block, the stacking context, the anchor and tokens — no
    // margin, clip, fill or border — so a started Glass thread is laid out
    // and painted exactly as before. Everything else is keyed on the draft,
    // or on the frost stamp the cutout only sets over the draft card.
    const VIBRANT_GLASS = `${compact(MARKER)}${VIBRANCY}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
    const root = rules.filter((rule) =>
      [ROOT, TOKENS].some((tail) => compact(rule.selector).endsWith(tail)),
    );
    expect(root.map((rule) => compact(rule.selector))).toEqual([
      `${compact(GLASS)}${ROOT}`,
      `${compact(GLASS)}${TOKENS}`,
      `${VIBRANT_GLASS}${TOKENS}`,
    ]);
    expect(flat(root[0]?.body)).toBe(
      "position: relative; isolation: isolate; anchor-name: --fork-glass-card;",
    );
    expect(flat(root[1]?.body)).toBe(
      '--fork-glass-card-inset: 8px; --fork-glass-card-fade: linear-gradient(to bottom, #000 59%, rgb(0 0 0 / 35%) 94%); --fork-glass-card-scrim: linear-gradient(to bottom, rgb(12 12 14 / 55%), rgb(12 12 14 / 0%) 96px); --fork-glass-frost-image: url("./custom/assets/glass-hero-frost.png"); --fork-glass-frost-veil: 10%; --fork-glass-frost-floor: var(--fork-glass-panel); --fork-glass-frost-mask: var(--fork-glass-card-fade);',
    );
    expect(flat(root[2]?.body)).toBe("--fork-glass-frost-floor: var(--fork-popup-glass-floor);");
    const unkeyed = rules.filter(
      (rule) => !compact(rule.selector).includes(HERO) && !root.includes(rule),
    );
    // Only the at-rest art and its reduced-motion twin paint without the
    // stamp, beside the frosted popups, which only exist over the draft.
    expect(unkeyed.map((rule) => compact(rule.selector))).toEqual([
      `${compact(GLASS)}${ROOT}::after`,
      `${compact(GLASS)}${ROOT}::after`,
      `${VIBRANT_GLASS}${POPUP}`,
      `${VIBRANT_GLASS}${POPUP}::after`,
    ]);
    // Every :has() that reads the stamp sits on the chat view, the inset or
    // the sidebar wrapper — never on :root, which would widen invalidation
    // to the whole document while a thread streams.
    for (const rule of rules) {
      // The raw selector: a :has() chained straight onto the :root compound,
      // before any descendant combinator.
      expect(rule.selector, `:root:has() in ${rule.selector}`).not.toMatch(
        /^:root(?:\[[^\]]*\]|\.[\w-]+)*:has\(/u,
      );
    }
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
    const art = find(`${GLASS}${ROOT}::after`);
    expect(art?.body).toMatch(/inset:\s*var\(--fork-glass-card-inset\)/u);
    expect(art?.body).toMatch(/border-radius:\s*8px/u);
    expect(art?.body).toContain("z-index: -1");
    expect(art?.body).toContain("pointer-events: none");
    // A scrim from the top edge so the header reads over the sky, the fade
    // toward the foot; the frost copies carry both so they keep matching.
    expect(flat(art?.body)).toContain(
      'background: var(--fork-glass-card-scrim), url("./custom/assets/glass-hero.png") 51% top / cover no-repeat;',
    );
    expect(art?.body).toContain("mask-image: var(--fork-glass-card-fade)");
    // Always painted, lifted by opacity alone, on the composer's own clock.
    expect(art?.body).toMatch(/opacity:\s*0;/u);
    expect(art?.body).toMatch(/transition:\s*opacity 400ms cubic-bezier\(0\.32, 0\.72, 0, 1\)/u);
    const lift = find(`${GLASS}${DRAFT}::after`);
    expect(lift?.body).toMatch(/opacity:\s*0\.8;/u);
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

  it("clears every opaque fill in the chat view and lifts the crumbs while the draft is empty", () => {
    // By class, like the vibrancy block: the header and the column's
    // messages wrapper both carry bg-background and both sit above the
    // root's picture, so an opaque client would otherwise show the picture
    // only in the header strip. The switch thumb is a foreground fill.
    const clear = find(`${GLASS}${DRAFT}.bg-background:not([data-slot="switch-thumb"])`);
    expect(flat(clear?.body)).toBe("background: none;");
    expect(chatView).toMatch(/className="relative flex min-h-0 flex-1 flex-col bg-background"/u);
    // The crumbs in full white with a soft shadow, on every descendant since
    // the crumbs carry text-foreground themselves.
    const crumb = rules.find(
      (rule) =>
        compact(rule.selector).startsWith(
          `${compact(GLASS)}${DRAFT}[data-chat-header]:is(ol:has([data-slot="workspace-breadcrumb-text"])`,
        ) && compact(rule.selector).includes('ol:has([data-slot="workspace-breadcrumb-text"])*)'),
    );
    expect(crumb?.body).toMatch(/color:\s*#ffffff/u);
    expect(crumb?.body).toMatch(/text-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 45%\)/u);
  });

  it("colours the gutter like the sidebar on both clients through one shared token", () => {
    // --fork-glass-panel is declared beside the panel's own --sidebar in the
    // palettes sheet, once per client, with the same value — so a retuned
    // panel moves the gutter and the frost floor with it.
    const paletteRules = cssRules(palettes);
    const glassScope = `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
    const panelHex = paletteRules.find(
      (rule) =>
        rule.selector.includes(glassScope) &&
        !rule.selector.includes(VIBRANCY) &&
        rule.selector.includes('[data-sidebar-version="v2"]') &&
        rule.body.includes("--sidebar:"),
    );
    const opaqueToken = paletteRules.find(
      (rule) =>
        rule.selector.includes(glassScope) &&
        !rule.selector.includes(VIBRANCY) &&
        rule.body.includes("--fork-glass-panel:"),
    );
    const sidebarHex = /--sidebar:\s*(#[0-9a-f]{6})/iu.exec(panelHex?.body ?? "")?.[1];
    expect(sidebarHex).toBeDefined();
    expect(opaqueToken?.body).toContain(`--fork-glass-panel: ${sidebarHex};`);

    const panelTint = paletteRules.find(
      (rule) =>
        rule.selector.includes(VIBRANCY) &&
        /--sidebar:\s*rgb\(\d+ \d+ \d+ \/ \d+%\)/u.test(rule.body),
    );
    const glassToken = paletteRules.find(
      (rule) => rule.selector.includes(VIBRANCY) && rule.body.includes("--fork-glass-panel:"),
    );
    const tint = /--sidebar:\s*(rgb\(\d+ \d+ \d+ \/ (\d+)%\))/u.exec(panelTint?.body ?? "");
    expect(tint?.[1]).toBeDefined();
    expect(Number(tint?.[2])).toBeGreaterThanOrEqual(70);
    expect(glassToken?.body).toContain(`--fork-glass-panel: ${tint?.[1]};`);

    const opaque = find(`${GLASS}:not(${VIBRANCY})[data-slot="sidebar-inset"]:has(${HERO})`);
    expect(flat(opaque?.body)).toBe("background-color: var(--fork-glass-panel);");
    const glassGutter = find(
      `${MARKER}${VIBRANCY}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"][data-slot="sidebar-inset"]:has(${HERO})`,
    );
    expect(flat(glassGutter?.body)).toBe(
      "background-image: linear-gradient(var(--fork-glass-panel) 0 100%);",
    );
    // Only these two rules paint the inset, and the opaque one never reaches
    // the glass client — an opaque fill there covers the material.
    expect(
      rules.filter((rule) => rule.selector.includes('[data-slot="sidebar-inset"]')),
    ).toHaveLength(2);

    // No seam: the panel's own fill on the container's border, read through
    // the sidebar wrapper, the nearest ancestor of both the panel and the draft.
    const seam = find(
      `${GLASS}[data-slot="sidebar-wrapper"]:has(${HERO})[data-slot="sidebar-container"][data-sidebar-version="v2"]`,
    );
    expect(flat(seam?.body)).toBe("border-color: var(--sidebar);");
  });

  it("restates the draft composer's fills and ink on the overlay", () => {
    const fills = find(`${GLASS}${HERO}`);
    expect(flat(fills?.body)).toBe(
      "--fork-composer-vessel-bg: rgb(255 255 255 / 5%); --fork-composer-bg: rgb(0 0 0 / 41%); --fork-composer-border: rgb(255 255 255 / 24%); --fork-composer-border-focus: rgb(255 255 255 / 38%); --fork-context-chip-bg: rgb(255 255 255 / 0%); --fork-context-chip-bg-hover: rgb(255 255 255 / 8%); --fork-composer-control-ink: rgb(255 255 255 / 80%);",
    );
    const traits = find(`${GLASS}${HERO}[data-chat-provider-model-picker-traits]`);
    expect(flat(traits?.body)).toBe("color: rgb(255 255 255 / 65%);");
  });

  it("frosts the composer, its pills and the header's controls with one anchored copy each", () => {
    // One host rule, one ::before, one focus rule — the hosts differ only in
    // the three tokens they state. The copy's box is the whole card, placed
    // by anchor() reads of the chat view plus the card's inset, so it lands
    // on the stage picture wherever the sidebar, panel and window put it.
    const host = find(`${GLASS}${DRAFT}${HOSTS}`);
    expect(host?.atRules).toEqual(SUPPORTS);
    expect(flat(host?.body)).toBe(
      "isolation: isolate; clip-path: inset(0 round var(--fork-glass-frost-radius)); background: var(--fork-glass-frost-floor); scale: none;",
    );
    // The clip steps out for the focus ring, on the host or anything in it
    // except the prompt editor: an editing host is focus-visible on every
    // click and draws no ring, so counting it haloed the vessel on focus.
    const focus = find(
      `${GLASS}${DRAFT}${HOSTS}:is(:focus-visible,:has(:focus-visible:not([data-testid="composer-editor"])))`,
    );
    expect(flat(focus?.body)).toBe(
      "clip-path: inset(-4px round calc(var(--fork-glass-frost-radius) + 4px));",
    );
    const frost = find(`${GLASS}${DRAFT}${HOSTS}::before`);
    expect(frost?.atRules).toEqual(SUPPORTS);
    expect(frost?.body).toMatch(/position:\s*fixed/u);
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(frost?.body).toMatch(
        new RegExp(
          `${edge}:\\s*calc\\(anchor\\(--fork-glass-card ${edge}\\) \\+ var\\(--fork-glass-card-inset\\)\\)`,
          "u",
        ),
      );
    }
    expect(frost?.body).toContain("z-index: -1");
    expect(frost?.body).toContain("pointer-events: none");
    expect(frost?.body).toContain("background: var(--fork-glass-frost-layers);");
    // The layers are stated once, on every element that states a wash (the
    // hosts and the frosted popup) — a custom property substitutes its var()s
    // where it is declared, so on the chat view it would miss the wash.
    const VIBRANT = `${MARKER}${VIBRANCY}.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
    const layers = find(`${GLASS}${DRAFT}${HOSTS},${VIBRANT}${POPUP}`);
    expect(layers?.atRules).toEqual([]);
    expect(flat(layers?.body)).toBe(
      "--fork-glass-frost-layers: linear-gradient(var(--fork-glass-frost-wash), var(--fork-glass-frost-wash)), linear-gradient( rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)), rgb(from var(--fork-glass-frost-floor) r g b / var(--fork-glass-frost-veil)) ), var(--fork-glass-card-scrim), var(--fork-glass-frost-image) 51% top / cover no-repeat;",
    );
    expect(sheet.match(/var\(--fork-glass-frost-image\)/gu)).toHaveLength(1);
    expect(frost?.body).toContain("mask-image: var(--fork-glass-frost-mask)");
    // Exactly one fixed pseudo-element recipe in the sheet.
    expect(rules.filter((rule) => /position:\s*fixed/u.test(rule.body))).toHaveLength(1);

    // Each host's tokens.
    const STACK = `${DRAFT}[data-fork-composer-stack="true"]`;
    const CHIPS = `${STACK}[data-fork-composer-context-row]:is(button,[data-slot="button"],[data-fork-context-chip],[data-fork-pr-chip])`;
    expect(flat(find(`${GLASS}${STACK}[data-fork-composer-vessel]`)?.body)).toBe(
      "--fork-glass-frost-wash: var(--fork-composer-vessel-bg); --fork-glass-frost-radius: var(--fork-composer-radius);",
    );
    expect(flat(find(`${GLASS}${CHIPS}`)?.body)).toBe(
      "--fork-glass-frost-wash: var(--fork-context-chip-bg); --fork-glass-frost-radius: 6px;",
    );
    const chipHover = rules.find(
      (rule) =>
        compact(rule.selector).startsWith(
          `${compact(GLASS)}${STACK}[data-fork-composer-context-row]`,
        ) && rule.selector.includes(":hover"),
    );
    expect(flat(chipHover?.body)).toBe(
      "--fork-glass-frost-wash: var(--fork-context-chip-bg-hover);",
    );
    const HEADER = `${DRAFT}[data-chat-header]`;
    expect(flat(find(`${GLASS}${HEADER}[data-fork-pill]`)?.body)).toBe(
      "--fork-glass-frost-wash: rgb(255 255 255 / 18%); --fork-glass-frost-radius: var(--fork-pill-radius); --fork-glass-frost-mask: none;",
    );
    expect(
      flat(find(`${GLASS}${HEADER}button[data-fork-pill]:is(:hover,[data-pressed])`)?.body),
    ).toBe("--fork-glass-frost-wash: rgb(255 255 255 / 26%);");
    // Every anchored copy, host clip and host wash is gated on anchor
    // support. The frosted popup places its copy without an anchor, so its
    // wash, and the layers token the two share, need no gate.
    for (const rule of rules) {
      const hostWash =
        /--fork-glass-frost-wash\s*:/u.test(rule.body) && compact(rule.selector).includes(HERO);
      if (hostWash || /anchor\(|clip-path/u.test(rule.body)) {
        expect(rule.atRules, rule.selector).toEqual(SUPPORTS);
      }
    }

    // All three panel toggles wear the thread details menu's material, not
    // the frost: the button that opens the menu reads as the card under it.
    expect(flat(find(`${GLASS}${HEADER}[data-fork-panel-toggle]`)?.body)).toContain(
      "background: var(--fork-popup-fill);",
    );
    // The toggle hosts are a real hook, not the TooltipTrigger's wrapper shape.
    const controls = readSibling("../components/chat/PanelLayoutControls.tsx");
    expect(controls.match(/data-fork-panel-toggle/gu)).toHaveLength(3);
    expect(controls).toContain("fork:begin fork-glass-new-agent-stage");
    expect(sheet).not.toContain("span:has(> button)");

    // Popups over the card carry the same copy, placed absolutely from the
    // lengths the cutout writes: a popup's positioner is transformed, which
    // would break an anchor. overflow, not clip-path, keeps the shadow.
    expect(flat(find(`${VIBRANT}${POPUP}`)?.body)).toBe(
      "isolation: isolate; overflow: clip; background: var(--fork-glass-frost-floor); --fork-glass-frost-wash: rgb(255 255 255 / 8%);",
    );
    const popupFrost = find(`${VIBRANT}${POPUP}::after`)?.body;
    expect(popupFrost).toMatch(/position:\s*absolute/u);
    for (const [edge, length] of [
      ["top", "y"],
      ["left", "x"],
      ["width", "width"],
      ["height", "height"],
    ]) {
      expect(popupFrost).toContain(`${edge}: var(--fork-glass-frost-${length});`);
    }
    expect(popupFrost).toContain("background: var(--fork-glass-frost-layers);");
    expect(popupFrost).toContain("mask-image: var(--fork-glass-frost-mask)");

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
});
