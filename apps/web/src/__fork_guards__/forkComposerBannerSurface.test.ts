// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-composer-banner-surface`.
 *
 * Composer banners paint the composer fill under the composer hairline
 * instead of upstream's severity tint. The rule works by re-pointing the
 * `--chat-composer-attached-*` variables ComposerBanner's Surface reads; a
 * sync that renames those variables, the surface attribute or the peek slot
 * quietly brings the blue info slab back — everything still compiles.
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
const banner = readSibling("../components/chat/ComposerBanner.tsx");
const rules = cssRules(theme);

describe("fork guard: fork-composer-banner-surface", () => {
  it("re-points every banner's outline and tint at the composer hairline", () => {
    const rule = rules.find(
      (candidate) =>
        candidate.selector.includes("[data-composer-banner-surface]") &&
        candidate.body.includes("--chat-composer-attached-outline"),
    );
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.selector).not.toContain(".dark");
    expect(rule?.body).toMatch(
      /--chat-composer-attached-outline:\s*var\(--fork-composer-border\)/u,
    );
    expect(rule?.body).toMatch(/--chat-composer-attached-tint:\s*transparent/u);
  });

  it("fills dark banners with the composer fill, keeping the frosted backdrop", () => {
    const rule = rules.find(
      (candidate) =>
        candidate.selector.includes("[data-composer-banner-surface]") &&
        candidate.body.includes("--chat-composer-attached-surface"),
    );
    expect(rule?.selector).toContain(`${MARKER}.dark`);
    expect(rule?.body).toMatch(/--chat-composer-attached-surface:\s*var\(--fork-composer-bg\)/u);
    expect(rule?.body).not.toContain("backdrop-filter");
  });

  it("gives the collapsed stack's peek cap the same hairline", () => {
    const rule = rules.find((candidate) =>
      candidate.selector.includes('[data-slot="composer-banner-peek"]'),
    );
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.body).toMatch(/border-color:\s*var\(--fork-composer-border\)/u);
  });

  it("targets the attribute, slot and variables upstream's Surface still uses", () => {
    expect(banner).toContain("data-composer-banner-surface={placement}");
    expect(banner).toContain('data-slot="composer-banner-peek"');
    expect(banner).toContain("before:border-(--chat-composer-attached-outline)");
    expect(banner).toContain("var(--chat-composer-attached-tint)");
    expect(banner).toContain("var(--chat-composer-attached-surface)_var(--glass-opacity)");
    // The severity tints the rule overrides are still expressed through the
    // same variables; a sync that paints them another way slips past this rule.
    for (const variant of ["error", "info", "success", "warning"]) {
      expect(banner, variant).toMatch(
        new RegExp(`${variant}:\\s*"\\[--chat-composer-attached-outline:color-mix\\(`, "u"),
      );
    }
  });
});
