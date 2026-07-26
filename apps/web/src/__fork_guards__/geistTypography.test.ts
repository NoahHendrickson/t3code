// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#geist-typography`.
 *
 * A rebase can succeed and still silently drop a customization: upstream
 * rewrites the surrounding code, git resolves "cleanly", and the fork hunk
 * evaporates with a green checkmark. These tests turn that into a red one.
 * Guards assert outcomes, not implementation details.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;

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

  it("declares the Geist stacks scoped to the fork marker", () => {
    const theme = readSibling("../theme.custom.css");
    const block = theme.slice(theme.indexOf(`${MARKER} {`));
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
    const theme = readSibling("../theme.custom.css");
    const monoStack = theme.slice(theme.indexOf("--fork-font-mono:"));
    expect(monoStack.indexOf('"Geist Mono Variable"')).toBeGreaterThanOrEqual(0);
    expect(monoStack.indexOf('"Geist Mono Variable"')).toBeLessThan(monoStack.indexOf('"SF Mono"'));
  });

  it("re-declares the selectors where upstream hardcodes a font literal", () => {
    // `body` and `pre, code` in index.css name the stacks literally instead of
    // reading the @theme tokens, so the variable override alone misses them.
    const theme = readSibling("../theme.custom.css");
    expect(theme).toContain(`${MARKER} body`);
    expect(theme).toContain(`${MARKER} :is(pre, code)`);
  });

  it("gives xterm the resolved --font-mono instead of a hardcoded stack", () => {
    const drawer = readSibling("../components/ThreadTerminalDrawer.tsx");
    expect(drawer).toContain('getPropertyValue("--font-mono")');
    expect(drawer).toContain("fontFamily: terminalFontFamily");
    // Quoted, so this matches a CSS family literal rather than any passing
    // mention of the name in prose.
    expect(drawer).not.toContain('"JetBrains Mono"');
    expect(drawer).not.toContain('"DM Sans"');
  });

  it("keeps the terminal's webfont re-measure hook", () => {
    // Nothing else fails if this goes: the terminal just opens with its column
    // count measured against the fallback face on a cold load.
    const drawer = readSibling("../components/ThreadTerminalDrawer.tsx");
    expect(drawer).toContain("document.fonts.load");
    expect(drawer).toContain("document.fonts.ready");
    expect(drawer).toContain("terminal.options.fontFamily = terminalFontFamily");
  });
});
