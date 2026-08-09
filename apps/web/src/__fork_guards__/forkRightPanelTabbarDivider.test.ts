// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-right-panel-tabbar-divider`.
 *
 * The divider is pure CSS keyed off an upstream data attribute. Either half
 * disappearing (attribute renamed, or the fork rule dropped) silently restores
 * the seamless tab/content join the customization exists to break.
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
const rightPanelTabs = readSibling("../components/RightPanelTabs.tsx");

describe("fork guard: fork-right-panel-tabbar-divider", () => {
  it("keeps the tab strip marked for the theme rule", () => {
    expect(rightPanelTabs).toContain("data-right-panel-tabbar");
  });

  it("draws a fork-scoped hairline under the tab strip with --border", () => {
    const tabbarRules = cssRules(theme).filter((rule) =>
      rule.selector.includes("[data-right-panel-tabbar]"),
    );
    expect(tabbarRules.length).toBeGreaterThan(0);
    for (const rule of tabbarRules) {
      expect(rule.selector, `unscoped tabbar rule: ${rule.selector}`).toContain(MARKER);
      expect(rule.body).toMatch(/border-bottom:\s*1px\s+solid\s+var\(--border\)/u);
    }
  });
});
