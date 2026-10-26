// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-3d`.
 *
 * The 3D glass switch turns off the stage card and the glass surfaces by a
 * root attribute. Each of their sheets nests under one parent that carries
 * the gate, so a rule written beside that parent rather than inside it would
 * keep drawing with the switch off.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_GLASS_3D_OFF_ATTRIBUTE } from "../custom/forkGlass3d";
import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules, ruleBodyFor, topLevelHeaders } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const compact = (value: string) => value.replace(/\s+/gu, "");

const FORK_ROOT = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const GATE = `:where(:not([${FORK_GLASS_3D_OFF_ATTRIBUTE}="off"]))`;
const PALETTE = `.dark[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;

describe("fork guard: fork-glass-3d", () => {
  it("nests each 3D sheet under one gated parent", () => {
    for (const file of ["../theme.custom.glass-stage.css", "../theme.custom.glass-surfaces.css"]) {
      expect(topLevelHeaders(readSibling(file)), file).toEqual([`${FORK_ROOT}${GATE}`]);
    }
  });

  it("keeps the card geometry outside the switch and gives the picture its old corners", () => {
    const rules = cssRules(readSibling("../theme.custom.palettes.css"));
    const tokens = rules.find((rule) => rule.body.includes("--fork-glass-card-inset:"));
    expect(compact(tokens?.selector ?? "")).toBe(compact(`${FORK_ROOT}${PALETTE}`));
    expect(
      ruleBodyFor(rules, [`${FORK_ROOT}[${FORK_GLASS_3D_OFF_ATTRIBUTE}="off"]${PALETTE}`]),
    ).toContain("--fork-glass-card-radius: 8px;");
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
