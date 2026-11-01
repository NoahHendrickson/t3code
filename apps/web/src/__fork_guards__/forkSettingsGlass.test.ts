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

const surfacesSheet = readSibling("../theme.custom.glass-surfaces.css");
const surfaces = cssRules(surfacesSheet);
const palettes = cssRules(readSibling("../theme.custom.palettes.css"));
const SETTINGS = `:root[${FORK_SETTINGS_ATTRIBUTE}]`;

describe("fork guard: settings glass", () => {
  it("stamps the root while Settings is open", () => {
    expect(readSibling("../routes/_chat.settings.tsx")).toContain("useForkSettingsMarker();");
  });

  it("puts Settings' dropdowns on the glass rim without outweighing it", () => {
    // The rim's popup list is written once and its rules nest under it, so
    // the Settings arm reaches every part of the rim or none of it.
    expect(surfacesSheet.split(SETTINGS)).toHaveLength(2);
    const parts = ["border-radius: 12px", "padding: 0.5px", "backdrop-filter: blur(12px)"];
    for (const part of parts) {
      const rule = surfaces.find(
        (candidate) =>
          candidate.selector.includes("[data-fork-glass-rim]") && candidate.body.includes(part),
      );
      expect(rule?.selector, part).toContain(SETTINGS);
    }
    for (const slot of ["menu-popup", "popover-popup", "select-popup", "combobox-popup"]) {
      expect(surfacesSheet).toContain(`[data-slot="${slot}"]`);
    }
    // The thread sort menu outranks the rim by one attribute; a weighted arm
    // would flatten its 18px corners back to 12px.
    expect(surfacesSheet).toMatch(/:where\(\s*:root\[data-fork-settings\]/u);
  });

  it("draws outline buttons and select triggers as the composer's chips", () => {
    const settings = (rule: { selector: string }) =>
      rule.selector.includes(`[${FORK_SETTINGS_ATTRIBUTE}]`) &&
      rule.selector.includes("dark\\:bg-input\\/32");
    const fill = palettes.find(
      (rule) => settings(rule) && rule.body.includes("--fork-context-chip-bg"),
    );
    expect(fill, "the chip fill keys on the wash both variants share").toBeDefined();
    // Layered, so the trigger's focus and invalid borders still win.
    expect(fill?.atRules).toContain("@layer utilities");
    // destructive-outline shares the wash and keeps its red hover.
    expect(fill?.selector).toContain(".text-destructive-foreground");
    // Only Full 3D trades the hairline for the rim; below it nothing else
    // edges the chip, and upstream's top highlight is dropped instead.
    const atFull = /:not\(\s*\[data-fork-glass-3d\]\s*\)/u;
    const noHairline = palettes.find(
      (rule) => settings(rule) && rule.body.includes("border-color"),
    );
    expect(noHairline?.selector).toMatch(atFull);
    expect(noHairline?.atRules).toContain("@layer utilities");
    const highlight = palettes.find((rule) => settings(rule) && rule.selector.endsWith("::before"));
    expect(highlight?.body).toContain("box-shadow: none");
    expect(highlight?.selector).toContain("[data-fork-glass-3d]");
    expect(highlight?.selector).not.toMatch(atFull);
    const depth = surfaces.find(
      (rule) => settings(rule) && rule.body.includes("--fork-glass-halo-soft"),
    );
    expect(depth?.selector).toContain(".text-destructive-foreground");
    expect(readSibling("../components/ui/button.tsx")).toMatch(
      /outline:\s*\n?\s*"[^"]*dark:bg-input\/32/u,
    );
    expect(readSibling("../components/ui/select.tsx")).toContain("dark:bg-input/32");
  });

  it("washes Settings' groups like every other card on the stage", () => {
    const wash = palettes.find(
      (rule) =>
        rule.selector.includes('[data-slot="sidebar-inset"]') &&
        rule.selector.includes(".bg-card\\/40"),
    );
    expect(wash?.body).toMatch(/background-color:\s*rgb\(255 255 255 \/ 5%\)/u);
    expect(readSibling("../components/settings/SettingsGroup.tsx")).toContain("bg-card/40");
    // The route modal portals out of the inset, so the wash carries a modal arm,
    // and the docked nav clears its opaque fill; below md it is an overlay.
    expect(wash?.selector).toContain("[data-app-modal]");
    const nav = palettes.find((rule) =>
      rule.selector.replace(/\s+/gu, " ").includes("[data-app-modal] nav.bg-sidebar"),
    );
    expect(nav?.body).toContain("background-color: transparent");
    expect(nav?.atRules.join(" ")).toContain("48rem");
    expect(readSibling("../components/settings/SettingsSidebarNav.tsx")).toMatch(
      /<nav[\s\S]*?"[^"]*bg-sidebar[^"]*max-md:/u,
    );
  });

  it("draws the active section as the sidebar's selected row", () => {
    expect(readSibling("../components/settings/SettingsSidebarNav.tsx")).toContain(
      'data-fork-chrome-row=""',
    );
  });
});
