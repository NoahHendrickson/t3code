// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-surface-palette`.
 *
 * A rebase can succeed and still silently drop a customization: upstream
 * rewrites the surrounding code, git resolves "cleanly", and the fork hunk
 * evaporates with a green checkmark. These tests turn that into a red one.
 *
 * The load-bearing invariant here is not "the hexes are these hexes" — it is
 * that the override reaches the sidebar panel at all. Upstream re-declares
 * `--background` / `--card` / `--border` and the whole `--sidebar-*` family on
 * the panel element itself, so a fork rule written only against `:root` is
 * inert on exactly the surface the design is about, and inert in a way that
 * looks fine in a diff. Most of what follows is therefore about the doubled
 * selector.
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

/** A `{ … }` declaration block by its selector, so lost scoping is detectable.
    Whitespace-tolerant across the selector: the formatter decides where a long
    compound selector wraps. */
function blockFor(css: string, selectorParts: readonly string[]): string {
  const pattern = new RegExp(
    `${selectorParts.map(escapeRegExp).join("\\s*")}\\s*\\{([^}]*)\\}`,
    "u",
  );
  const match = pattern.exec(css);
  expect(match, `no block found for selector ${selectorParts.join(" ")}`).not.toBeNull();
  return match?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const theme = readSibling("../theme.custom.css");

const STAGE = [`${MARKER}.dark`];
const PANEL = [`${MARKER}.dark`, '[data-sidebar-version="v2"]'];

describe("fork guard: fork-surface-palette", () => {
  it("repaints the workspace stage off black", () => {
    // Upstream's dark base is neutral-950. If this block goes, the sidebar
    // stays #1e1e1e against a near-black stage and the panel reads as a hole
    // rather than as chrome.
    expect(blockFor(theme, STAGE)).toContain("--background: #212121");
  });

  it("repaints the sidebar v2 panel through its own selector, not just :root", () => {
    // The whole point of the entry. A panel-scoped upstream declaration wins on
    // the panel element no matter what :root says, so losing this compound
    // selector silently reverts the sidebar alone.
    const panel = blockFor(theme, PANEL);
    expect(panel).toContain("--background: #1e1e1e");
    expect(panel).toContain("--sidebar: #1e1e1e");
    expect(panel).toContain("--card: #1e1e1e");
  });

  it("keeps the stage-channel backdrop ramping to the panel's own surface", () => {
    // Upstream's own comment: the header art seams if it fades to anything but
    // the surface it sits on. It defaults to --card, which is correct only
    // because the panel block above also moves --card.
    expect(blockFor(theme, PANEL)).toContain("--sidebar-stage-fade: #1e1e1e");
  });

  it("states the row fills as opaque values", () => {
    // Not a style preference: these are composites frozen against #1e1e1e. An
    // alpha here would re-derive against whatever surface it lands on, which is
    // the drift this fork flattened them to avoid.
    const panel = blockFor(theme, PANEL);
    expect(panel).toContain("--sidebar-row-hover: #262626");
    expect(panel).toContain("--sidebar-row-active: #2a2a2a");
    expect(panel).toContain("--sidebar-row-selected: #2a2a2a");
    expect(panel).not.toMatch(
      /--sidebar-row-(?:hover|active|selected):[^;]*(?:color-mix|--alpha)/u,
    );
  });

  it("lifts the panel's control surfaces above it rather than below", () => {
    // Upstream's panel muted/accent are #0a0a0a and #191a1d — lifts off black,
    // and both darker than a #1e1e1e panel. Inheriting them would carve every
    // chip and hover into the surface instead of raising it.
    const panel = blockFor(theme, PANEL);
    expect(panel).toContain("--muted: #262626");
    expect(panel).toContain("--accent: #262626");
    expect(panel).toContain("--sidebar-control-surface: #303030");
  });

  it("clears the grain that would erase the panel/stage separation", () => {
    // Measured, not assumed: upstream's 0.035 noise lifts the sidebar panel
    // from #1e1e1e to ~#212121 — the stage's colour — because the chat content
    // paints over the workspace copy of the grain but nothing paints over the
    // sidebar's. Losing this line silently collapses the three-level separation
    // every other value in this block is built around.
    expect(blockFor(theme, STAGE)).toContain("--surface-grain: none");
  });

  it("leaves light mode on upstream's palette", () => {
    // The design is dark-only. A fork surface value that escaped its `.dark`
    // scope would paint a #1e1e1e panel into the light theme.
    //
    // Every marker-rooted block is checked, not only the one whose selector is
    // exactly the bare marker: a hex leaked into
    // `:root[marker] .some-descendant { }` is just as wrong and the narrower
    // form missed it.
    const surfaceHexes = ["#212121", "#1e1e1e", "#2d2e2e", "#2a2a2a", "#262626"];
    const lightRules = cssRules(theme).filter(
      (rule) => rule.selector.includes(MARKER) && !rule.selector.includes(".dark"),
    );
    expect(lightRules.length).toBeGreaterThan(0);
    for (const rule of lightRules) {
      for (const hex of surfaceHexes) {
        expect(
          rule.body,
          `${hex} declared outside a .dark scope in: ${rule.selector}`,
        ).not.toContain(hex);
      }
    }
  });
});
