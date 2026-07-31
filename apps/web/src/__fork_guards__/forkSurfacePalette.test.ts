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
 * that the override reaches the sidebar panel at all, and that the panel/stage
 * relationship the intent names stays true. Upstream re-declares `--background`
 * / `--card` / `--border` and the whole `--sidebar-*` family on the panel
 * element itself, so a fork rule written only against `:root` is inert on
 * exactly the surface the design is about, and inert in a way that looks fine
 * in a diff. Most of what follows is therefore about the doubled selector —
 * plus a derived ordering check so a value tweak that silently inverts the
 * hierarchy cannot keep CI green.
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

function declarationHex(block: string, prop: string): string {
  const pattern = new RegExp(`${escapeRegExp(prop)}:\\s*(#[0-9a-f]{6})`, "iu");
  const match = pattern.exec(block);
  expect(match, `no ${prop} hex in block`).not.toBeNull();
  return (match?.[1] ?? "").toLowerCase();
}

function parseHex(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex.trim());
  expect(match, `expected #rrggbb, got ${hex}`).not.toBeNull();
  const n = Number.parseInt(match?.[1] ?? "0", 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** CIE L* from relative luminance (D65 / sRGB). */
function lStar(hex: string): number {
  const y = relativeLuminance(hex);
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
}

function hexesIn(...blocks: readonly string[]): string[] {
  const found = new Set<string>();
  for (const block of blocks) {
    for (const match of block.matchAll(/#[0-9a-f]{6}/giu)) {
      found.add(match[0].toLowerCase());
    }
  }
  return [...found];
}

const theme = readSibling("../theme.custom.css");
const indexHtml = readSibling("../../index.html");

const STAGE = [`${MARKER}.dark`];
const PANEL = [`${MARKER}.dark`, '[data-sidebar-version="v2"]'];

describe("fork guard: fork-surface-palette", () => {
  it("repaints the workspace stage off black", () => {
    // Upstream's dark base is near-black / #161616 pre-paint. Losing this
    // block drops the stage onto that base and leaves the #1e1e1e panel as the
    // only lifted surface — chrome without a distinct work plane under it.
    expect(blockFor(theme, STAGE)).toContain("--background: #191919");
  });

  it("keeps the panel above the stage, as the intent names", () => {
    // Intent: fork-surface-palette. Assert the ordering, not only the
    // constants — a value tweak is fine, silently inverting the hierarchy is
    // not. ΔL* > 2 is "perceptible on a large flat field" for this chrome.
    const stage = declarationHex(blockFor(theme, STAGE), "--background");
    const panel = declarationHex(blockFor(theme, PANEL), "--background");
    expect(relativeLuminance(panel)).toBeGreaterThan(relativeLuminance(stage));
    expect(Math.abs(lStar(panel) - lStar(stage))).toBeGreaterThan(2);
  });

  it("keeps the stage near upstream's pre-paint colour", () => {
    // apps/web/index.html hardcodes #161616 for dark theme-color / body /
    // DARK_BACKGROUND. The stage must stay close enough that the load flash
    // and overscroll band do not seam against the hydrated shell.
    const prePaint = "#161616";
    expect(indexHtml).toContain(prePaint);
    expect(indexHtml).toMatch(/DARK_BACKGROUND\s*=\s*"#161616"/u);
    const stage = declarationHex(blockFor(theme, STAGE), "--background");
    expect(Math.abs(lStar(stage) - lStar(prePaint))).toBeLessThan(3);
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

  it("keeps card muted below chrome muted, and both below foreground", () => {
    // Chrome rows and project headers read --sidebar-muted-foreground (then
    // tint /80, /70); the cards read --muted-foreground. Cards need a
    // dimmer value than chrome: a receded title is text-muted-foreground
    // against a text-foreground forward one, and colour alone carries the
    // distinction. An earlier revision lifted both to #e0e0e0 and receded
    // titles landed ~1.19:1 from --foreground — not visible. Upstream's
    // #a3a3a3 kept the gap but read soft on #1e1e1e, so cards land at
    // #c0c0c0. Both hexes are pinned exact (a brighter-than floor let
    // #f1f3f7 pass, which is the failure mode), and the ordering check
    // catches a tweak that inverts the hierarchy.
    const panel = blockFor(theme, PANEL);
    const cardMuted = declarationHex(panel, "--muted-foreground");
    const chromeMuted = declarationHex(panel, "--sidebar-muted-foreground");
    expect(cardMuted).toBe("#c0c0c0");
    expect(chromeMuted).toBe("#e0e0e0");
    expect(relativeLuminance(chromeMuted)).toBeGreaterThan(relativeLuminance(cardMuted));
    expect(relativeLuminance("#f1f3f7")).toBeGreaterThan(relativeLuminance(chromeMuted));
  });

  it("clears the grain that would compound drift onto flat surfaces", () => {
    // Kept for the flat-opaque reason alone. Upstream's 0.035 noise was
    // calibrated against #000; on these surfaces any useful opacity leaves
    // unspecified drift on every chrome fill this palette freezes.
    expect(blockFor(theme, STAGE)).toContain("--surface-grain: none");
  });

  it("leaves light mode on upstream's palette", () => {
    // The design is dark-only. A fork surface value that escaped its `.dark`
    // scope would paint a #1e1e1e panel into the light theme.
    //
    // Hexes are collected from the stage and panel blocks rather than
    // hand-listed: editing one and forgetting the other left the safety net
    // silently backing up a palette it no longer matched.
    const surfaceHexes = hexesIn(blockFor(theme, STAGE), blockFor(theme, PANEL));
    expect(surfaceHexes.length).toBeGreaterThan(0);
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
