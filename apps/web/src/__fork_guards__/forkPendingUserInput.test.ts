// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-pending-user-input`.
 *
 * The questions chrome is a presentational shadow over shared card logic in
 * custom/. A sync that deletes the override silently falls back to upstream's
 * primary-tint options and number-key badges — everything still compiles.
 * Assert the outcomes the design depends on: Questions progress, checkbox vs
 * radio affordances, and the outline Previous/Next chrome.
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

describe("fork guard: fork-pending-user-input", () => {
  it("keeps a thin shadow that owns the Questions chrome", () => {
    expect(override).toContain('data-fork-pending-user-input="true"');
    expect(override).toContain(">Questions</");
    expect(override).toContain("questionIndex + 1");
    expect(override).toContain("prompt.questions.length > 1");
    expect(override).toContain("useComposerPendingUserInputCard");
    // Theme-adaptive selection — not white-alpha that disappears in Light.
    expect(override).toContain("border-foreground/24");
    expect(override).toContain("bg-foreground/8");
    expect(override).not.toContain("border-white/");
    expect(override).not.toContain("bg-white/");
    // Card interaction lives in custom/; the override must not re-own it.
    expect(override).not.toContain("autoAdvanceTimerRef");
    expect(override).not.toContain('addEventListener("keydown"');
    expect(hook).toContain("autoAdvanceTimerRef");
    expect(hook).toContain('addEventListener("keydown"');
    // Number keys stay wired; announce via aria-keyshortcuts without kbd badges.
    expect(override).toContain("aria-keyshortcuts");
    expect(override).not.toContain("shortcutKey");
    expect(upstream).toContain("shortcutKey");
    expect(upstream).toContain("activeQuestion.header");
    expect(override).not.toContain("activeQuestion.header");
  });

  it("uses checkboxes for multi-select and radios for single-select", () => {
    expect(override).toContain('role={multiSelect ? "checkbox" : "radio"}');
    expect(override).toContain('role={multiSelect ? "group" : "radiogroup"}');
    expect(override).toContain('multiSelect ? "Select one or more" : "Select one"');
    expect(override).toContain("border-foreground/50");
    expect(override).toContain('multiSelect ? "rounded-[4px]" : "rounded-full"');
  });

  it("marks pending Previous/Next and dark-scopes the true-outline chrome", () => {
    expect(primaryActions).toContain('data-fork-pending-user-input-action="previous"');
    expect(primaryActions).toContain('data-fork-pending-user-input-action="advance"');
    const begin = primaryActions.match(/fork:begin fork-pending-user-input/gu) ?? [];
    const end = primaryActions.match(/fork:end fork-pending-user-input/gu) ?? [];
    expect(begin.length).toBeGreaterThan(0);
    expect(end.length).toBe(begin.length);

    expect(theme).toMatch(/\[data-fork-pending-user-input-action\][\s\S]{0,200}height:\s*24px/u);
    // Compact Previous stays square.
    expect(theme).toMatch(
      /\[data-fork-pending-user-input-action="previous"\]\[aria-label="Previous question"\][\s\S]{0,120}width:\s*24px/u,
    );

    const outline = cssRules(theme).find(
      (rule) =>
        rule.selector.includes('[data-fork-pending-user-input-action="previous"]') &&
        rule.body.includes("background: transparent"),
    );
    expect(outline?.selector).toContain(MARKER);
    expect(outline?.selector).toContain(".dark");
    expect(outline?.selector).toContain("[data-changed-files-header]");
    expect(outline?.body).toMatch(/border-color:\s*var\(--fork-outline-border\)/u);
  });

  it("stacks the Questions card onto the prompt surface (Figma 322:6316)", () => {
    const rules = cssRules(theme);
    const flat = (selector: string) => selector.replace(/\s+/gu, " ");
    const drawerKey = "[data-chat-composer-top-drawer]:has(> [data-fork-pending-user-input])";

    // The full-width, flush, un-frosted geometry this card introduced is
    // shared with every other banner now and is asserted by
    // forkComposerBannerSurface.test.ts against the banner hooks. What is
    // still specific to this panel: the drawer hands its padding to the panel,
    // which paints the card itself.
    const drawer = rules.find((rule) => flat(rule.selector).endsWith(drawerKey));
    expect(drawer?.selector).toContain(MARKER);
    expect(drawer?.selector).toContain(".dark");
    // Root carries p-1 on every side plus the overlap tuck below; all of it goes.
    expect(drawer?.body).toMatch(/padding:\s*0/u);

    // Composer fill and hairline, open at the bottom, 8px top corners.
    const card = rules.find(
      (rule) =>
        flat(rule.selector).endsWith(
          "[data-chat-composer-top-drawer] > [data-fork-pending-user-input]",
        ) && rule.body.includes("border-radius"),
    );
    expect(card?.selector).toContain(".dark");
    expect(card?.body).toMatch(/border:\s*1px solid var\(--fork-composer-border\)/u);
    expect(card?.body).toMatch(/border-bottom:\s*0/u);
    expect(card?.body).toMatch(
      /border-radius:\s*var\(--fork-composer-radius\) var\(--fork-composer-radius\) 0 0/u,
    );
    expect(card?.body).toMatch(/background:\s*var\(--fork-composer-bg\)/u);
    // The card's ring follows the prompt's focus recolour so the stack keeps
    // one ring. The shared rule recolours the drawer; this panel's hairline is
    // one level in, so it needs its own arm.
    const focused = rules.find(
      (rule) =>
        rule.selector.includes(":has([data-fork-composer-surface]:focus-within)") &&
        flat(rule.selector).endsWith(
          "[data-chat-composer-top-drawer] > [data-fork-pending-user-input]",
        ),
    );
    expect(focused?.body).toMatch(/border-color:\s*var\(--fork-composer-border-focus\)/u);

    // The prompt surface squares its top corners under the card — this panel
    // is the only banner that fuses with the prompt that way.
    const frame = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-box]") &&
        rule.selector.includes("[data-fork-pending-user-input]") &&
        rule.body.includes("border-top-left-radius"),
    );
    expect(frame?.selector).toContain(MARKER);
    expect(frame?.body).toMatch(/border-top-left-radius:\s*0/u);
    expect(frame?.body).toMatch(/border-top-right-radius:\s*0/u);

    // A notice stacking above the card shares its outline rather than letting
    // the card draw a second top edge.
    const stacked = rules.find(
      (rule) =>
        flat(rule.selector).includes(
          '[data-slot="composer-banner-attachment"] ~ [data-slot="composer-banner-attachment"]',
        ) && rule.selector.includes("[data-fork-pending-user-input]"),
    );
    expect(stacked?.body).toMatch(/border-top:\s*0/u);
    expect(stacked?.body).toMatch(/border-top-left-radius:\s*0/u);
  });
});
