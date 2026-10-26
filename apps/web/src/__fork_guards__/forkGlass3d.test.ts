// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-3d`.
 *
 * The 3D glass setting (Full / Selected items only / Off) gates the stage
 * card and the glass surfaces by a root attribute, through parent rules
 * that carry the gate. A rule written outside those parents would ignore the
 * setting, and a rule in a selection parent that is not a selected row would
 * leak depth into "Selected items only".
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_GLASS_3D_ATTRIBUTE } from "../custom/forkGlass3d";
import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules, topLevelHeaders } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const compact = (value: string) => value.replace(/\s+/gu, "");

const FORK_ROOT = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const FULL = `${FORK_ROOT}:where(:not([${FORK_GLASS_3D_ATTRIBUTE}]))`;
const NOT_OFF = `${FORK_ROOT}:where(:not([${FORK_GLASS_3D_ATTRIBUTE}="off"]))`;
const PALETTE = `.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;

describe("fork guard: fork-glass-3d", () => {
  it("needs Full for the stage card", () => {
    expect(topLevelHeaders(readSibling("../theme.custom.glass-stage.css"))).toEqual([FULL]);
  });

  it("keeps only the tokens and the selected rows with selected items only", () => {
    const sheet = readSibling("../theme.custom.glass-surfaces.css");
    expect(topLevelHeaders(sheet)).toEqual([NOT_OFF, FULL, NOT_OFF, FULL]);
    const selection = cssRules(sheet).filter((rule) => rule.selector.includes(NOT_OFF));
    expect(selection.length).toBeGreaterThan(0);
    for (const rule of selection) {
      const isTokens = compact(rule.selector) === compact(`${NOT_OFF}${PALETTE}`);
      const isSelectedRow = /\[data-thread-item\]|\[data-fork-chrome-row\]/u.test(rule.selector);
      expect(isTokens || isSelectedRow, `not a selected row: "${rule.selector}"`).toBe(true);
      expect(rule.selector, rule.selector).not.toContain("data-fork-thread-sort");
    }
  });

  it("keeps the card geometry outside the setting and the picture's old corners short of Full", () => {
    const rules = cssRules(readSibling("../theme.custom.palettes.css"));
    const tokens = rules.find((rule) => rule.body.includes("--fork-glass-card-inset:"));
    expect(compact(tokens?.selector ?? "")).toBe(compact(`${FORK_ROOT}${PALETTE}`));
    const corners = rules.find(
      (rule) =>
        compact(rule.selector) === compact(`${FORK_ROOT}[${FORK_GLASS_3D_ATTRIBUTE}]${PALETTE}`),
    );
    expect(corners?.body).toContain("--fork-glass-card-radius: 8px;");
  });

  it("drops the picture's halo clip short of Full", () => {
    const glass = compact(readSibling("../theme.custom.glass.css"));
    expect(glass).toContain(compact(`:where(:not([${FORK_GLASS_3D_ATTRIBUTE}]))${PALETTE}`));
  });

  it("stamps the root before first render and offers the setting under Glass", () => {
    expect(readSibling("../main.tsx")).toContain("initializeForkGlass3d();");
    expect(readSibling("../components/settings/SettingsPanels.tsx")).toContain('title="3D glass"');
  });
});
