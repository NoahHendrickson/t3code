// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-popup-surface`.
 *
 * Popup menus paint the composer fill (fill over vessel over stage) with the
 * composer hairline, so a menu beside the Questions card is the same material.
 * A sync that renames a popup slot or drops the rule quietly returns the
 * menus to upstream's blurred --popover tint — everything still compiles.
 * The rule has one arm per primitive because each puts `dropdown-glass` on a
 * different node relative to its `data-slot`; a sync that moves the class
 * silently un-matches that primitive, so the guard pins the DOM shape too.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

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

/** One arm per primitive, keyed to where it stamps `dropdown-glass`. */
const SELECTOR_ARMS = [
  ':is([data-slot="menu-popup"], [data-slot="popover-popup"]).dropdown-glass',
  '[data-slot="select-popup"] > .dropdown-glass',
  '.dropdown-glass:has(> [data-slot="combobox-popup"])',
] as const;

describe("fork guard: fork-popup-surface", () => {
  const rule = cssRules(theme).find(
    (candidate) =>
      candidate.selector.includes(".dropdown-glass") &&
      candidate.body.includes("--fork-composer-vessel-bg"),
  );
  const glass = cssRules(palettes).find(
    (candidate) =>
      candidate.selector.includes('[data-fork-sidebar-vibrancy="true"]') &&
      candidate.selector.includes(".dropdown-glass") &&
      candidate.body.includes("--fork-composer-vessel-bg"),
  );

  it("paints popup menus as the composer stack, opaque and unblurred", () => {
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.selector).toContain(".dark");
    expect(rule?.body).toMatch(
      /background:\s*linear-gradient\(var\(--fork-composer-bg\), var\(--fork-composer-bg\)\),\s*linear-gradient\(var\(--fork-composer-vessel-bg\), var\(--fork-composer-vessel-bg\)\),\s*var\(--background\)/u,
    );
    expect(rule?.body).toMatch(/border-color:\s*var\(--fork-composer-border\)/u);
    expect(rule?.body).toMatch(/backdrop-filter:\s*none/u);
  });

  it("stands on the on-screen stage colour under Cool Darker glass", () => {
    // The composer's well and tray are alphas over a wallpaper-lit stage
    // there, so the bare --background floor opens beside the Questions card
    // several points too dark. The floor swaps for the stage as it reads on
    // screen — and stays opaque, because the menu opens over the transcript
    // and a translucent one shows the text through.
    expect(glass?.selector).toContain(MARKER);
    expect(glass?.selector).toContain('[data-fork-theme="cool-darker"]');
    expect(glass?.body).toMatch(
      /background:\s*linear-gradient\(var\(--fork-composer-bg\), var\(--fork-composer-bg\)\),\s*linear-gradient\(var\(--fork-composer-vessel-bg\), var\(--fork-composer-vessel-bg\)\),\s*var\(--fork-popup-glass-floor\);/u,
    );
    const floor = cssRules(palettes).find(
      (candidate) =>
        candidate.selector.includes('[data-fork-sidebar-vibrancy="true"]') &&
        candidate.body.includes("--fork-popup-glass-floor:"),
    );
    // Opaque: an rgb() triple with no alpha.
    expect(floor?.body).toMatch(/--fork-popup-glass-floor:\s*rgb\(\d+ \d+ \d+\);/u);
  });

  it("hovers popup rows with the selected row's wash, not --accent", () => {
    // The fork palettes make --accent an opaque grey — the popup's own fill on
    // the Cool palettes, a bluish slab on the wallpaper-tinted floor under
    // glass — so upstream's hover either vanishes or reads as a second
    // material next to the 8% foreground wash on a selected row.
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

  it("carries the same arm for each primitive in both sheets", () => {
    for (const arm of SELECTOR_ARMS) {
      expect(flat(rule?.selector ?? ""), arm).toContain(arm);
      expect(flat(glass?.selector ?? ""), arm).toContain(arm);
    }
  });

  it("targets dropdown-glass on the node each primitive actually puts it on", () => {
    // Menu and popover: the class sits on the slotted popup element itself.
    expect(openingTagBefore(menu, 'data-slot="menu-popup"')).toContain("dropdown-glass");
    expect(openingTagBefore(popover, 'data-slot="popover-popup"')).toContain("dropdown-glass");

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
