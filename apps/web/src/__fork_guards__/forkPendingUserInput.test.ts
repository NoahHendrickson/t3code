// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-pending-user-input`.
 *
 * The questions chrome is a presentational shadow over shared card logic in
 * custom/. A sync that deletes the override (or the strip attribute/CSS) silently
 * falls back to upstream's primary-tint options and number-key badges —
 * everything still compiles. Assert the outcomes the design depends on:
 * Questions progress, checkbox vs radio affordances, and the vessel-strip clear.
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
const override = readSibling("../overrides/components/chat/ComposerPendingUserInputPanel.tsx");
const hook = readSibling("../custom/useComposerPendingUserInputCard.ts");
const upstream = readSibling("../components/chat/ComposerPendingUserInputPanel.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");

describe("fork guard: fork-pending-user-input", () => {
  it("keeps a thin shadow that owns the Questions chrome", () => {
    expect(override).toContain('data-fork-pending-user-input="true"');
    expect(override).toContain(">Questions</");
    expect(override).toContain("answeredQuestionCount");
    expect(override).toContain("prompt.questions.length");
    expect(override).toContain("useComposerPendingUserInputCard");
    // Card interaction lives in custom/; the override must not re-own it.
    expect(override).not.toContain("autoAdvanceTimerRef");
    expect(override).not.toContain('addEventListener("keydown"');
    expect(hook).toContain("autoAdvanceTimerRef");
    expect(hook).toContain('addEventListener("keydown"');
    // Upstream still shows number-key badges and the question header chip;
    // the shadow must not regress to that layout.
    expect(upstream).toContain("shortcutKey");
    expect(override).not.toContain("shortcutKey");
    expect(upstream).toContain("activeQuestion.header");
    expect(override).not.toContain("activeQuestion.header");
  });

  it("uses checkboxes for multi-select and radios for single-select", () => {
    expect(override).toContain('role={multiSelect ? "checkbox" : "radio"}');
    expect(override).toContain('role={multiSelect ? "group" : "radiogroup"}');
    expect(override).toContain('multiSelect ? "Select one or more" : "Select one"');
    // Decorative control: square checkbox vs circular radio.
    expect(override).toContain("rounded-[4px]");
    expect(override).toContain("rounded-full");
    expect(override).toMatch(/multiSelect[\s\S]{0,200}rounded-\[4px\]/u);
  });

  it("clears the upstream muted strip via a fenced ChatComposer hook", () => {
    expect(chatComposer).toContain('data-fork-pending-user-input-strip=""');
    expect(chatComposer).toContain("fork:begin fork-pending-user-input");
    const stripRules = cssRules(theme).filter((rule) =>
      rule.selector.includes("[data-fork-pending-user-input-strip]"),
    );
    expect(stripRules.length).toBeGreaterThan(0);
    for (const rule of stripRules) {
      expect(rule.selector, `unscoped pending-user-input rule: ${rule.selector}`).toContain(MARKER);
    }
    expect(theme).toMatch(
      /\[data-fork-composer-surface\]\s*\[data-fork-pending-user-input-strip\]/u,
    );
    expect(theme).toMatch(
      /\[data-fork-pending-user-input-strip\][\s\S]{0,200}background:\s*transparent/u,
    );
    expect(theme).not.toContain(":has([data-fork-pending-user-input])");
  });

  it("marks pending Previous/Next so CSS can outline and center them", () => {
    expect(primaryActions).toContain('data-fork-pending-user-input-action="previous"');
    expect(primaryActions).toContain('data-fork-pending-user-input-action="advance"');
    const begin = primaryActions.match(/fork:begin fork-pending-user-input/gu) ?? [];
    const end = primaryActions.match(/fork:end fork-pending-user-input/gu) ?? [];
    expect(begin.length).toBeGreaterThan(0);
    expect(end.length).toBe(begin.length);

    const previous = cssRules(theme).find((rule) =>
      rule.selector.includes('[data-fork-pending-user-input-action="previous"]'),
    );
    expect(previous?.selector).toContain(MARKER);
    expect(previous?.body).toMatch(/background:\s*transparent/u);
    expect(theme).toMatch(/\[data-fork-pending-user-input-action\][\s\S]{0,200}height:\s*24px/u);
    expect(theme).toMatch(
      /\[data-fork-pending-user-input-action\][\s\S]{0,200}align-items:\s*center/u,
    );
  });
});
