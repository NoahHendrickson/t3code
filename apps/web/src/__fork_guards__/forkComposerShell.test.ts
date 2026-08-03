// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#fork-composer-shell`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX,
  COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX,
  shouldUseCompactComposerFooter,
} from "../components/composerFooterLayout";
import {
  COMPOSER_MODEL_SLOT_COMPACT_BREAKPOINT_PX,
  COMPOSER_MODEL_SLOT_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX,
  shouldUseCompactComposerModelSlot,
} from "../custom/composerModelSlotCompact";
import {
  ComposerPromptRow,
  ComposerShell,
  getRuntimeModeChipStyle,
  resolveComposerShellVisibility,
} from "../custom/ComposerShell";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

/** Form ceiling from ChatComposer's `max-w-3xl` — keep compact thresholds below it. */
const COMPOSER_FORM_MAX_WIDTH_PX = 768;

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const shellCss = readSibling("../custom/ComposerShell.css");
const styles = `${theme}\n${shellCss}`;
const rules = cssRules(styles);
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const envModeSelector = readSibling("../components/BranchToolbarEnvModeSelector.tsx");

function shellMarkup(input: { approvalPending?: boolean; collapsedMobile?: boolean } = {}) {
  return renderToStaticMarkup(
    createElement(
      ComposerShell,
      {
        approvalPending: input.approvalPending ?? false,
        collapsedMobile: input.collapsedMobile ?? false,
        context: createElement("span", { "data-test-context": true }),
        mobilePendingActionsVisible: false,
        modeControls: createElement("button", { "data-test-mode": true }),
        modelControls: createElement("button", { "data-test-model": true }),
        readoutControls: createElement("span", { "data-test-readout": true }),
      },
      createElement("div", { "data-test-surface": true }),
    ),
  );
}

function promptMarkup(input: { approvalPending?: boolean; mobilePendingActionsVisible?: boolean }) {
  return renderToStaticMarkup(
    createElement(
      ComposerPromptRow,
      {
        action: createElement("button", { "data-test-primary-action": true }),
        approvalPending: input.approvalPending ?? false,
        mobilePendingActionsVisible: input.mobilePendingActionsVisible ?? false,
      },
      createElement("div", { "data-test-editor": true }),
    ),
  );
}

