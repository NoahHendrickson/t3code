// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#fork-composer-shell`. */

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
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const controlRows = readSibling("../custom/ComposerControlRow.tsx");
const traitsPicker = readSibling("../components/chat/TraitsPicker.tsx");

describe("fork guard: fork-composer-shell", () => {
  it("keeps one base composer that grows with its editor", () => {
    expect(chatComposer).toContain(
      'const composerDensity = isComposerCollapsedMobile ? "collapsed" : "base"',
    );
    expect(chatComposer).not.toContain('composerDensity === "slim"');
    expect(chatComposer).not.toContain('composerDensity === "tall"');
    expect(chatComposer).not.toContain("useComposerPromptWrapLatch");
    expect(chatComposer).toContain('"relative p-2"');
    expect(chatComposer).toContain('className="flex min-w-0 items-center gap-6"');
    // The action stays pinned top-right while the prompt wraps.
    expect(chatComposer).toContain('className="flex shrink-0 items-center self-start"');
    expect(theme).toMatch(/--fork-composer-radius:\s*8px/u);
    expect(theme).toMatch(
      /\[data-fork-composer-action\]\s*\{[\s\S]{0,180}width:\s*24px[\s\S]{0,180}height:\s*24px/u,
    );
    expect(theme).toMatch(/\[data-testid="composer-editor"\][\s\S]{0,120}min-height:\s*0/u);
  });

  it("docks the composer at the bottom for empty and started threads", () => {
    expect(chatView).toContain(
      'className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-1.5 sm:pt-2"',
    );
    expect(chatView).not.toMatch(/isDraftHeroState\s*\?\s*"pointer-events-none absolute inset-0/u);
    expect(chatView).not.toContain("isDraftHero={isDraftHeroState}");
  });

  it("orders context, prompt, and controls like the design", () => {
    expect(controlRows).toContain('data-fork-composer-context-row="true"');
    expect(controlRows).toContain('data-fork-composer-control-row="true"');
    expect(chatComposer).toContain("<ComposerContextRow>{contextStrip}</ComposerContextRow>");
    expect(chatComposer).toContain('data-fork-composer-box="true"');
    expect(chatComposer).toMatch(
      /<ComposerControlRow\s+left=\{activePendingApproval \? null : composerModeControls\}\s+right=\{composerModelAndStatusControls\}/u,
    );

    const contextIndex = chatComposer.indexOf("<ComposerContextRow>");
    const boxIndex = chatComposer.indexOf('data-fork-composer-box="true"');
    const controlsIndex = chatComposer.lastIndexOf("<ComposerControlRow");
    expect(contextIndex).toBeGreaterThan(0);
    expect(contextIndex).toBeLessThan(boxIndex);
    expect(boxIndex).toBeLessThan(controlsIndex);
  });

  it("keeps only prompt and primary action inside the base row", () => {
    expect(chatComposer).toContain('data-fork-composer-prompt="true"');
    expect(chatComposer).toContain('data-chat-composer-inline-actions="true"');
    expect(chatComposer).toMatch(
      /data-chat-composer-inline-actions="true"[\s\S]{0,240}\{composerPrimaryActionSlot\}/u,
    );
    expect(chatComposer).toContain('data-fork-composer-pills="true"');
    expect(chatComposer).toMatch(
      /const composerModelAndStatusControls[\s\S]{0,800}\{composerModelControls\}/u,
    );
    expect(chatComposer).toContain('"Ask anything,"');
  });

  it("keeps context usage before model and effort on the right", () => {
    const statusControls = chatComposer.match(
      /const composerModelAndStatusControls = \([\s\S]*?\n  \);/u,
    )?.[0];
    expect(statusControls).toBeDefined();
    expect(statusControls!.indexOf("<ContextWindowMeter")).toBeLessThan(
      statusControls!.indexOf("{composerModelControls}"),
    );
    expect(chatComposer).toContain('data-fork-composer-status="true"');
    // The meter keeps its 24px button and natural ring art, exempt by name
    // from the row's control-geometry and glyph rules.
    expect(theme).toMatch(
      /\[data-fork-composer-status\]\s+button\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/u,
    );
    expect(theme).toMatch(/:not\(\[data-fork-composer-status\] button\)/u);
  });

  it("keeps context controls reachable while mobile is collapsed", () => {
    expect(chatComposer).toMatch(/\{contextStrip \? <ComposerContextRow>/u);
    expect(chatComposer).not.toMatch(
      /composerDensity === "collapsed" \? null : \(\s*<ComposerContextRow/u,
    );
    expect(chatComposer).toMatch(/left=\{activePendingApproval \? null : composerModeControls\}/u);
  });

  it("draws the compact control geometry", () => {
    // Context chips: the Auto chip's container four pixels taller — 24px, 4px
    // radius — on the shared fill.
    expect(theme).toMatch(
      /\[data-fork-composer-context-row\][\s\S]{0,160}:is\(button, \[data-slot="button"\]\)[\s\S]{0,480}height:\s*24px[\s\S]{0,240}border-radius:\s*4px/u,
    );
    expect(theme).toMatch(
      /:is\(\[data-fork-composer-pills\], \[data-fork-composer-control-row\]\)[\s\S]{0,240}height:\s*20px/u,
    );
    // Every row control shares the 4px radius, so hover fills square off.
    expect(theme).toMatch(
      /:is\(\[data-fork-composer-pills\], \[data-fork-composer-control-row\]\)[\s\S]{0,420}border-radius:\s*4px/u,
    );
    // The effort label joins traits with a space, not upstream's " · ".
    expect(traitsPicker).toContain('labels.join(" ")');
    expect(traitsPicker).not.toContain('labels.join(" · ")');
    expect(theme).toMatch(/\[data-fork-composer-action\][\s\S]{0,200}border-radius:\s*8px/u);
  });

  it("keeps the composer type ramp", () => {
    // Prompt: the design's body/md, 14px on a 23px line at >=40rem, with a
    // full muted-foreground placeholder; ghost controls at 12px medium.
    expect(theme).toMatch(
      /\[data-testid="composer-editor"\], \[data-testid="composer-editor"\] ~ div\)[\s\S]{0,420}font-size:\s*14px;\s*\n\s*line-height:\s*23px/u,
    );
    expect(theme).toMatch(
      /\[data-testid="composer-editor"\]\s*\n\s*~\s*div\s*\{\s*\n\s*color:\s*var\(--muted-foreground\)/u,
    );
    expect(theme).toMatch(
      /:is\(\[data-fork-composer-pills\], \[data-fork-composer-control-row\]\)[\s\S]{0,320}font-size:\s*12px/u,
    );
  });

  it("draws the runtime mode as the design's accent chip", () => {
    // The attribute value is the mode, and each mode carries its own hue.
    expect(chatComposer).toContain("data-fork-composer-mode-chip={props.runtimeMode}");
    expect(theme).toMatch(/\[data-fork-composer-mode-chip="full-access"\]/u);
    expect(theme).toMatch(/\[data-fork-composer-mode-chip="auto-accept-edits"\]/u);
    expect(theme).toMatch(/\[data-fork-composer-mode-chip="approval-required"\]/u);
    expect(theme).toMatch(
      /\[data-fork-composer-mode-chip\]\s*\{[\s\S]{0,120}height:\s*20px[\s\S]{0,200}border-radius:\s*4px/u,
    );
    // The chip is exempt from the 24px ghost pill treatment by name.
    expect(theme).toMatch(/:not\(\s*\[data-fork-composer-mode-chip\]\s*\)/u);
    // Label only: the trigger's select caret is switched off.
    expect(theme).toMatch(
      /\[data-fork-composer-mode-chip\]\s*\n?\s*\[data-slot="select-icon"\]\s*\{\s*display:\s*none/u,
    );
  });

  it("fills the context chips", () => {
    // One shared fill for both chips, no hairline — Noey's finish over the
    // drawn two-tier pair.
    expect(theme).toMatch(/--fork-context-chip-bg:\s*#2a2a2a/u);
    expect(theme).not.toContain("data-fork-context-chip");
    // The workspace chip keeps its popup but not its trigger caret.
    expect(theme).toMatch(
      /\[data-fork-composer-context-row\]\s*\n?\s*\[data-slot="select-icon"\]\s*\{\s*display:\s*none/u,
    );
  });

  it("keeps the fork styling scoped", () => {
    const composerRules = cssRules(theme).filter(
      (rule) =>
        rule.selector.includes("[data-fork-composer") ||
        rule.selector.includes("chat-composer-glass") ||
        rule.selector.includes("chat-composer-context-strip"),
    );
    expect(composerRules.length).toBeGreaterThan(0);
    for (const rule of composerRules) {
      expect(rule.selector, `unscoped composer rule: ${rule.selector}`).toContain(MARKER);
    }
  });

  it("switches off upstream's stitched glass shell", () => {
    expect(theme).toMatch(/\.chat-composer-glass-shell::before[\s\S]{0,240}display:\s*none/u);
    expect(theme).toMatch(/\.chat-composer-glass-host::after[\s\S]{0,240}display:\s*none/u);
    expect(theme).toMatch(/\.chat-composer-context-strip::before[\s\S]{0,240}display:\s*none/u);
    expect(theme).toMatch(
      /\[data-fork-composer-context-row\][\s\S]{0,120}\.chat-composer-context-strip\s*\{[\s\S]{0,180}margin:\s*0/u,
    );
  });

  it("keeps paint and interaction hooks paired with their rules", () => {
    expect(chatComposer).toContain('data-fork-composer-surface="true"');
    expect(chatComposer).toContain("data-fork-composer-drag-over=");
    expect(primaryActions).toContain('data-fork-composer-action="send"');
    expect(primaryActions).toContain('data-fork-composer-action="stop"');
    expect(theme).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--fork-composer-border\)/u);
    const dragRule = cssRules(theme).find((rule) =>
      rule.selector.includes("[data-fork-composer-drag-over]"),
    );
    expect(dragRule?.body).toMatch(/outline:\s*2px solid/u);
  });

  it("keeps pill sizing off pending-state primary actions", () => {
    const pillRules = cssRules(theme).filter(
      (rule) => /height:\s*24px/u.test(rule.body) && rule.selector.includes("button"),
    );
    expect(pillRules.length).toBeGreaterThan(0);
    for (const rule of pillRules) {
      expect(rule.selector).not.toMatch(/\[data-chat-composer-(footer|inline-actions)\]/u);
    }
  });
});
