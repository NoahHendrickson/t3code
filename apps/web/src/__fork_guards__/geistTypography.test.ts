// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#geist-typography`.
 *
 * A rebase can succeed and still silently drop a customization: upstream
 * rewrites the surrounding code, git resolves "cleanly", and the fork hunk
 * evaporates with a green checkmark. These tests turn that into a red one.
 * Guards assert outcomes, not implementation details.
 *
 * The terminal half is exercised as behaviour against the fork-owned module
 * rather than grepped for inside the drawer: string assertions on an upstream
 * file pin the code's *placement* instead of its effect, and would block moving
 * it. Only the call site is checked textually, because a rebase quietly
 * dropping it is precisely the failure this file exists to catch.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { FORK_TERMINAL_FONT_FALLBACK, terminalFontFamilyFrom } from "../custom/terminalFont";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;

/** The `MARKER { … }` declaration block alone, so lost scoping is detectable. */
function markerBlock(css: string): string {
  const start = css.indexOf(`${MARKER} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe("fork guard: geist-typography", () => {
  it("bundles both Geist faces as dependencies", () => {
    const manifest = JSON.parse(readSibling("../../package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@fontsource-variable/geist"]).toBeDefined();
    expect(manifest.dependencies?.["@fontsource-variable/geist-mono"]).toBeDefined();
  });

  it("loads both Geist faces from the fork's own theme layer", () => {
    const theme = readSibling("../theme.custom.css");
    expect(theme).toContain('@import "@fontsource-variable/geist/index.css"');
    expect(theme).toContain('@import "@fontsource-variable/geist-mono/index.css"');
  });

  it("declares the Geist stacks inside the marker-scoped block", () => {
    // Bounded to the block: a declaration that lost its scoping and moved to a
    // bare `:root { }` has to fail here, which is the point of the test.
    const block = markerBlock(readSibling("../theme.custom.css"));
    expect(block).toContain("--fork-font-sans:");
    expect(block).toContain('"Geist Variable"');
    expect(block).toContain("--fork-font-mono:");
    expect(block).toContain('"Geist Mono Variable"');
  });

  it("keeps upstream's @theme tokens reading through the fork indirection", () => {
    // Upstream declares the font tokens in a non-inline `@theme` block (so
    // Settings → Appearance can override them at runtime); the fork routes
    // both through `--fork-font-*` there. Lose this indirection and every
    // font utility silently reverts to upstream's system stacks while the
    // fork stylesheet's `--fork-font-*` values go unread.
    // Whitespace-tolerant: the formatter decides whether these wrap.
    const upstream = readSibling("../index.css");
    expect(upstream).toMatch(/--font-sans:\s*var\(\s*--fork-font-sans\s*,/u);
    expect(upstream).toMatch(/--font-mono:\s*var\(\s*--fork-font-mono\s*,/u);
  });

  it("keeps Geist Mono ahead of SF Mono, inverting upstream's order", () => {
    // Upstream lists SF Mono first, so a bundled mono webfont never renders on
    // macOS. Lose this ordering and Geist Mono silently stops appearing.
    const block = markerBlock(readSibling("../theme.custom.css"));
    const monoStack = block.slice(block.indexOf("--fork-font-mono:"));
    const geist = monoStack.indexOf('"Geist Mono Variable"');
    const sfMono = monoStack.indexOf('"SF Mono"');
    expect(geist).toBeGreaterThanOrEqual(0);
    expect(sfMono).toBeGreaterThan(geist);
  });

  it("keeps the JetBrains Mono fallback named in both stacks", () => {
    // Kept from the era when a Fontsource JetBrains Mono face was bundled
    // (upstream dropped its webfonts in the v0.0.32 cycle; the fork followed):
    // the name still rescues a Linux user with a locally installed JetBrains
    // Mono before the stack degrades to Liberation Mono or the generic.
    const block = markerBlock(readSibling("../theme.custom.css"));
    expect(block.slice(block.indexOf("--fork-font-mono:"))).toContain('"JetBrains Mono"');
    expect(FORK_TERMINAL_FONT_FALLBACK).toContain('"JetBrains Mono"');
  });

  it("keeps the terminal wired to the fork-owned font module", () => {
    // The ghostty surface takes its font as a creation option and handles the
    // webfont re-measure itself. An unset Settings → Appearance preference
    // must resolve to the fork's Geist Mono stack, not the surface's built-in
    // face — that default lives in terminalFontOptions' empty-family branch.
    // Lose it and the terminal silently reverts to upstream's default while
    // the rest of the app is on Geist.
    const drawer = readSibling("../components/ThreadTerminalDrawer.tsx");
    expect(drawer).toMatch(/return\s*\{\s*family:\s*FORK_TERMINAL_FONT_FALLBACK\s*,\s*size\s*\}/u);
  });

  it("keeps upstream's cold-load re-measure, which the fork's shim was deleted for", () => {
    // The xterm-era refit shim was removed because the surface waits on
    // document.fonts before measuring the cell grid and re-measures on
    // loadingdone. If a sync drops either, Geist Mono measures at fallback
    // advances with the PTY wrapping to a column count nobody re-derived —
    // silently. This is the tripwire for that upstream dependency.
    const surface = readSibling("../terminal/ghostty/surface.ts");
    expect(surface).toContain("document.fonts.load(");
    expect(surface).toContain('"loadingdone"');
  });

  describe("resolved stack", () => {
    it("falls back to a stack that still leads with Geist Mono", () => {
      // The degraded path must not land the terminal on SF Mono while the rest
      // of the app is on Geist — that split is what the indirection prevents.
      expect(terminalFontFamilyFrom("   ")).toBe(FORK_TERMINAL_FONT_FALLBACK);
      expect(FORK_TERMINAL_FONT_FALLBACK.startsWith('"Geist Mono Variable"')).toBe(true);
    });

    it("strips the trailing generic so the surface's glyph fallbacks stay reachable", () => {
      // The surface appends the Nerd Font fallbacks after whatever family it
      // is given; a `monospace` generic mid-list would sit ahead of them, a
      // stack shape upstream never produces. The generic returns at the true
      // tail via the surface's own fallbacks.
      expect(terminalFontFamilyFrom(' "Geist Mono Variable", monospace ')).toBe(
        '"Geist Mono Variable"',
      );
      expect(FORK_TERMINAL_FONT_FALLBACK.endsWith("monospace")).toBe(false);
    });

    it("prefers the cascade-resolved value when present", () => {
      expect(terminalFontFamilyFrom(' "Geist Mono Variable", "SF Mono" ')).toBe(
        '"Geist Mono Variable", "SF Mono"',
      );
    });

    it("treats a generics-only stack as empty and falls back", () => {
      expect(terminalFontFamilyFrom("monospace")).toBe(FORK_TERMINAL_FONT_FALLBACK);
    });
  });
});
