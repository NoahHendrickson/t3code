// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-settings-glass`.
 *
 * Settings on Glass wears the composer's controls: its dropdowns take the
 * glass rim, its outline buttons and select triggers the chips' material,
 * its groups the stage card's wash, and its active section the sidebar's
 * selected-row glass. Every rule keys on markup upstream owns (a utility
 * class, a data-slot) or on a fenced stamp, so a sync that renames one turns
 * Settings back into upstream's look without failing anything else.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_SETTINGS_ATTRIBUTE } from "../custom/forkSettingsGlass";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const surfaces = cssRules(readSibling("../theme.custom.glass-surfaces.css"));
const SETTINGS = `:root[${FORK_SETTINGS_ATTRIBUTE}]`;

describe("fork guard: settings glass", () => {
  it("stamps the root while Settings is open", () => {
    expect(readSibling("../routes/settings.tsx")).toContain("useForkSettingsMarker();");
  });

  it("puts Settings' dropdowns on the glass rim without outweighing it", () => {
    const rim = surfaces.find(
      (rule) =>
        rule.selector.includes("[data-fork-glass-rim]") &&
        rule.selector.includes(SETTINGS) &&
        rule.body.includes("border-radius: 12px"),
    );
    expect(rim, "the rim's popup rule must carry the Settings arm").toBeDefined();
    for (const slot of ["menu-popup", "popover-popup", "select-popup", "combobox-popup"]) {
      expect(rim?.selector).toContain(`[data-slot="${slot}"]`);
    }
    // The thread sort menu outranks the rim by one attribute; a weighted arm
    // would flatten its 18px corners back to 12px.
    expect(rim?.selector).toMatch(/:where\(\s*:root\[data-fork-settings\]/u);
  });

  it("draws outline buttons and select triggers as the composer's chips", () => {
    const chip = surfaces.find(
      (rule) =>
        rule.selector.includes(`[${FORK_SETTINGS_ATTRIBUTE}]`) &&
        rule.selector.includes("dark\\:bg-input\\/32") &&
        rule.body.includes("--fork-context-chip-bg"),
    );
    expect(chip, "the chip rule keys on the wash both variants share").toBeDefined();
    expect(readSibling("../components/ui/button.tsx")).toMatch(
      /outline:\s*\n?\s*"[^"]*dark:bg-input\/32/u,
    );
    expect(readSibling("../components/ui/select.tsx")).toContain("dark:bg-input/32");
  });

  it("washes Settings' groups like every other card on the stage", () => {
    const wash = cssRules(readSibling("../theme.custom.palettes.css")).find(
      (rule) =>
        rule.selector.includes('[data-slot="sidebar-inset"]') &&
        rule.selector.includes(".bg-card\\/40"),
    );
    expect(wash?.body).toMatch(/background-color:\s*rgb\(255 255 255 \/ 5%\)/u);
    expect(readSibling("../components/settings/SettingsGroup.tsx")).toContain("bg-card/40");
  });

  it("draws the active section as the sidebar's selected row", () => {
    expect(readSibling("../components/settings/SettingsSidebarNav.tsx")).toContain(
      'data-fork-chrome-row=""',
    );
  });
});
