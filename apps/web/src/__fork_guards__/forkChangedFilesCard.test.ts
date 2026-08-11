// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-changed-files-card`.
 *
 * The restyle is CSS-only against upstream data attributes. Drop either the
 * attribute or the fork-scoped --card rule and Cool Dark silently falls back
 * to translucent bg-input/32 — the card compiles, ships, and looks wrong.
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
const changedFiles = readSibling("../components/chat/ChangedFilesTree.tsx");

describe("fork guard: fork-changed-files-card", () => {
  it("keeps the upstream data attributes the stylesheet hangs off", () => {
    expect(changedFiles).toContain("data-changed-files-state=");
    expect(changedFiles).toContain('data-changed-files-header=""');
    // Upstream still ships the translucent wash the fork overrides.
    expect(changedFiles).toContain("dark:bg-input/32");
    // Outline actions are Tooltip triggers — CSS must select `button`, not
    // data-slot="button" (TooltipTrigger wins the slot).
    expect(changedFiles).toContain("TooltipTrigger");
  });

  it("paints the card from --card under the fork dark marker", () => {
    const card = cssRules(theme).find(
      (rule) =>
        rule.selector.includes("[data-changed-files-state]") &&
        !rule.selector.includes("button") &&
        !rule.selector.includes("span.truncate") &&
        rule.body.includes("background"),
    );
    expect(card?.selector).toContain(MARKER);
    expect(card?.selector).toContain(".dark");
    expect(card?.body).toMatch(/background:\s*var\(--card\)/u);
    expect(card?.body).toMatch(/border-radius:\s*8px/u);
    expect(card?.body).toMatch(/border-color:\s*var\(--fork-composer-border\)/u);
  });

  it("lifts path labels outside the header and outlines header action buttons", () => {
    const label = cssRules(theme).find(
      (rule) =>
        rule.selector.includes("[data-changed-files-state]") &&
        rule.selector.includes("span.truncate") &&
        rule.selector.includes(":not([data-changed-files-header])"),
    );
    expect(label?.selector).toContain(MARKER);
    expect(label?.body).toMatch(/color:\s*var\(--foreground\)/u);

    const button = cssRules(theme).find(
      (rule) =>
        rule.selector.includes("[data-changed-files-header] > div button") &&
        rule.body.includes("background: transparent"),
    );
    expect(button?.selector).toContain(MARKER);
    expect(button?.selector).toContain(".dark");
    // Must not key off data-slot="button" — TooltipTrigger overwrites it.
    expect(theme).not.toMatch(/\[data-changed-files-state\][^{]*\[data-slot="button"\]/u);
  });
});
