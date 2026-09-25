// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-popup-surface`.
 *
 * Popup menus frost on one recipe: a contrast wash over a translucent
 * --popover tint under a heavy blur, so a menu reads as a lighter floating
 * layer over whatever it opens on. A sync that renames a popup slot or drops
 * the rule quietly returns the menus to upstream's denser, darker glass —
 * everything still compiles. The rule has one arm per primitive because each
 * puts `dropdown-glass` on a different node relative to its `data-slot`; a
 * sync that moves the class silently un-matches that primitive, so the guard
 * pins the DOM shape too.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_GLASS_POPUP_SELECTOR } from "../custom/forkGlassPopupCutout";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/** The JSX opening tag (from its `<`) up to the given attribute. */
function openingTagBefore(source: string, attribute: string): string {
  const at = source.indexOf(attribute);
  expect(at, attribute).toBeGreaterThan(-1);
  return source.slice(source.lastIndexOf("<", at), at);
}

const flat = (selector: string) => selector.replace(/\s+/gu, " ");

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const palettes = readSibling("../theme.custom.palettes.css");
const menu = readSibling("../components/ui/menu.tsx");
const select = readSibling("../components/ui/select.tsx");
const combobox = readSibling("../components/ui/combobox.tsx");
const popover = readSibling("../components/ui/popover.tsx");
const tooltip = readSibling("../components/ui/tooltip.tsx");

/** One arm per primitive, keyed to where it stamps `dropdown-glass`. */
const SELECTOR_ARMS = [
  ':is( [data-slot="menu-popup"], [data-slot="popover-popup"], [data-slot="tooltip-popup"], [data-slot="dialog-popup"] ).dropdown-glass',
  '[data-slot="select-popup"] > .dropdown-glass',
  '.dropdown-glass:has(> [data-slot="combobox-popup"])',
] as const;

const GLASS_GATE =
  ':root[data-fork="noahhendrickson-t3code"][data-fork-sidebar-vibrancy="true"].dark[data-fork-theme="cool-darker"]';

const WASH = "color-mix(in srgb, var(--contrast-foreground) 8%, transparent)";
const HAIRLINE = "color-mix(in srgb, var(--contrast-foreground) 12%, transparent)";

