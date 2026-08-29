// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-popup-surface`.
 *
 * Popup menus paint the composer fill (fill over vessel over stage) with the
 * composer hairline, so a menu beside the Questions card is the same material.
 * A sync that renames a popup slot or drops the rule quietly returns the
 * menus to upstream's blurred --popover tint — everything still compiles.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const palettes = readSibling("../theme.custom.palettes.css");

const POPUP_SLOTS = [
  ["menu-popup", "../components/ui/menu.tsx"],
  ["select-popup", "../components/ui/select.tsx"],
  ["combobox-popup", "../components/ui/combobox.tsx"],
  ["popover-popup", "../components/ui/popover.tsx"],
] as const;

describe("fork guard: fork-popup-surface", () => {
  const rule = cssRules(theme).find(
    (candidate) =>
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
    const rules = cssRules(palettes);
    const glass = rules.find(
      (candidate) =>
        candidate.selector.includes('[data-fork-sidebar-vibrancy="true"]') &&
        candidate.selector.includes(".dropdown-glass") &&
        candidate.body.includes("--fork-composer-vessel-bg"),
    );
    expect(glass?.selector).toContain(MARKER);
    expect(glass?.selector).toContain('[data-fork-theme="cool-darker"]');
    for (const [slot] of POPUP_SLOTS) {
      expect(glass?.selector, slot).toContain(`[data-slot="${slot}"]`);
    }
    expect(glass?.body).toMatch(
      /background:\s*linear-gradient\(var\(--fork-composer-bg\), var\(--fork-composer-bg\)\),\s*linear-gradient\(var\(--fork-composer-vessel-bg\), var\(--fork-composer-vessel-bg\)\),\s*var\(--fork-popup-glass-floor\);/u,
    );
    const floor = rules.find(
      (candidate) =>
        candidate.selector.includes('[data-fork-sidebar-vibrancy="true"]') &&
        candidate.body.includes("--fork-popup-glass-floor:"),
    );
    // Opaque: an rgb() triple with no alpha.
    expect(floor?.body).toMatch(/--fork-popup-glass-floor:\s*rgb\(\d+ \d+ \d+\);/u);
  });

  it("names every popup slot upstream still stamps", () => {
    for (const [slot, componentPath] of POPUP_SLOTS) {
      expect(rule?.selector, slot).toContain(`[data-slot="${slot}"]`);
      const component = readSibling(componentPath);
      expect(component, componentPath).toContain(`data-slot="${slot}"`);
      expect(component, componentPath).toContain("dropdown-glass");
    }
  });
});
