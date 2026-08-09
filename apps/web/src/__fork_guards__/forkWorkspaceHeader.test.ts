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
    // The empty-scripts "Add action" branch is a lone button (no Group). Dropping the
    // mark there leaves it on the raised outline while Open / Commit & push stay pills.
    const scripts = readSibling("../components/ProjectScriptsControl.tsx");
    expect(scripts).toMatch(/aria-label="Add action"[\s\S]{0,80}data-fork-pill/u);
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

  it("rounds the pills to 4px and drops the raised button treatment", () => {
    expect(theme).toMatch(/--fork-pill-radius:\s*4px/u);
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

  it("keeps the topbar at 52px in both the default and WCO derivations", () => {
    // One token for sidebar header and workspace header — a drift between the
    // two misaligns the seam. Missing the WCO fallback leaves Windows Controls
    // Overlay builds on a different height than every other platform.
    expect(upstreamCss).toMatch(/--workspace-topbar-height:\s*52px/u);
    expect(upstreamCss).toMatch(
      /--workspace-topbar-height:\s*env\(titlebar-area-height,\s*52px\)/u,
    );
  });

  it("inverts the project/title weight and drops the favicon", () => {
    // The project is the landmark; the title is prose. Reverting either half
    // gives two competing bold runs, which is what upstream had.
    //
    // The semibold must be anchored to the project name itself. A loose
    // class-pair match also hits the `/` separator, which keeps the test green
    // after the name reverts to upstream's font-medium — the exact
    // tripwire-dressed-as-proof failure the pill-scoping test above was
    // rewritten to eliminate.
    expect(chatHeader).toMatch(/text-sm font-semibold">\{activeProjectName\}/u);
    // The muted colour lives on the breadcrumb trigger and cascades to the
    // name; hover restores foreground, which is upstream's affordance.
    expect(chatHeader).toMatch(
      /aria-label=\{`New thread in \$\{activeProjectName\}`\}[\s\S]{0,400}text-muted-foreground/u,
    );
    expect(chatHeader).toMatch(/truncate text-sm font-normal text-foreground/u);
    expect(chatHeader).not.toContain("ProjectFavicon");
  });

  it("keeps upstream's new-thread breadcrumb behaviour under the fork presentation", () => {
    // #4638 made the breadcrumb a new-thread button, and the resolution kept
    // the behaviour inside the fork fence — so a future sync treats these
    // lines as fork-owned and will not re-apply them from upstream. Without
    // this check, dropping the click silently loses an upstream feature with
    // CI green.
    expect(chatHeader).toContain("onClick={onNewThreadInProject}");
    expect(chatHeader).toMatch(/TooltipPopup side="top">New thread in \{activeProjectName\}/u);
  });

  it("maps the panel toggles to the design's half-square glyphs", () => {
    // Done in the shim, not at the call site, so upstream's imports stay
    // untouched — see phosphor-duotone-icons.
    expect(iconShim).toMatch(/PanelRightIcon\s*=\s*icon\("panel-right",\s*PhSquareHalf,/u);
    expect(iconShim).toMatch(/PanelBottomIcon\s*=\s*icon\("panel-bottom",\s*PhSquareHalfBottom,/u);
  });
});
