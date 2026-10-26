// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-3d`.
 *
 * The 3D glass switch turns off the stage card and the glass surfaces by a
 * root attribute every rule in their two sheets checks. A rule added to
 * either sheet without the gate would keep drawing with the switch off, so
 * this pins the gate on every root the sheets name.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_GLASS_3D_OFF_ATTRIBUTE } from "../custom/forkGlass3d";
import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const compact = (value: string) => value.replace(/\s+/gu, "");

const FORK_ROOT = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const GATE = `:where(:not([${FORK_GLASS_3D_OFF_ATTRIBUTE}="off"]))`;
const PALETTE = `.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
// The card-inset tokens hold with 3D off: the new-agent picture reads them.
const TOKENS = `${FORK_ROOT}${PALETTE}`;
const OFF_RADIUS = `${FORK_ROOT}[${FORK_GLASS_3D_OFF_ATTRIBUTE}="off"]${PALETTE}`;

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("fork guard: fork-glass-3d", () => {
  it("gates every rule in the stage and surfaces sheets", () => {
    for (const file of ["../theme.custom.glass-stage.css", "../theme.custom.glass-surfaces.css"]) {
      const rules = cssRules(readSibling(file));
      expect(rules.length, file).toBeGreaterThan(0);
      for (const rule of rules) {
        const selector = compact(rule.selector);
        if (selector === compact(TOKENS) || selector === compact(OFF_RADIUS)) continue;
        expect(count(selector, FORK_ROOT), `unscoped rule "${rule.selector}"`).toBeGreaterThan(0);
        expect(count(selector, `${FORK_ROOT}${GATE}`), `ungated rule "${rule.selector}"`).toBe(
          count(selector, FORK_ROOT),
        );
      }
    }
  });

  it("keeps the card insets with 3D off and gives the picture its old corners", () => {
    const rules = cssRules(readSibling("../theme.custom.glass-stage.css"));
    const tokens = rules.find((rule) => compact(rule.selector) === compact(TOKENS));
    expect(tokens?.body).toContain("--fork-glass-card-inset: 8px;");
    const off = rules.find((rule) => compact(rule.selector) === compact(OFF_RADIUS));
    expect(off?.body).toContain("--fork-glass-card-radius: 8px;");
  });

  it("drops the picture's halo clip with 3D off", () => {
    const glass = compact(readSibling("../theme.custom.glass.css"));
    expect(glass).toContain(compact(`${GATE}${PALETTE}`));
  });

  it("stamps the root before first render and offers the switch under Glass", () => {
    expect(readSibling("../main.tsx")).toContain("initializeForkGlass3d();");
    expect(readSibling("../components/settings/SettingsPanels.tsx")).toContain('title="3D glass"');
  });
});
