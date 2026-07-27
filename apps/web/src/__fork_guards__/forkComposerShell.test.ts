// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-composer-shell`.
 *
 * The composer restyle spans three upstream files and one stylesheet, and the
 * halves fail independently: the JSX can keep its fences while the CSS stops
 * matching, or the CSS can survive a rebase that quietly drops the attribute it
 * hangs off. So this checks both ends of each seam — the hooks in the TSX, and
 * the rules that consume them — plus the one piece of behaviour that is pure
 * logic (which shell a given composer state wears).
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import {
  resolveComposerDensity,
  isPromptHeightWrapped,
  nextWrapLatch,
} from "../custom/composerDensity";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;

const theme = readSibling("../theme.custom.css");
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const controlRow = readSibling("../custom/ComposerControlRow.tsx");

describe("fork guard: fork-composer-shell", () => {
  it("keeps the box, send and stop hooks the stylesheet hangs off", () => {
    // Every visual decision below is keyed to one of these four attributes. Lose
    // one in a rebase and the CSS still compiles, still ships, and matches
    // nothing.
    expect(chatComposer, "ChatComposer lost data-fork-composer-box").toContain(
      'data-fork-composer-box="true"',
    );
    expect(chatComposer, "ChatComposer lost the density attribute").toContain(
      "data-fork-composer-density={composerDensity}",
    );
    expect(primaryActions, "send button lost its fork hook").toContain(
      'data-fork-composer-action="send"',
    );
    expect(primaryActions, "stop button lost its fork hook").toContain(
      'data-fork-composer-action="stop"',
    );
    expect(controlRow).toContain('data-fork-composer-control-row="true"');
  });

  it("styles the composer only under the fork marker", () => {
    // An unmarked or pure-upstream build must render upstream's glass shell
    // untouched, so every composer rule has to be scoped to the marker.
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
    // The designs draw a discrete box with a free-floating control row. Leaving
    // either painted pseudo-element on restores the joined vessel the fork
    // replaced, outlining the control row along with the box.
    expect(theme).toMatch(/\.chat-composer-glass-shell::before[\s\S]{0,240}display:\s*none/u);
    expect(theme).toMatch(/\.chat-composer-glass-host::after[\s\S]{0,240}display:\s*none/u);
    expect(theme).toMatch(/\.chat-composer-context-strip::before[\s\S]{0,240}display:\s*none/u);
  });

  it("draws both radii and moves focus onto the border", () => {
    expect(theme).toMatch(/--fork-composer-radius:\s*20px/u);
    expect(theme).toMatch(
      /\[data-fork-composer-density="slim"\][\s\S]{0,160}--fork-composer-radius:\s*12px/u,
    );
    // Inset shadow rather than a border, so the stroke does not add 2px to a
    // box the designs measure at 96 including it.
    expect(theme).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--fork-composer-border\)/u);
    expect(theme).toMatch(
      /:focus-within[\s\S]{0,200}box-shadow:\s*inset 0 0 0 1px var\(--fork-composer-border-focus\)/u,
    );
  });

  it("takes the drawn colours in dark and defers to upstream in light", () => {
    // Dark-only design, same as the rest of the fork's surface work.
    expect(theme).toMatch(/\.dark\s*\{[^}]*--fork-composer-bg:\s*rgb\(41 41 41 \/ 80%\)/u);
    expect(theme).toMatch(/\.dark\s*\{[^}]*--fork-composer-border:\s*rgb\(255 255 255 \/ 8%\)/u);
    expect(theme).toMatch(/\.dark\s*\{[^}]*--fork-composer-border-focus:\s*#595959/u);
    expect(theme).toMatch(/--fork-composer-bg:\s*var\(--card\)/u);
    expect(theme).toMatch(/--fork-composer-border:\s*var\(--border\)/u);
  });

  it("sets the pills at 12px, not the 10px the designs draw", () => {
    // A deliberate divergence from Figma, so it needs pinning: someone
    // reconciling this file against the design would otherwise "correct" it
    // back to 10px and think they were fixing a typo.
    expect(theme).toMatch(/font-size:\s*12px;\s*\n\s*font-weight:\s*500/u);
  });

  it("drops the provider icon from the model pill, in the composer only", () => {
    // ProviderModelPicker is shared with Settings, where the icon still
    // distinguishes one configured instance from another. Unscoping this rule
    // would strip it there too.
    const iconRules = cssRules(theme).filter((rule) =>
      rule.selector.includes("[data-chat-provider-model-picker]"),
    );
    expect(iconRules.length).toBeGreaterThan(0);
    for (const rule of iconRules) {
      expect(rule.selector, `unscoped model-pill rule: ${rule.selector}`).toContain(
        "[data-fork-composer-box]",
      );
      // The icon carries no attributes; the model name is tooltip-wrapped. Drop
      // this guard and an upstream that removes the icon leaves the rule hiding
      // the model name instead, for a pill of pure caret.
      expect(rule.selector).toContain(":not([data-base-ui-tooltip-trigger])");
    }
  });

  it("resizes the placeholder with the prompt, via a general sibling combinator", () => {
    // Lexical renders the placeholder as the editor's third child, with an
    // empty zero-height div between them. `+ div` matches the spacer and leaves
    // the placeholder at upstream's 14px/22.75px, which reads as a caret
    // misaligned against the text it sits in front of. Regressing this to `+`
    // looks like a tidy-up and is not one.
    expect(theme).toMatch(/\[data-testid="composer-editor"\]\s*~\s*div/u);
    expect(theme).not.toMatch(/\[data-testid="composer-editor"\]\s*\+\s*div/u);
  });

  it("frees the prompt from upstream's three-line minimum", () => {
    // Upstream holds the editor open at min-h-17.5. That makes the slim shell
    // geometrically impossible and leaves the tall one hollow.
    expect(theme).toMatch(/\[data-testid="composer-editor"\][\s\S]{0,160}min-height:\s*0/u);
  });

  it("squares the send and stop buttons and reddens stop", () => {
    expect(theme).toMatch(/\[data-fork-composer-action\]\s*\{[\s\S]{0,200}border-radius:\s*6px/u);
    expect(theme).toMatch(
      /\[data-fork-composer-action="stop"\][\s\S]{0,120}background:\s*#ea3150/u,
    );
  });

  it("routes the branch strip through the composer's control row", () => {
    // The worktree/branch pair is the control row's right-hand group. If a sync
    // restores BranchToolbar as a sibling of the composer, the row loses its
    // right half and the strip reappears underneath, stitched or not.
    expect(chatView, "ChatView stopped passing contextStrip").toContain("contextStrip: (");
    expect(chatView).toContain("<BranchToolbar");
    expect(chatComposer).toContain("<ComposerControlRow");
    // ...and the wrapper that hung it off the composer's underside is flattened.
    expect(theme).toMatch(
      /\[data-fork-composer-control-row-slot="right"\][\s\S]{0,200}margin:\s*0/u,
    );
  });

  it("pins the new-chat screen to the tall shell and a started thread to the slim one", () => {
    const base = {
      isDraftHero: false,
      isPromptWrapped: false,
      hasComposerHeader: false,
      isCollapsedMobile: false,
    };
    expect(resolveComposerDensity({ ...base, isDraftHero: true })).toBe("tall");
    expect(resolveComposerDensity(base)).toBe("slim");
  });

  it("grows the slim shell into the tall one once the prompt wraps", () => {
    const base = {
      isDraftHero: false,
      isPromptWrapped: false,
      hasComposerHeader: false,
      isCollapsedMobile: false,
    };
    expect(resolveComposerDensity({ ...base, isPromptWrapped: true })).toBe("tall");
    // A panel that owns the box's internals — approval, pending question, plan
    // banner — has nowhere to put its action row in a single 24px line.
    expect(resolveComposerDensity({ ...base, hasComposerHeader: true })).toBe("tall");
  });

  it("latches the wrap so the two shell widths cannot oscillate", () => {
    // The tall shell is ~736px where slim is ~460px, so a prompt between those
    // widths un-wraps the moment the flip lands. Deriving density straight from
    // the measurement makes that a loop that pins the main thread. Once true,
    // only an empty prompt clears it.
    expect(nextWrapLatch({ latched: false, measuredWrapped: true, isPromptEmpty: false })).toBe(
      true,
    );
    expect(nextWrapLatch({ latched: true, measuredWrapped: false, isPromptEmpty: false })).toBe(
      true,
    );
    expect(nextWrapLatch({ latched: true, measuredWrapped: false, isPromptEmpty: true })).toBe(
      false,
    );
    expect(nextWrapLatch({ latched: false, measuredWrapped: false, isPromptEmpty: false })).toBe(
      false,
    );
  });

  it("releases the latch on an emptied prompt without waiting for a resize", () => {
    // Clearing a one-line prompt in the tall shell changes no height, so the
    // ResizeObserver never fires and the effect is the only thing that resets.
    expect(chatComposer).toMatch(
      /prompt\.trim\(\)\.length === 0\s*\)\s*\{\s*setIsPromptWrapped\(false\)/u,
    );
  });

  it("does not flap densities on sub-pixel line-box rounding", () => {
    // One line, measured a shade over its nominal box. Treating that as a wrap
    // would toggle the shell on every keystroke.
    expect(isPromptHeightWrapped(16, 16)).toBe(false);
    expect(isPromptHeightWrapped(16.5, 16)).toBe(false);
    expect(isPromptHeightWrapped(32, 16)).toBe(true);
    // A missing or unparseable computed line-height falls back to the desktop
    // line box rather than reporting every prompt as wrapped.
    expect(isPromptHeightWrapped(16, Number.NaN)).toBe(false);
    expect(isPromptHeightWrapped(64, Number.NaN)).toBe(true);
  });
});