describe("fork guard: fork-popup-surface", () => {
  it.each([
    [".surface-glass", "--fork-context-chip-bg"],
    ["button.surface-glass:is(:hover, [data-pressed])", "--fork-context-chip-bg-hover"],
  ])("paints %s with the shared chip fill over an opaque glass floor", (selector, token) => {
    const rule = cssRules(palettes).find(
      (candidate) => candidate.selector.replace(/\s+/gu, " ") === `${GLASS_GATE} ${selector}`,
    );
    expect(rule?.body.replace(/\s+/gu, " ")).toContain(
      `background: linear-gradient(var(${token}), var(${token})), var(--fork-popup-glass-floor);`,
    );
  });

  const frosts = cssRules(theme).filter(
    (candidate) =>
      candidate.selector.includes(".dropdown-glass") &&
      /backdrop-filter: blur\(\d+px\)/u.test(candidate.body),
  );
  const frost = frosts[0];

  it("frosts popup menus lighter than what they open over", () => {
    // One rule, not one per surface: the earlier design carved frosted
    // exceptions out of an opaque fill, each keyed on its own stamp.
    expect(frosts).toHaveLength(1);
    expect(frost?.selector).toContain(MARKER);
    expect(frost?.selector).toContain(".dark");
    expect(frost?.selector).not.toContain("data-fork-glass");
    // A low tint: the blurred backdrop colours the popup, the wash only
    // lifts it. Heavier than upstream's 12px so text behind reads as texture.
    expect(flat(frost?.body ?? "")).toContain(
      `background: linear-gradient( ${WASH}, ${WASH} ), color-mix(in srgb, var(--popover) 45%, transparent);`,
    );
    expect(frost?.body).toContain(`border-color: ${HAIRLINE};`);
    expect(frost?.body).toContain("backdrop-filter: blur(28px) saturate(1.4);");
    expect(frost?.body).not.toContain("backdrop-filter: none");
    // No fork rule paints the popups opaque any more — in either sheet.
    for (const sheet of [theme, palettes]) {
      const opaque = cssRules(sheet).find(
        (candidate) =>
          candidate.selector.includes(".dropdown-glass") &&
          candidate.body.includes("--fork-composer-vessel-bg"),
      );
      expect(opaque).toBeUndefined();
    }
  });

  it("stands on the composer's wash over a cut-out hole under Glass", () => {
    // Over the native material a backdrop-filter never blurs the rows on
    // screen (tested), so the Glass popup copies the composer's control row:
    // custom/forkGlassPopupCutout.ts masks the rows out from under it and
    // the popup paints the vessel's 6% white wash over the stage tint,
    // straight on the material — no measured floor.
    const strip = cssRules(palettes).find(
      (candidate) =>
        candidate.selector.startsWith(GLASS_GATE) &&
        candidate.body.includes("--glass-opacity: 100%"),
    );
    expect(strip?.selector).toContain(".dialog-glass:not(.dropdown-glass)");
    expect(flat(strip?.selector ?? "")).not.toMatch(/[\s,]\.dropdown-glass/u);
    const glassPopup = cssRules(palettes).find(
      (candidate) =>
        flat(candidate.selector).startsWith(`${GLASS_GATE} :is(`) &&
        candidate.selector.includes('[data-slot="menu-popup"]') &&
        candidate.selector.includes(".dropdown-glass"),
    );
    for (const arm of SELECTOR_ARMS) {
      expect(flat(glassPopup?.selector ?? ""), arm).toContain(arm);
    }
    expect(glassPopup?.body).toContain("backdrop-filter: none;");
    expect(glassPopup?.body).not.toContain("--glass-opacity");
    expect(glassPopup?.body).not.toContain("--fork-popup-glass-floor");
    expect(flat(glassPopup?.body ?? "")).toContain(
      "background: linear-gradient(rgb(255 255 255 / 6%), rgb(255 255 255 / 6%)), rgb(22 22 22 / 84%);",
    );
    expect(glassPopup?.body).toContain("border-color: rgb(255 255 255 / 8%);");
    // The hole is cut the frame a popup mounts, so a fade-in would flash the
    // bare material through it: Glass popups open at full strength.
    const opening = cssRules(palettes).find(
      (candidate) =>
        flat(candidate.selector) === `${GLASS_GATE} .dropdown-glass[data-starting-style]`,
    );
    expect(opening?.body).toContain("opacity: 1;");
    expect(opening?.body).toContain("scale: none;");
    // The cutout script finds the same popups the rule paints.
    const tight = (selector: string) =>
      flat(selector).replace(/\(\s+/gu, "(").replace(/\s+\)/gu, ")");
    for (const arm of SELECTOR_ARMS) {
      expect(tight(FORK_GLASS_POPUP_SELECTOR), arm).toContain(tight(arm));
    }
    // No list-side blur, no page surface, no clone: those were tried and read
    // as a modal dim rather than a frost.
    for (const candidate of cssRules(palettes)) {
      expect(candidate.body, candidate.selector).not.toMatch(/(?<!backdrop-)filter: blur/u);
      expect(flat(candidate.selector).endsWith(") body")).toBe(false);
    }
  });

  it("hovers popup rows with the selected row's wash, not --accent", () => {
    // The fork palettes make --accent an opaque grey — a bluish slab on the
    // frost — so upstream's hover reads as a second material next to the 8%
    // foreground wash on a selected row.
    const ROW_SLOTS = [
      "menu-item",
      "menu-checkbox-item",
      "menu-radio-item",
      "menu-sub-trigger",
      "select-item",
      "combobox-item",
    ] as const;
    for (const slot of ROW_SLOTS) {
      const source = slot.startsWith("menu") ? menu : slot.startsWith("select") ? select : combobox;
      expect(source, slot).toContain(`data-slot="${slot}"`);
    }
    expect(combobox).toContain("data-selected:bg-foreground/[0.08]");
    expect(select).toContain("data-selected:bg-foreground/[0.08]");
    expect(menu).toContain("data-checked:bg-foreground/[0.08]");
    const hover = cssRules(theme).find(
      (candidate) =>
        flat(candidate.selector).includes(":is([data-highlighted], [data-popup-open], :hover)") &&
        candidate.body.includes("var(--foreground) 8%"),
    );
    expect(hover?.selector).toContain(MARKER);
    expect(hover?.selector).toContain(".dark");
    for (const slot of ROW_SLOTS) {
      expect(hover?.selector, slot).toContain(`[data-slot="${slot}"]`);
    }
    expect(hover?.body).toMatch(
      /background:\s*color-mix\(in oklab, var\(--foreground\) 8%, transparent\)/u,
    );
    const selectedHover = cssRules(theme).find((candidate) =>
      flat(candidate.selector).includes(
        ":is([data-selected], [data-checked]):is([data-highlighted], :hover)",
      ),
    );
    expect(selectedHover?.selector).toContain(MARKER);
    expect(selectedHover?.body).toMatch(
      /background:\s*color-mix\(in oklab, var\(--foreground\) 12%, transparent\)/u,
    );
  });

  it("draws popup separators as a light contrast hairline", () => {
    // Upstream's --border is an opaque palette grey that reads as a dark bar
    // on the frosted and measured-floor popups; a 12% contrast alpha lifts
    // off whatever the popup paints instead.
    for (const slot of ["menu-separator", "select-separator", "combobox-separator"] as const) {
      const source = slot.startsWith("menu") ? menu : slot.startsWith("select") ? select : combobox;
      expect(source, slot).toContain(`data-slot="${slot}"`);
    }
    const separator = cssRules(theme).find(
      (candidate) =>
        flat(candidate.selector).includes('[data-slot="menu-separator"]') &&
        candidate.body.includes("var(--contrast-foreground) 12%"),
    );
    expect(separator?.selector).toContain(MARKER);
    expect(separator?.selector).toContain(".dark");
    expect(separator?.selector).toContain('[data-slot="select-separator"]');
    expect(separator?.selector).toContain('[data-slot="combobox-separator"]');
  });

  it("carries one arm per primitive", () => {
    // No fork fallback for browsers without backdrop-filter: upstream's
    // utility paints --popover with !important there, which nothing declared
    // in the fork sheets can outrank, so a fork block would be dead weight.
    expect(theme).not.toMatch(
      /@supports not \(\(-webkit-backdrop-filter[^{]*\{\s*:root\[data-fork/u,
    );
    for (const arm of SELECTOR_ARMS) {
      expect(flat(frost?.selector ?? ""), arm).toContain(arm);
    }
  });

  it("targets dropdown-glass on the node each primitive actually puts it on", () => {
    // Menu, popover and the glass tooltip: the class sits on the slotted
    // popup element itself.
    expect(openingTagBefore(menu, 'data-slot="menu-popup"')).toContain("dropdown-glass");
    expect(openingTagBefore(popover, 'data-slot="popover-popup"')).toContain("dropdown-glass");
    expect(openingTagBefore(tooltip, 'data-slot="tooltip-popup"')).toContain("dropdown-glass");

    // Select: the popup is bare; the glass is a <div> child inside it.
    expect(openingTagBefore(select, 'data-slot="select-popup"')).not.toContain("dropdown-glass");
    const selectPopupStart = select.indexOf('data-slot="select-popup"');
    const selectPopupEnd = select.indexOf("</SelectPrimitive.Popup>", selectPopupStart);
    expect(selectPopupEnd).toBeGreaterThan(selectPopupStart);
    expect(select.slice(selectPopupStart, selectPopupEnd)).toMatch(
      /<div\s+className=\{cn\(\s*"dropdown-glass/u,
    );

    // Combobox: the glass is the wrapper <span> whose child is the popup —
    // the shape the first draft of this rule missed.
    expect(openingTagBefore(combobox, 'data-slot="combobox-popup"')).not.toContain(
      "dropdown-glass",
    );
    expect(combobox).toMatch(
      /<span\s+className=\{cn\(\s*"dropdown-glass[\s\S]*?>\s*<ComboboxPrimitive\.Popup\b[\s\S]*?data-slot="combobox-popup"/u,
    );
  });
});
