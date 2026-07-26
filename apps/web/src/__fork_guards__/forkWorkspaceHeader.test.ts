// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-workspace-header`.
 *
 * The pill restyle is deliberately lopsided: three upstream files gain one
 * attribute each, and every visual decision lives in the fork's own stylesheet.
 * That makes the attribute the single point of failure — drop it in a rebase
 * and the CSS still compiles, still ships, and matches nothing. Hence a check
 * per control rather than one for the stylesheet.
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
const upstreamCss = readSibling("../index.css");
const chatHeader = readSibling("../components/chat/ChatHeader.tsx");
const iconShim = readSibling("../custom/icons/lucide-phosphor.tsx");

describe("fork guard: fork-workspace-header", () => {
  it("keeps all three header controls marked as pills", () => {
    // One attribute per file, and the whole restyle hangs off it.
    for (const path of [
      "../components/ProjectScriptsControl.tsx",
      "../components/chat/OpenInPicker.tsx",
      "../components/GitActionsControl.tsx",
    ]) {
      expect(readSibling(path), `${path} lost data-fork-pill`).toContain("data-fork-pill");
    }
  });

  it("styles the pills only under the fork marker", () => {
    // An unmarked, pure-upstream build must render upstream's buttons, so every
    // `data-fork-pill` rule has to be scoped.
    //
    // This reads each rule's *own* selector. The earlier version asked only
    // whether a marker appeared somewhere earlier in the file, which passed for
    // any rule below the first marker block, scoped or not — a tripwire dressed
    // up as a proof.
    const pillRules = cssRules(theme).filter((rule) => rule.selector.includes("[data-fork-pill]"));
    expect(pillRules.length).toBeGreaterThan(0);
    for (const rule of pillRules) {
      expect(rule.selector, `unscoped data-fork-pill rule: ${rule.selector}`).toContain(MARKER);
    }
  });

  it("rounds the pills fully and drops the raised button treatment", () => {
    expect(theme).toMatch(/--fork-pill-radius:\s*999px/u);
    // The outline variant paints its border, fill and inset highlight from
    // tokens that assume a button floating above a page. All three go.
    expect(theme).toMatch(/\[data-fork-pill\][\s\S]{0,600}background:\s*transparent/u);
    expect(theme).toMatch(/\[data-fork-pill\][\s\S]{0,600}box-shadow:\s*none/u);
  });

  it("takes the drawn pill colours in dark and defers to upstream in light", () => {
    // Dark-only design. The light build must fall through to --border /
    // --foreground / --accent rather than inherit a hardcoded dark border.
    expect(theme).toMatch(/\.dark\s*\{[^}]*--fork-pill-border:\s*#333333/u);
    expect(theme).toMatch(/\.dark\s*\{[^}]*--fork-pill-fg:\s*#e6e6e6/u);
    expect(theme).toMatch(/--fork-pill-border:\s*var\(--border\)/u);
    expect(theme).toMatch(/--fork-pill-fg:\s*var\(--foreground\)/u);
  });

  it("raises the topbar to 56px in both the default and WCO derivations", () => {
    // Two declarations, and missing the second leaves Windows Controls Overlay
    // builds 4px short of every other platform.
    expect(upstreamCss).toMatch(/--workspace-topbar-height:\s*56px/u);
    expect(upstreamCss).toMatch(
      /--workspace-topbar-height:\s*env\(titlebar-area-height,\s*56px\)/u,
    );
  });

  it("inverts the project/title weight and drops the favicon", () => {
    // The project is the landmark; the title is prose. Reverting either half
    // gives two competing bold runs, which is what upstream had.
    expect(chatHeader).toMatch(/font-semibold text-muted-foreground/u);
    expect(chatHeader).toMatch(/truncate text-sm font-normal text-foreground/u);
    expect(chatHeader).not.toContain("ProjectFavicon");
  });

  it("maps the panel toggles to the design's half-square glyphs", () => {
    // Done in the shim, not at the call site, so upstream's imports stay
    // untouched — see phosphor-duotone-icons.
    expect(iconShim).toMatch(/PanelRightIcon\s*=\s*icon\("panel-right",\s*PhSquareHalf,/u);
    expect(iconShim).toMatch(/PanelBottomIcon\s*=\s*icon\("panel-bottom",\s*PhSquareHalfBottom,/u);
  });
});