describe("fork guard: fork-composer-shell", () => {
  it("orders context, surface, and controls in the fork-owned shell", () => {
    const markup = shellMarkup();
    const context = markup.indexOf("data-test-context");
    const surface = markup.indexOf("data-test-surface");
    const controls = markup.indexOf("data-fork-composer-control-row");

    expect(context).toBeGreaterThanOrEqual(0);
    expect(context).toBeLessThan(surface);
    expect(surface).toBeLessThan(controls);
  });

  it("gates every interactive control during approvals but keeps readouts", () => {
    expect(
      resolveComposerShellVisibility({
        approvalPending: true,
        collapsedMobile: false,
        mobilePendingActionsVisible: false,
      }),
    ).toEqual({ showInlinePrimaryAction: false, showInteractiveControls: false });

    const markup = shellMarkup({ approvalPending: true });
    expect(markup).not.toContain("data-test-mode");
    expect(markup).not.toContain("data-test-model");
    expect(markup).toContain("data-test-readout");
  });

  it("hides model and mode controls under the collapsed mobile composer", () => {
    const markup = shellMarkup({ collapsedMobile: true });
    expect(markup).not.toContain("data-test-mode");
    expect(markup).not.toContain("data-test-model");
    expect(markup).toContain("data-test-context");
    expect(markup).toContain("data-test-readout");
  });

  it("renders only one primary-action cluster for a mobile pending answer", () => {
    expect(promptMarkup({})).toContain("data-test-primary-action");
    expect(promptMarkup({ mobilePendingActionsVisible: true })).not.toContain(
      "data-test-primary-action",
    );
    expect(promptMarkup({ approvalPending: true })).not.toContain("data-test-primary-action");
  });

  it("keeps one base shell without the removed density machinery", () => {
    expect(chatComposer).not.toContain("composerDensity");
    expect(chatComposer).not.toContain("data-fork-composer-density");
    expect(chatComposer).not.toContain("useComposerPromptWrapLatch");
    expect(styles).not.toContain("data-fork-composer-density");

    const collapsed = rules.find((rule) =>
      rule.selector.includes('[data-chat-composer-mobile-collapsed="true"]'),
    );
    expect(collapsed?.selector).toContain("[data-fork-composer-surface]");
    expect(collapsed?.body).toMatch(/border-radius:\s*12px/u);
  });

  it("docks the composer at the bottom and centers the draft greeting independently", () => {
    expect(chatView).toContain(
      'className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-1.5 sm:pt-2"',
    );
    expect(chatView).not.toMatch(/isDraftHeroState\s*\?\s*"pointer-events-none absolute inset-0/u);
    expect(chatView).not.toContain("isDraftHero={isDraftHeroState}");
    // Greeting is its own centered layer; it must not ride bottom-full above the input.
    expect(chatView).toContain(
      'className="pointer-events-none absolute inset-0 z-10 flex items-center"',
    );
    const headlineIdx = chatView.indexOf("<DraftHeroHeadline");
    const composerOverlayIdx = chatView.indexOf('data-chat-composer-overlay="true"');
    expect(headlineIdx).toBeGreaterThan(-1);
    expect(composerOverlayIdx).toBeGreaterThan(-1);
    expect(headlineIdx).toBeLessThan(composerOverlayIdx);
    expect(chatView).not.toMatch(/bottom-full[\s\S]{0,400}<DraftHeroHeadline/u);
  });

  it("keeps composer styling scoped to the fork marker", () => {
    const composerRules = rules.filter(
      (rule) =>
        rule.selector.includes("[data-fork-composer") ||
        rule.selector.includes("data-chat-composer-overlay") ||
        rule.selector.includes("chat-composer-glass") ||
        rule.selector.includes("chat-composer-context-strip"),
    );
    expect(composerRules.length).toBeGreaterThan(0);
    for (const rule of composerRules) {
      expect(rule.selector, `unscoped composer rule: ${rule.selector}`).toContain(MARKER);
    }
  });

  it("paints the surface by name and restores drag-over feedback", () => {
    expect(chatComposer).toContain('data-fork-composer-surface="true"');
    expect(chatComposer).toContain("data-fork-composer-drag-over=");
    expect(
      rules.filter((rule) => /\[data-fork-composer-box\]\s*>\s*div/u.test(rule.selector)),
    ).toHaveLength(0);

    const surface = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-surface]") && rule.body.includes("box-shadow"),
    );
    expect(surface?.body).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--fork-composer-border\)/u);
    const drag = rules.find((rule) => rule.selector.includes("[data-fork-composer-drag-over]"));
    expect(drag?.body).toMatch(/background:/u);
    expect(drag?.body).toMatch(/outline:\s*2px solid/u);
  });

  it("moves the desktop scrollport to the prompt wrapper and clips its placeholder", () => {
    const isDesktop = (rule: (typeof rules)[number]) =>
      rule.atRules.some((atRule) => /@media\s*\(\s*width\s*>=\s*40rem\s*\)/u.test(atRule));
    const scrollport = rules.find(
      (rule) =>
        isDesktop(rule) &&
        rule.selector.includes("[data-fork-composer-prompt]") &&
        !rule.selector.includes('[data-testid="composer-editor"]'),
    );
    expect(scrollport?.body).toMatch(/max-height:\s*12\.5rem/u);
    expect(scrollport?.body).toMatch(/overflow-y:\s*auto/u);

    const editor = rules.find(
      (rule) =>
        isDesktop(rule) &&
        rule.selector.includes("[data-fork-composer-prompt]") &&
        rule.selector.includes('[data-testid="composer-editor"]') &&
        !/~\s*div/u.test(rule.selector),
    );
    expect(editor?.body).toMatch(/max-height:\s*none/u);
    expect(editor?.body).toMatch(/overflow-y:\s*hidden/u);

    const placeholder = rules.find(
      (rule) =>
        isDesktop(rule) &&
        /\[data-testid="composer-editor"\]\s*~\s*div/u.test(rule.selector) &&
        rule.body.includes("overflow"),
    );
    expect(placeholder?.body).toMatch(/overflow:\s*clip/u);
    expect(styles).not.toMatch(/\[data-testid="composer-editor"\]\s*\+\s*div/u);
  });

  it("keeps the prompt type, one-line minimum, and placeholder treatment", () => {
    const editorMin = rules.find(
      (rule) =>
        rule.selector.includes('[data-testid="composer-editor"]') &&
        rule.body.includes("min-height"),
    );
    expect(editorMin?.body).toMatch(/min-height:\s*0/u);
    const promptType = rules.find(
      (rule) =>
        rule.selector.includes('[data-testid="composer-editor"]') &&
        rule.body.includes("font-size"),
    );
    expect(promptType?.body).toMatch(/font-size:\s*14px/u);
    expect(promptType?.body).toMatch(/line-height:\s*23px/u);
    const placeholderColor = rules.find(
      (rule) =>
        /\[data-testid="composer-editor"\]\s*~\s*div/u.test(rule.selector) &&
        rule.body.includes("color"),
    );
    expect(placeholderColor?.body).toMatch(/color:\s*var\(--muted-foreground\)/u);
  });

  it("keeps ghost geometry on named interactive groups only", () => {
    const geometry = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-model-controls]") &&
        rule.body.includes("height: 20px"),
    );
    expect(geometry?.selector).toContain('[data-fork-composer-control-row-slot="left"]');
    expect(geometry?.selector).not.toContain("data-fork-composer-status");
    expect(geometry?.selector).not.toContain("data-fork-composer-action");
    expect(geometry?.body).toMatch(/border-radius:\s*4px/u);
    expect(geometry?.body).toMatch(/font-size:\s*12px/u);
  });

  it("owns runtime-mode geometry in the component and maps every mode to tokens", () => {
    const modeRule = rules.find(
      (rule) =>
        rule.selector.endsWith("[data-fork-composer-mode-chip]") &&
        rule.body.includes("height: 20px"),
    );
    expect(modeRule?.body).toMatch(/border-radius:\s*4px/u);
    expect(modeRule?.body).toMatch(/background:\s*var\(--fork-mode-bg\)/u);
    const tokens = [
      getRuntimeModeChipStyle("auto"),
      getRuntimeModeChipStyle("full-access"),
      getRuntimeModeChipStyle("auto-accept-edits"),
      getRuntimeModeChipStyle("approval-required"),
    ];
    expect(new Set(tokens.map((token) => token["--fork-mode-bg"])).size).toBe(4);
    expect(new Set(tokens.map((token) => token["--fork-mode-fg-dark"])).size).toBe(4);
  });

  it("keeps the provider icon hidden in the composer only", () => {
    const iconRules = rules.filter((rule) =>
      rule.selector.includes("[data-chat-provider-model-picker]"),
    );
    expect(iconRules.length).toBeGreaterThan(0);
    for (const rule of iconRules) {
      expect(rule.selector).toContain("[data-fork-composer-control-row]");
      expect(rule.selector).toContain(":not([data-base-ui-tooltip-trigger])");
    }
  });

  it("opens the workspace select above the context chip row", () => {
    // Assert independently — prop order must not matter to the guard.
    expect(envModeSelector).toMatch(/SelectPopup[^>]*alignItemWithTrigger=\{false\}/u);
    expect(envModeSelector).toMatch(/SelectPopup[^>]*side="top"/u);
  });

  it("keeps context chips at 24px and the meter outside ghost geometry", () => {
    const context = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.body.includes("height: 24px"),
    );
    expect(context?.body).toMatch(/border-radius:\s*6px/u);
    expect(context?.body).toMatch(/padding-inline:\s*4px 6px/u);
    const checkoutChip = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="select-trigger"]'),
    );
    expect(checkoutChip?.body).toMatch(/padding-inline-start:\s*0/u);
    const branchChip = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="combobox-trigger"]'),
    );
    expect(branchChip?.body).toMatch(/padding-inline-start:\s*6px/u);
    const meter = rules.find((rule) =>
      rule.selector.endsWith("[data-fork-composer-status] button"),
    );
    expect(meter?.body).toMatch(/width:\s*24px/u);
    expect(meter?.body).toMatch(/height:\s*24px/u);
  });

  it("hides only separators in the left mode slot", () => {
    const separatorRules = rules.filter(
      (rule) =>
        rule.selector.includes('[data-slot="separator"]') &&
        rule.selector.includes("fork-composer-control-row"),
    );
    expect(separatorRules.length).toBeGreaterThan(0);
    for (const rule of separatorRules) {
      expect(rule.selector).toContain('[data-fork-composer-control-row-slot="left"]');
    }
  });

  it("keeps mode-row ⋯ collapse below the denser fork control-row widths", () => {
    // Upstream is 620/780; those fire with a large empty gap on the fork row.
    // Mode-row only — model-picker compaction stays at upstream 620/780.
    expect(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX).toBe(400);
    expect(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX).toBe(520);
    expect(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX).toBeLessThan(
      COMPOSER_FORM_MAX_WIDTH_PX,
    );
    expect(shouldUseCompactComposerFooter(560)).toBe(false);
    expect(
      shouldUseCompactComposerFooter(560, {
        hasWideActions: true,
      }),
    ).toBe(false);
    // Wide-actions branch: expanded at/above 520, compact below.
    expect(
      shouldUseCompactComposerFooter(519, {
        hasWideActions: true,
      }),
    ).toBe(true);
    expect(
      shouldUseCompactComposerFooter(520, {
        hasWideActions: true,
      }),
    ).toBe(false);
    expect(shouldUseCompactComposerFooter(399)).toBe(true);
    expect(shouldUseCompactComposerFooter(400)).toBe(false);

    // Model trigger stays on upstream widths; ChatComposer must wire both.
    expect(COMPOSER_MODEL_SLOT_COMPACT_BREAKPOINT_PX).toBe(620);
    expect(COMPOSER_MODEL_SLOT_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX).toBe(780);
    expect(shouldUseCompactComposerModelSlot(560)).toBe(true);
    expect(shouldUseCompactComposerModelSlot(620)).toBe(false);
    expect(chatComposer).toContain("shouldUseCompactComposerModelSlot");
    expect(chatComposer).toContain("compact={isComposerModelSlotCompact}");
  });

  it("keeps primary actions out of ghost sizing", () => {
    expect(primaryActions).toContain('data-fork-composer-action="send"');
    expect(primaryActions).toContain('data-fork-composer-action="stop"');
    const action = rules.find(
      (rule) =>
        rule.selector.endsWith("[data-fork-composer-action]") && rule.body.includes("width: 24px"),
    );
    expect(action?.body).toMatch(/height:\s*24px/u);
    expect(action?.body).toMatch(/border-radius:\s*4px/u);
    for (const rule of rules.filter((candidate) => candidate.body.includes("height: 20px"))) {
      expect(rule.selector).not.toMatch(
        /data-chat-composer-(inline-actions|mobile-pending-actions)/u,
      );
    }
  });

  it("floors the docked composer overlay so timeline rows stop above it", () => {
    const floor = rules.find(
      (rule) =>
        rule.selector.includes('[data-chat-composer-overlay="true"]::before') ||
        rule.selector.includes("[data-chat-composer-overlay='true']::before"),
    );
    expect(floor?.body).toMatch(/background:\s*var\(--background\)/u);
    expect(floor?.body).toMatch(
      /mask-image:\s*linear-gradient\(to bottom,\s*transparent,\s*black 1\.25rem\)/u,
    );
    const stacking = rules.find(
      (rule) =>
        (rule.selector.includes('[data-chat-composer-overlay="true"] > *') ||
          rule.selector.includes("[data-chat-composer-overlay='true'] > *")) &&
        !rule.selector.includes("::before"),
    );
    expect(stacking?.body).toMatch(/z-index:\s*1/u);
  });

  it("switches off the stitched glass shell and flattens the context strip", () => {
    for (const selector of [
      ".chat-composer-glass-shell::before",
      ".chat-composer-glass-host::after",
      ".chat-composer-context-strip::before",
    ]) {
      const rule = rules.find((candidate) => candidate.selector.includes(selector));
      expect(rule?.body).toMatch(/display:\s*none/u);
    }
    const strip = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes(".chat-composer-context-strip") &&
        !rule.selector.includes(">.flex") &&
        !rule.selector.includes("> .flex"),
    );
    expect(strip?.body).toMatch(/margin:\s*0/u);
    expect(strip?.body).toMatch(/gap:\s*8px/u);
    // Nested PR+branch (and env+checkout) wrappers keep upstream gap-1; the
    // fork re-gaps them to 8px so checkout→PR→branch reads evenly, and drops
    // flex-1 / justify-end / ml-auto so the cluster stays packed when narrow.
    const nested = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes(".chat-composer-context-strip") &&
        (rule.selector.includes(">.flex") || rule.selector.includes("> .flex")),
    );
    expect(nested?.body).toMatch(/gap:\s*8px/u);
    expect(nested?.body).toMatch(/flex:\s*0 1 auto/u);
    expect(nested?.body).toMatch(/justify-content:\s*flex-start/u);
    expect(nested?.body).toMatch(/margin-inline-start:\s*0/u);
    expect(nested?.body).toMatch(/max-width:\s*100%/u);
  });
});
