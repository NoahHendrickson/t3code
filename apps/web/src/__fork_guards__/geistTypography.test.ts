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
 * it. Only the two call sites are checked textually, because a rebase quietly
 * dropping them is precisely the failure this file exists to catch.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import {
  FORK_TERMINAL_FONT_FALLBACK,
  firstFontFamily,
  refitTerminalWhenFontsReady,
  terminalFontFamilyFrom,
  type ForkTerminalFontTarget,
} from "../custom/terminalFont";

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

interface TerminalProbe {
  readonly target: ForkTerminalFontTarget;
  /** Every value written to `options.fontFamily`, in order. */
  readonly writes: string[];
  readonly scrolls: () => number;
}

function terminalProbe(fontFamily: string, atBottom = true): TerminalProbe {
  const writes: string[] = [];
  let current = fontFamily;
  let scrolls = 0;
  return {
    writes,
    scrolls: () => scrolls,
    target: {
      cols: 80,
      rows: 24,
      options: {
        get fontFamily() {
          return current;
        },
        set fontFamily(value: string) {
          current = value;
          writes.push(value);
        },
      },
      buffer: { active: { viewportY: atBottom ? 5 : 0, baseY: 5 } },
      scrollToBottom: () => {
        scrolls += 1;
      },
    },
  };
}

function fakeFonts(loadResult: Promise<FontFace[]> = Promise.resolve([])) {
  const requested: string[] = [];
  const fonts = {
    load: (font: string) => {
      requested.push(font);
      return loadResult;
    },
    ready: Promise.resolve(),
  } as unknown as Pick<FontFaceSet, "load" | "ready">;
  return { requested, fonts };
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
    // `@theme inline` bakes font values literally into `.font-sans` /
    // `.font-mono` and their variants, so a compiled utility can never see a
    // variable overridden in a later stylesheet. Lose this indirection and
    // every `font-mono`-classed element silently reverts to SF Mono while the
    // rest of the app stays on Geist.
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

  it("keeps upstream's bundled mono fallback in both stacks", () => {
    // JetBrains Mono is upstream's only *bundled* mono face. Dropping it
    // regresses a Linux user with no SF Mono and no Consolas to generic
    // monospace whenever the Geist Mono fetch fails.
    const block = markerBlock(readSibling("../theme.custom.css"));
    expect(block.slice(block.indexOf("--fork-font-mono:"))).toContain('"JetBrains Mono"');
    expect(FORK_TERMINAL_FONT_FALLBACK).toContain('"JetBrains Mono"');
  });

  it("keeps the terminal wired to the fork-owned font module", () => {
    const drawer = readSibling("../components/ThreadTerminalDrawer.tsx");
    expect(drawer).toContain("fontFamily: resolveTerminalFontFamily(mount)");
    expect(drawer).toContain("refitTerminalWhenFontsReady({");
  });

  describe("resolved stack", () => {
    it("falls back to a stack that still leads with Geist Mono", () => {
      // The degraded path must not land the terminal on SF Mono while the rest
      // of the app is on Geist — that split is what the indirection prevents.
      expect(terminalFontFamilyFrom("   ")).toBe(FORK_TERMINAL_FONT_FALLBACK);
      expect(FORK_TERMINAL_FONT_FALLBACK.startsWith('"Geist Mono Variable"')).toBe(true);
    });

    it("prefers the cascade-resolved value when present", () => {
      expect(terminalFontFamilyFrom(' "Geist Mono Variable", monospace ')).toBe(
        '"Geist Mono Variable", monospace',
      );
    });

    it("takes the first family for the font-load probe", () => {
      expect(firstFontFamily('"Geist Mono Variable", "SF Mono", monospace')).toBe(
        '"Geist Mono Variable"',
      );
      expect(firstFontFamily("")).toBeNull();
    });
  });

  describe("cold-load re-measure", () => {
    it("probes the resolved family rather than a hardcoded one", async () => {
      // Hardcoding goes stale on a face swap, and would fetch Geist Mono even in
      // an unmarked build — breaking the fork's own scoping invariant.
      const probe = terminalProbe('"Geist Mono Variable", monospace');
      const { requested, fonts } = fakeFonts();
      await refitTerminalWhenFontsReady({
        terminal: probe.target,
        isCurrent: () => true,
        fit: () => {},
        resize: () => {},
        fonts,
        scheduleFrame: (callback) => callback(),
      });
      expect(requested).toEqual(['12px "Geist Mono Variable"']);
    });

    it("re-applies the family so xterm re-measures, then tells the PTY", async () => {
      // xterm's option setter drops equal writes, so the value has to change
      // before it changes back. And nothing in the drawer subscribes to
      // onResize: without the resize call the PTY keeps wrapping to the stale
      // width while the local grid is corrected.
      const probe = terminalProbe('"Geist Mono Variable", monospace');
      const { fonts } = fakeFonts();
      const resized: Array<[number, number]> = [];
      let fitted = 0;

      await refitTerminalWhenFontsReady({
        terminal: probe.target,
        isCurrent: () => true,
        fit: () => {
          fitted += 1;
        },
        resize: (cols, rows) => resized.push([cols, rows]),
        fonts,
        scheduleFrame: (callback) => callback(),
      });

      expect(probe.writes.length).toBe(2);
      expect(probe.writes[0]).not.toBe(probe.writes[1]);
      expect(probe.writes[1]).toBe('"Geist Mono Variable", monospace');
      expect(fitted).toBe(1);
      expect(resized).toEqual([[80, 24]]);
      expect(probe.scrolls()).toBe(1);
    });

    it("holds the viewport when it was not pinned to the bottom", async () => {
      const probe = terminalProbe('"Geist Mono Variable", monospace', false);
      const { fonts } = fakeFonts();
      await refitTerminalWhenFontsReady({
        terminal: probe.target,
        isCurrent: () => true,
        fit: () => {},
        resize: () => {},
        fonts,
        scheduleFrame: (callback) => callback(),
      });
      expect(probe.scrolls()).toBe(0);
    });

    it("leaves a torn-down terminal alone", async () => {
      const probe = terminalProbe('"Geist Mono Variable", monospace');
      const { fonts } = fakeFonts();
      const resized: Array<[number, number]> = [];
      await refitTerminalWhenFontsReady({
        terminal: probe.target,
        isCurrent: () => false,
        fit: () => {},
        resize: (cols, rows) => resized.push([cols, rows]),
        fonts,
        scheduleFrame: (callback) => callback(),
      });
      expect(probe.writes).toEqual([]);
      expect(resized).toEqual([]);
    });

    it("survives a webfont that fails to load", async () => {
      // FontFaceSet.load() rejects if a matching face fails. That must not
      // surface as an unhandled rejection, and the re-fit should still run —
      // the fallback metrics are simply the ones that stay correct.
      const probe = terminalProbe('"Geist Mono Variable", monospace');
      const { fonts } = fakeFonts(Promise.reject(new Error("404")));
      let fitted = 0;
      await refitTerminalWhenFontsReady({
        terminal: probe.target,
        isCurrent: () => true,
        fit: () => {
          fitted += 1;
        },
        resize: () => {},
        fonts,
        scheduleFrame: (callback) => callback(),
      });
      expect(fitted).toBe(1);
    });
  });
});
