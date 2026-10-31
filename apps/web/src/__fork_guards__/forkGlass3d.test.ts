// @effect-diagnostics nodeBuiltinImport:off
/* Fork guard, see `.fork/customizations.yaml#fork-glass-3d`. The 3D glass setting gates depth
   through parent rules on a root attribute; a rule outside them ignores the setting, and one
   in a selection parent that is not a selected row leaks depth into "Selected items only". */

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

  it("keeps only the tokens, the selected rows and the quick-start buttons with selected items only", () => {
    const sheet = readSibling("../theme.custom.glass-surfaces.css");
    expect(topLevelHeaders(sheet)).toEqual([NOT_OFF, FULL, NOT_OFF, FULL]);
    const selection = cssRules(sheet).filter((rule) => rule.selector.includes(NOT_OFF));
    expect(selection.length).toBeGreaterThan(0);
    for (const rule of selection) {
      const isTokens = compact(rule.selector) === compact(`${NOT_OFF}${PALETTE}`);
      const isSelectedRow = /\[data-thread-item\]|\[data-fork-chrome-row\]/u.test(rule.selector);
      // The block's one named exception (fork-sidebar-recent-projects); a
      // new chip belongs under Full, not on this list.
      const isQuickStart = compact(rule.selector).endsWith("[data-fork-recent-project]");
      expect(
        isTokens || isSelectedRow || isQuickStart,
        `not a selected row: "${rule.selector}"`,
      ).toBe(true);
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
    expect(readSibling("../components/settings/AppearanceSettingsPanel.tsx")).toContain(
      'title="3D glass"',
    );
  });
});
