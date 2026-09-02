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
} from "../overrides/components/composerFooterLayout";
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
const palettes = readSibling("../theme.custom.palettes.css");
const styles = `${theme}\n${shellCss}`;
const rules = cssRules(styles);
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const envModeSelector = readSibling("../components/BranchToolbarEnvModeSelector.tsx");
const stageBackdrop = readSibling("../components/SidebarStageBackdrop.tsx");

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

/** Index of the `</div>` that balances the div whose opening tag contains `openIndex`. */
function balancedDivClose(markup: string, openIndex: number): number {
  const tags = /<div\b|<\/div>/gu;
  tags.lastIndex = markup.lastIndexOf("<div", openIndex);
  let depth = 0;
  for (let match = tags.exec(markup); match !== null; match = tags.exec(markup)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return match.index;
  }
  return -1;
}

describe("fork guard: fork-composer-shell", () => {
  it("orders context, then a vessel wrapping surface and controls", () => {
    const markup = shellMarkup();
    const context = markup.indexOf("data-test-context");
    const vessel = markup.indexOf('data-fork-composer-vessel="true"');
    const surface = markup.indexOf("data-test-surface");
    const controls = markup.indexOf("data-fork-composer-control-row");

    expect(context).toBeGreaterThanOrEqual(0);
    expect(context).toBeLessThan(vessel);
    expect(vessel).toBeGreaterThanOrEqual(0);
    expect(vessel).toBeLessThan(surface);
    expect(surface).toBeLessThan(controls);
    expect(controls).toBeGreaterThanOrEqual(0);

    // Containment, not just ordering: the surface and the whole control row
    // (open through balanced close) must fall inside the vessel's own close.
    // An indexOf("</div>") from the control row would only find the left
    // slot's close and pass with the controls re-orphaned outside the vessel.
    const vesselClose = balancedDivClose(markup, vessel);
    const controlsClose = balancedDivClose(markup, controls);
    expect(vesselClose).toBeGreaterThan(-1);
    expect(controlsClose).toBeGreaterThan(-1);
    expect(surface).toBeLessThan(vesselClose);
    expect(controlsClose).toBeLessThan(vesselClose);
  });

  it("keeps the vessel paint off the collapsed mobile pill", () => {
    // The collapsed tap target rounds to 12px over the vessel's 8px corners;
    // an unconditional vessel would expose background wedges behind the pill
    // and slab any live readout row onto it.
    const markup = shellMarkup({ collapsedMobile: true });
    expect(markup).not.toContain('data-fork-composer-vessel="true"');
    expect(shellMarkup()).toContain('data-fork-composer-vessel="true"');
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

  it("hides model and mode controls behind the mobile pending-answer cluster", () => {
    // Upstream's footer goes `hidden sm:flex` here; the editor's bottom band is
    // reserved for the absolute prev/advance actions.
    expect(
      resolveComposerShellVisibility({
        approvalPending: false,
        collapsedMobile: false,
        mobilePendingActionsVisible: true,
      }),
    ).toEqual({ showInlinePrimaryAction: false, showInteractiveControls: false });
  });

  it("keeps collapsed-mobile controls on upstream theme-role tokens", () => {
    expect([...chatComposer.matchAll(/text-placeholder/gu)]).toHaveLength(2);
    expect(chatComposer).not.toContain("text-muted-foreground/60");
    expect(chatComposer).not.toContain("text-muted-foreground/35");
    expect(chatComposer).toContain(
      "bg-message-action text-message-action-foreground hover:bg-message-action-hover",
    );
    expect(chatComposer).not.toContain("bg-primary/90 text-primary-foreground");
    expect(chatComposer).toContain(
      "items-center justify-center px-1 text-center text-[10px] text-secondary-label",
    );
  });

  it("fences the compact Nightly artwork seam used by the send button", () => {
    expect(stageBackdrop).toContain("<NightlySkyArt compact />");
    expect(stageBackdrop).toMatch(
      /fork:begin fork-composer-shell[^\n]*\nfunction NightlySkyArt\(\{ compact = false \}: \{ compact\?: boolean \}\) \{\n\s*\/\* fork:end fork-composer-shell/u,
    );
    expect(stageBackdrop).toMatch(
      /fork:begin fork-composer-shell[^\n]*\n\s*viewBox=\{compact \? "96 0 8192 96" : STAGE_BACKDROP_VIEW_BOX\}\n\s*\/\* fork:end fork-composer-shell/u,
    );
  });

  it("renders only one primary-action cluster for a mobile pending answer", () => {
    expect(promptMarkup({})).toContain("data-test-primary-action");
    expect(promptMarkup({ mobilePendingActionsVisible: true })).not.toContain(
      "data-test-primary-action",
    );
    expect(promptMarkup({ approvalPending: true })).not.toContain("data-test-primary-action");
  });

  it("anchors the inline primary action to the bottom of the prompt row", () => {
    const markup = promptMarkup({});
    expect(markup).toContain("items-end");
    expect(markup).toContain("self-end");
    expect(markup).not.toContain("self-start");
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
    expect(chatView).toContain("<ComposerSurface.Shell");
  });

  it("keeps the context strip mounted when the thread's worktree is gone", () => {
    // A deleted worktree answers "not a repo" for its own cwd rather than
    // failing, so gating on that alone unmounted the strip and stranded the
    // thread there. A worktree path in play must keep the strip rendered.
    expect(chatView).toMatch(/showComposerContextStrip\s*=\s*shouldShowComposerContextStrip/u);
    expect(chatView).toMatch(/hasActiveProject:\s*activeProject !== null/u);
    expect(chatView).toMatch(/isGitRepo:\s*isGitRepo \|\| activeThreadWorktreePath !== null/u);
  });

  it("keeps composer styling scoped to the fork marker", () => {
    const composerRules = rules.filter(
      (rule) =>
        rule.selector.includes("[data-fork-composer") ||
        rule.selector.includes("data-chat-composer-overlay") ||
        rule.selector.includes('[data-slot="composer-'),
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

    // Upstream glasses the frame (backdrop-filter, shadow, ::after ring) for
    // every attached banner, not only the Questions drawer; the surface's own
    // hairline is the only ring, so the frame sheds all of it unconditionally.
    const frame = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-box]") &&
        !rule.selector.includes(":has(") &&
        rule.body.includes("backdrop-filter"),
    );
    expect(frame?.selector).not.toContain(".dark");
    expect(frame?.body).toMatch(/backdrop-filter:\s*none/u);
    expect(frame?.body).toMatch(/box-shadow:\s*none/u);
    const frameOutline = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-box]::after") &&
        !rule.selector.includes(":has("),
    );
    expect(frameOutline?.body).toMatch(/display:\s*none/u);
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
    expect(geometry?.body).toMatch(/padding-inline:\s*4px/u);
  });

  it("paints the outer vessel that floors the control row", () => {
    const vessel = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-vessel]") && rule.body.includes("background"),
    );
    expect(vessel?.body).toMatch(/border-radius:\s*var\(--fork-composer-radius\)/u);
    expect(vessel?.body).toMatch(/background:\s*var\(--fork-composer-vessel-bg\)/u);
    // Dark-only: the designs are dark-only and a light fork build keeps
    // upstream's unpainted flow.
    expect(vessel?.selector).toContain(".dark");
    expect(styles).toMatch(/--fork-composer-vessel-bg:/u);
  });

  it("hovers the ghost controls on a faint white wash, not upstream's accent", () => {
    // `--accent` is bit-identical to `--fork-composer-bg` on the Cool palettes,
    // so upstream's ghost hover paints the model / effort trigger the colour the
    // composer already wears. The ghosts get their own token: white 4% in dark
    // (the context chips' raised lift read nearly solid on these text-only
    // controls), falling back to the chip lift in light.
    const hover = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-model-controls]") &&
        rule.selector.includes(":hover") &&
        rule.body.includes("background"),
    );
    expect(hover?.selector).toContain('[data-fork-composer-control-row-slot="left"]');
    expect(hover?.body).toMatch(/background:\s*var\(--fork-composer-control-hover\)/u);
    const controlHover = rules.find(
      (rule) =>
        rule.selector.endsWith(".dark") && rule.body.includes("--fork-composer-control-hover:"),
    );
    expect(controlHover?.body).toContain("--fork-composer-control-hover: rgb(255 255 255 / 4%)");
    // Open triggers hold the fill; disabled ones never take it.
    expect(hover?.selector).toContain("[data-popup-open]");
    expect(hover?.selector).toContain(":not(:disabled)");
    // The chip owns its own per-mode hover hue.
    expect(hover?.selector).toContain(":not([data-fork-composer-mode-chip])");
    // The rule reads a per-palette token, so every palette has to declare one
    // on its stage block or that theme falls back to the default dark lift.
    const paletteRules = cssRules(palettes);
    for (const palette of ["cool-dark", "cool-darker", "neutral-dark", "neutral-darker"]) {
      const stage = paletteRules.find(
        (rule) =>
          rule.selector.includes(`[data-fork-theme="${palette}"]`) &&
          rule.body.includes("--fork-context-chip-bg-hover:"),
      );
      expect(stage, palette).toBeDefined();
    }
    expect(theme).toMatch(/--fork-context-chip-bg-hover:/u);
  });

  it("keeps the mode chip colour-only on shared geometry and maps every mode to tokens", () => {
    const modeRule = rules.find(
      (rule) =>
        rule.selector.endsWith("[data-fork-composer-mode-chip]") &&
        rule.body.includes("background: var(--fork-mode-bg)"),
    );
    expect(modeRule?.body).toMatch(/color:\s*var\(--fork-mode-fg\)/u);
    // Geometry has one owner — the shared ghost-control rule, which must not
    // exclude the chip, and the chip block must not re-declare it.
    expect(modeRule?.body).not.toMatch(/height:|padding-inline:|border-radius:|font-size:/u);
    const sharedGeometry = rules.find(
      (rule) =>
        rule.selector.includes('[data-fork-composer-control-row-slot="left"]') &&
        rule.body.includes("height: 20px"),
    );
    expect(sharedGeometry?.selector).not.toContain(":not([data-fork-composer-mode-chip])");
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
    expect(context?.body).toMatch(/padding-inline:\s*8px/u);
    const chipPad = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="select-trigger"]') &&
        rule.selector.includes('[data-slot="combobox-trigger"]') &&
        rule.selector.includes("[data-fork-context-chip]"),
    );
    expect(chipPad?.body).toMatch(/padding-inline:\s*8px/u);
    // The ghost xs trigger's Tailwind before-utility stamps a real in-flow
    // pseudo-element; left in the flex row it opens phantom gap space ahead
    // of the folder glyph (Current checkout only — the locked span and the
    // branch chip carry no before utility).
    const triggerBefore = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="select-trigger"]::before'),
    );
    expect(triggerBefore?.body).toMatch(/display:\s*none/u);
    // Workspace + branch chips share white ink in dark (including locked spans).
    const chipInk = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes("[data-fork-context-chip]") &&
        rule.body.includes("color:"),
    );
    expect(chipInk?.body).toMatch(/color:\s*#ffffff/u);
    expect(chipInk?.selector).toContain(".dark");
    expect(envModeSelector).toContain("data-fork-context-chip");
    expect(readSibling("../components/BranchToolbarEnvironmentSelector.tsx")).toContain(
      "data-fork-context-chip",
    );
    expect(readSibling("../components/BranchToolbar.tsx")).toContain("data-fork-context-chip");
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
    // Upstream's attach-files button (#8236) sits in the same cluster at
    // icon-sm; the row is items-end, so a 28px neighbour would drop the prompt.
    expect(chatComposer).toContain('data-chat-composer-actions="right"');
    const cluster = rules.find((rule) =>
      rule.selector.endsWith('[data-chat-composer-actions="right"] > button'),
    );
    expect(cluster?.body).toMatch(/width:\s*24px/u);
    expect(cluster?.body).toMatch(/height:\s*24px/u);
    expect(cluster?.body).toMatch(/border-radius:\s*4px/u);
    // Its hover is the ghost lift, not --accent: on the Cool palettes --accent
    // is the prompt surface the button sits on, so upstream's hover vanished.
    const attachHover = rules.find((rule) =>
      rule.selector
        .replace(/\s+/gu, " ")
        .includes(
          '[data-chat-composer-actions="right"] > button:not([data-fork-composer-action]):is(:hover, [data-pressed])',
        ),
    );
    expect(attachHover?.body).toMatch(/background:\s*var\(--fork-composer-control-hover\)/u);
    for (const rule of rules.filter((candidate) => candidate.body.includes("height: 20px"))) {
      expect(rule.selector).not.toMatch(
        /data-chat-composer-(inline-actions|mobile-pending-actions)/u,
      );
    }
  });

  it("floors the docked composer overlay so timeline rows stop above it", () => {
    const floor = rules.find(
      (rule) =>
        rule.selector.includes('[data-chat-composer-overlay="true"]') ||
        rule.selector.includes("[data-chat-composer-overlay='true']"),
    );
    expect(floor?.body).toMatch(
      /background:\s*linear-gradient\(to bottom,\s*transparent,\s*var\(--background\)\s*1\.25rem\)/u,
    );
  });

  it("switches off the stitched glass shell and flattens the context strip", () => {
    for (const selector of [
      '[data-slot="composer-shell"]::before',
      '[data-slot="composer-host"]::after',
      '[data-slot="composer-context-strip"]::before',
    ]) {
      const rule = rules.find((candidate) => candidate.selector.includes(selector));
      expect(rule?.body).toMatch(/display:\s*none/u);
    }
    const strip = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="composer-context-strip"]') &&
        !/>\s*(?:\.flex|\*)/u.test(rule.selector),
    );
    // The CSS belt is the single owner of the flattened strip geometry —
    // upstream's className (negative margin, inset widths, clearance padding)
    // ships untouched and every reset happens here.
    expect(strip?.body).toMatch(/margin:\s*0/u);
    expect(strip?.body).toMatch(/padding:\s*0/u);
    expect(strip?.body).toMatch(/width:\s*auto/u);
    expect(strip?.body).toMatch(/max-width:\s*none/u);
    expect(strip?.body).toMatch(/gap:\s*8px/u);
    // Flattening the wrapper must not let the strip shrink-to-fit: upstream's
    // label-collapse heuristic measures the strip's own clientWidth as the
    // space available, so a content-sized strip reads as full once the labels
    // are hidden and never expands the chips back out of icon-only.
    expect(strip?.body).toMatch(/flex:\s*1 1 auto/u);
    expect(strip?.body).toMatch(/min-width:\s*0/u);
    // Nested PR+branch (and env+checkout) wrappers keep upstream gap-1; the
    // fork re-gaps them to 8px so checkout→PR→branch reads evenly, and drops
    // flex-1 / justify-end / ml-auto so the cluster stays packed when narrow.
    const nested = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="composer-context-strip"]') &&
        (rule.selector.includes(">.flex") || rule.selector.includes("> .flex")),
    );
    expect(nested?.body).toMatch(/gap:\s*8px/u);
    expect(nested?.body).toMatch(/flex:\s*0 1 auto/u);
    expect(nested?.body).toMatch(/justify-content:\s*flex-start/u);
    expect(nested?.body).toMatch(/margin-inline-start:\s*0/u);
    expect(nested?.body).toMatch(/max-width:\s*100%/u);
    // A stretched strip has free space, so packing has to reach EVERY direct
    // child, not just the ones that happen to carry `.flex`. Below `md` the
    // workspace slot is an `inline-flex` Button or span and keeps upstream's
    // flex-1 otherwise, which claims that space and gaps the cluster open.
    const everyChild = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-context-row]") &&
        rule.selector.includes('[data-slot="composer-context-strip"]') &&
        rule.selector.trim().endsWith("> *"),
    );
    expect(everyChild?.body).toMatch(/flex:\s*0 1 auto/u);
    // Flex only — the wrapper rule's gap and max-width would fight the chips'
    // own 6px gap and the mobile slot's 48% cap.
    expect(everyChild?.body).not.toMatch(/gap:|max-width:/u);
  });

  it("moves background liveness off the banner stack onto a context-strip pill with stop", () => {
    const pill = readSibling("../custom/ComposerMonitoringPill.tsx");
    const strip = readSibling("../custom/composerContextStrip.tsx");
    const branchToolbar = readSibling("../components/BranchToolbar.tsx");
    expect(pill).toContain("export function ComposerBackgroundLivenessPill");
    expect(pill).toContain('readonly kind: "monitoring"');
    expect(pill).toContain('readonly kind: "working"');
    expect(pill).toContain("SidebarV2WorkingRain");
    expect(pill).toContain("SidebarV2MonitoringMark");
    expect(pill).toContain("StopSquareIcon");
    expect(pill).toContain('role="status"');
    expect(pill).toContain("data-fork-liveness-mark");
    expect(pill).toContain("data-fork-monitoring-pill");
    expect(pill).toContain("data-fork-monitoring-stop");
    expect(pill).toContain("Stop background work");
    expect(strip).toContain("resolveComposerLivenessPillProps");
    expect(strip).toContain("<ComposerSurface.ContextStrip>");
    expect(strip).toContain("renderComposerLivenessStripFallback");
    expect(branchToolbar).toContain("trailing?: ReactNode");
    expect(branchToolbar).toContain("{trailing ?? null}");
    // The bare liveness strip has one owner: the no-thread branch reuses the
    // fallback instead of re-rendering the strip inline with a dead measure ref.
    expect(branchToolbar).toContain("return renderComposerLivenessStripFallback(trailing);");
    expect(branchToolbar).not.toMatch(/<ComposerSurface\.ContextStrip ref=\{setStripElement\}>/u);
    expect(chatView).toContain("resolveComposerLivenessPillProps");
    expect(chatView).toContain("renderComposerLivenessPill");
    expect(chatView).toContain("trailing: composerLivenessPill");
    expect(chatView).not.toContain("backgroundLivenessBannerItem");
    expect(chatView).not.toContain('"Monitoring in the background"');
    expect(chatView).not.toContain('"Background work running"');
    // Pill chrome lives with fork-composer-shell, not theme.custom.css sprawl.
    expect(shellCss).toContain("[data-fork-monitoring-pill]");
    expect(shellCss).toContain("button[data-fork-monitoring-stop]");
    expect(shellCss).toContain("[data-fork-liveness-mark]");
    expect(shellCss).toMatch(
      /button\[data-fork-monitoring-stop\]\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/u,
    );
    expect(shellCss).toMatch(
      /button\[data-fork-monitoring-stop\]:disabled\s*\{[^}]*background:\s*transparent/u,
    );
    expect(theme).not.toContain("[data-fork-monitoring-pill]");
  });

  it("ends the transcript above the composer instead of hiding it behind", () => {
    // The transcript used to scroll the full column height and rely on the
    // composer to cover it. That fails wherever the composer is translucent —
    // under glass it is a 5% wash — and it can never work for the context row,
    // which sits outside the vessel. The mask removes the content instead, so
    // there is nothing to cover in any palette.
    const cutoff = rules.find(
      (rule) =>
        rule.selector.includes(".fork-timeline-cutoff") &&
        !rule.selector.includes(".topbar-scroll-fade"),
    );
    expect(cutoff, "the timeline cutoff mask must exist").toBeDefined();
    expect(cutoff?.selector).toContain(MARKER);

    // Driven by the measured composer, not a guessed constant: the composer
    // grows with the editor and with the context row, and a fixed inset would
    // cut in the wrong place the moment it does.
    expect(cutoff?.body, "the cutoff must follow the measured composer").toContain(
      "var(--fork-composer-inset",
    );
    // Both spellings, or the fade is Chromium-only.
    expect(cutoff?.body).toMatch(/(?<!-webkit-)mask-image:/u);
    expect(cutoff?.body).toContain("-webkit-mask-image:");

    // ChatView stamps the value the mask reads.
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toContain('"--fork-composer-inset"');
    expect(chatView).toContain("composerOverlayHeight");

    // The class is unconditional. Upstream's top fade drops out whenever a
    // banner sits above the timeline, and if the cutoff rode on that class the
    // transcript would run under the composer again in exactly those states.
    const timeline = readSibling("../components/chat/MessagesTimeline.tsx");
    expect(timeline).toContain('"fork-timeline-cutoff"');
    expect(timeline, "the cutoff class must not be gated on the top fade").not.toMatch(
      /topFadeEnabled\s*&&\s*"fork-timeline-cutoff"/u,
    );

    // Masks cannot be composed across rules, so the fork owns the whole stack
    // and folds upstream's top fade back in by height. If that companion rule
    // goes missing the top fade silently stops rendering.
    const withTopFade = rules.find(
      (rule) =>
        rule.selector.includes(".fork-timeline-cutoff") &&
        rule.selector.includes(".topbar-scroll-fade"),
    );
    expect(
      withTopFade,
      "the top-fade height must be restored when upstream's class is on",
    ).toBeDefined();
    expect(withTopFade?.body).toContain("--topbar-scroll-fade-height");
    expect(cutoff?.body).toContain("--fork-timeline-top-fade: 0px");
  });
});
