// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-composer-banner-surface`.
 *
 * Composer banners paint the composer fill under the composer hairline
 * instead of upstream's severity tint. The rule works by re-pointing the
 * `--chat-composer-attached-*` variables ComposerBanner's Surface and Peek
 * both read; a sync that renames those variables, the surface attribute or
 * the peek slot, or paints the peek's severity edge some other way, quietly
 * brings the blue info slab back — everything still compiles.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const flat = (selector: string) => selector.replace(/\s+/gu, " ");

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const HOOKS = ':is([data-composer-banner-surface], [data-slot="composer-banner-peek"])';
const theme = readSibling("../theme.custom.css");
const banner = readSibling("../components/chat/ComposerBanner.tsx");
const rules = cssRules(theme);

/** Source of one top-level `function Name(` in ComposerBanner.tsx. */
function componentSource(name: string): string {
  const start = banner.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = banner.indexOf("\nfunction ", start + 1);
  return banner.slice(start, end < 0 ? undefined : end);
}

describe("fork guard: fork-composer-banner-surface", () => {
  it("re-points every banner's outline, tint and edge at the composer hairline", () => {
    const rule = rules.find(
      (candidate) =>
        flat(candidate.selector).endsWith(HOOKS) &&
        candidate.body.includes("--chat-composer-attached-outline"),
    );
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.selector).not.toContain(".dark");
    expect(rule?.body).toMatch(
      /--chat-composer-attached-outline:\s*var\(--fork-composer-border\)/u,
    );
    expect(rule?.body).toMatch(/--chat-composer-attached-tint:\s*transparent/u);
    expect(rule?.body).toMatch(/border-color:\s*var\(--fork-composer-border\)/u);
  });

  it("fills dark banners and the peek cap with the composer fill, keeping the blur", () => {
    const rule = rules.find(
      (candidate) =>
        flat(candidate.selector).endsWith(HOOKS) &&
        candidate.body.includes("--chat-composer-attached-surface"),
    );
    expect(rule?.selector).toContain(`${MARKER}.dark`);
    expect(rule?.body).toMatch(/--chat-composer-attached-surface:\s*var\(--fork-composer-bg\)/u);
    expect(rule?.body).not.toContain("backdrop-filter");
  });

  it("targets the attribute, slot and variables upstream's Surface still uses", () => {
    const surface = componentSource("Surface");
    expect(surface).toContain("data-composer-banner-surface={placement}");
    expect(surface).toContain("before:border-(--chat-composer-attached-outline)");
    expect(surface).toContain("var(--chat-composer-attached-tint)");
    expect(surface).toContain("var(--chat-composer-attached-surface)_var(--glass-opacity)");
    // The severity tints the rule overrides are still expressed through the
    // same variables; a sync that paints them another way slips past this rule.
    for (const variant of ["error", "info", "success", "warning"]) {
      expect(banner, variant).toMatch(
        new RegExp(`${variant}:\\s*"\\[--chat-composer-attached-outline:color-mix\\(`, "u"),
      );
    }
  });

  it("targets the slot, fill variable and severity borders upstream's Peek still uses", () => {
    // The peek has no surface attribute but reads the same fill variable, so
    // the remap lists its slot; its severity edge is a border utility, which
    // is why the rule also sets border-color rather than only the variable.
    const peek = componentSource("Peek");
    expect(peek).toContain('data-slot="composer-banner-peek"');
    expect(peek).toContain("var(--chat-composer-attached-surface)_var(--glass-opacity)");
    expect(peek).toContain("peekBorder[variant]");
    for (const [variant, token] of [
      ["error", "destructive"],
      ["info", "info"],
      ["success", "success"],
      ["warning", "warning"],
    ] as const) {
      expect(banner, variant).toMatch(new RegExp(`${variant}:\\s*"border-${token}/\\d+"`, "u"));
    }
  });
});
