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
      /\[data-fork-composer-density="slim"\][\s\S]{0,200}--fork-composer-radius:\s*12px/u,
    );
    // Both short shells take it; `collapsed` stopped reporting itself as slim.
    expect(theme).toMatch(
      /\[data-fork-composer-density="collapsed"\][\s\S]{0,200}--fork-composer-radius:\s*12px/u,
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

  it("pins both divergences from Figma, on the rules that carry them", () => {
    // Two deliberate divergences, and both need pinning: someone reconciling
    // this stylesheet against the design would otherwise "correct" either one
    // and think they were fixing a typo.
    //
    // Routed through cssRules rather than a bare toMatch. The previous version
    // asserted /font-size:\s*12px;\s*\n\s*font-weight:\s*500/ against the whole
    // file, which was satisfied by any such pair anywhere in ~1000 lines and
    // depended on where `vp fmt` happened to break the line. Anchoring to the
    // selector is what makes it a guard rather than a coincidence detector.
    const rules = cssRules(theme);

    const pillRule = rules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-control-row]") &&
        rule.body.includes("font-size"),
    );
    expect(pillRule, "no rule sets the pill type").toBeDefined();
    expect(pillRule!.body, "pills are drawn at 10px; the fork uses 12px").toMatch(
      /font-size:\s*12px/u,
    );

    // The prompt was previously unpinned entirely — the placeholder test checks
    // the combinator, not the size the combinator exists to deliver, so a
    // revert to Figma's 12px passed every assertion in this file.
    const promptRule = rules.find(
      (rule) =>
        rule.selector.includes('[data-testid="composer-editor"]') &&
        rule.body.includes("font-size"),
    );
    expect(promptRule, "no rule sets the prompt type").toBeDefined();
    expect(promptRule!.body, "prompt is drawn at 12px; the fork uses 14px").toMatch(
      /font-size:\s*14px/u,
    );
    // The more consequential half: the manifest states outright that the 96/48
    // box heights are derived from this line box, so it does not scale with the
    // font.
    expect(promptRule!.body, "the 96/48 heights are derived from this").toMatch(
      /line-height:\s*16px/u,
    );
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
    expect(chatView, "ChatView stopped passing contextStrip").toContain(
      "contextStrip: composerContextStrip",
    );
    expect(chatView).toContain("<BranchToolbar");
    // Memoised, and that is correctness rather than tuning: ChatComposer is
    // memo'd and every other prop it takes is a stable reference or a
    // primitive, so an inline element here is the one new object identity per
    // render and defeats the memo outright on a ~2900-line component that
    // re-renders throughout a streaming turn.
    expect(chatView, "the contextStrip element must stay memoised").toMatch(
      /const composerContextStrip = useMemo\(/u,
    );
    // The memo is only as stable as its inputs; this one was a bare arrow.
    expect(chatView).toMatch(/const onStartFromOriginChange = useCallback\(/u);
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
      isNarrowViewport: false,
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
      isNarrowViewport: false,
    };
    expect(resolveComposerDensity({ ...base, isPromptWrapped: true })).toBe("tall");
    // A panel that owns the box's internals — approval, pending question, plan
    // banner — has nowhere to put its action row in a single 24px line.
    expect(resolveComposerDensity({ ...base, hasComposerHeader: true })).toBe("tall");
  });

  it("gives the collapsed mobile composer its own density, not a flavour of slim", () => {
    // Returning "slim" here put `data-fork-composer-density="slim"` on a
    // composer the slim layout was never applied to, so every call site had to
    // re-exclude the collapsed case by hand and two things named "slim"
    // disagreed. It outranks every other input.
    expect(
      resolveComposerDensity({
        isDraftHero: true,
        isPromptWrapped: true,
        hasComposerHeader: true,
        isCollapsedMobile: true,
        isNarrowViewport: true,
      }),
    ).toBe("collapsed");
    // ...which is what lets the call sites read as plain equality.
    expect(chatComposer).toContain('const isComposerSlim = composerDensity === "slim"');
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
    const latchHook = readSibling("../custom/useComposerPromptWrapLatch.ts");
    expect(latchHook).toMatch(
      /prompt\.trim\(\)\.length === 0\s*\)\s*\{\s*setIsPromptWrapped\(false\)/u,
    );
  });

  it("never uses the slim shell on a phone", () => {
    // At 375px the model pill and send button leave the flex-1 editor ~90-150px,
    // and the placeholder — an absolute overlay outside the editor's scroll box
    // — wraps to several lines and paints straight through the 48px box. It is
    // also stable: the overlay never changes the observed editor height, so the
    // wrap latch cannot rescue it.
    expect(
      resolveComposerDensity({
        isDraftHero: false,
        isPromptWrapped: false,
        hasComposerHeader: false,
        isCollapsedMobile: false,
        isNarrowViewport: true,
      }),
    ).toBe("tall");
  });

  it("shortens the empty-state hint in the slim shell instead of truncating it", () => {
    // The absolute placeholder is invisible to the wrap latch (empty prompt ⇒
    // latch false; placeholder only exists when empty). Truncating the 64-char
    // default hint would eat `$use skills` / `/ commands`, which have no other
    // discovery surface — so slim uses a shorter string that still names all
    // three affordances, and tall keeps the long one.
    expect(chatComposer).toMatch(
      /isComposerSlim\s*\?\s*"Ask anything, @tag, \$skills, \/ commands"/u,
    );
    expect(chatComposer).toContain(
      "Ask anything, @tag files/folders, $use skills, or / for commands",
    );
    // Truncation was considered and declined: no ellipsis rule on the
    // placeholder sibling, so a sync that reintroduces one is a regression.
    const rules = cssRules(theme);
    const placeholderTruncate = rules.find(
      (rule) =>
        rule.selector.includes('[data-testid="composer-editor"]') &&
        rule.selector.includes("~") &&
        (rule.body.includes("text-overflow") || rule.body.includes("ellipsis")),
    );
    expect(placeholderTruncate, "slim placeholder must not truncate").toBeUndefined();
  });

  it("keeps the branch controls reachable while collapsed, and gates modes on approval", () => {
    // Two upstream behaviours the control row has to preserve. Upstream showed
    // BranchToolbar while collapsed (gated on showComposerContextStrip alone),
    // so env mode and branch were switchable without raising the keyboard; and
    // it unmounted the whole footer during an approval, so the mode toggles
    // could not be flipped for a run whose approval was unresolved.
    expect(chatComposer, "the control row must render in every density").not.toMatch(
      /composerDensity === "collapsed" \? null : \(\s*<ComposerControlRow/u,
    );
    expect(chatComposer).toMatch(/left=\{activePendingApproval \? null : composerRunControls\}/u);
  });

  it("keeps the pill restyle off the primary CTAs", () => {
    // ComposerPrimaryActions renders real buttons into the same containers:
    // the h-9 Implement/Refine split button and the pending-question
    // Previous/Next/Submit set. This stylesheet is unlayered, so it beat their
    // Tailwind utilities outright — squashing them to 24px pills and, in dark,
    // painting their labels #a6a6a6 on a filled primary background.
    expect(chatComposer).toContain('data-fork-composer-pills="true"');
    const pillRules = cssRules(theme).filter(
      (rule) => /height:\s*24px/u.test(rule.body) && rule.selector.includes("button"),
    );
    expect(pillRules.length).toBeGreaterThan(0);
    for (const rule of pillRules) {
      expect(rule.selector, `pill rule reaches the whole footer: ${rule.selector}`).not.toMatch(
        /\[data-chat-composer-(footer|inline-actions)\]/u,
      );
    }
  });

  it("repaints the drag-over state the surface rule would otherwise swallow", () => {
    // Upstream signals it with bg-accent/45 + ring-1 on this element. Tailwind
    // v4 utilities live in @layer utilities and this stylesheet is unlayered,
    // so both the tint and the ring — itself a box-shadow — lost to the pinned
    // background and hairline, leaving a drag with no feedback at all.
    expect(chatComposer).toContain("data-fork-composer-drag-over=");
    // Outline, asserted by name. A box-shadow declaration on this element was
    // measured in the browser not to land — the tint from the same rule did —
    // so reverting to one would silently return the composer to a drag state
    // advertised by a 4% fill and nothing else.
    const dragRule = cssRules(theme).find((rule) =>
      rule.selector.includes("[data-fork-composer-drag-over]"),
    );
    expect(dragRule, "no drag-over rule").toBeDefined();
    expect(dragRule!.body).toMatch(/outline:\s*2px solid/u);
    expect(dragRule!.body).toMatch(/background:/u);
  });

  it("hides only the left slot's separators, not BranchToolbar's own", () => {
    // BranchToolbar draws a separator between the environment picker and the
    // env-mode/branch pair on multi-environment projects. A row-wide rule hid
    // it and merged two groups the design keeps apart.
    const separatorRules = cssRules(theme).filter(
      (rule) =>
        rule.selector.includes('[data-slot="separator"]') &&
        rule.selector.includes("fork-composer-control-row"),
    );
    expect(separatorRules.length).toBeGreaterThan(0);
    for (const rule of separatorRules) {
      expect(rule.selector).toContain('[data-fork-composer-control-row-slot="left"]');
    }
  });

  it("clears the latch when the draft changes, not just when the prompt empties", () => {
    // ChatComposer is not keyed by thread, so it survives thread switches and
    // so does the latch. Leaving a wrapped prompt and arriving at a thread whose
    // saved draft is a short one-liner would otherwise render the new thread in
    // the tall shell and strand it there — the prompt is non-empty, so the
    // release effect never fires, and the observer only ever latches on.
    const latchHook = readSibling("../custom/useComposerPromptWrapLatch.ts");
    expect(latchHook).toMatch(/setIsPromptWrapped\(false\);\s*\n\s*\}, \[draftKey\]\)/u);
    expect(chatComposer).toContain("useComposerPromptWrapLatch(");
    expect(chatComposer).toContain("scopedThreadKey(composerDraftTarget)");
  });

  it("paints the surface by name, so an added sibling cannot inherit the box", () => {
    // This was `[data-fork-composer-box] > div`, which held only because the
    // frame has exactly one child today. Upstream adding a drop overlay or a
    // banner inside it would paint a second frosted card with its own hairline,
    // and every text-matching assertion here would stay green.
    expect(chatComposer).toContain('data-fork-composer-surface="true"');
    const positional = cssRules(theme).filter((rule) =>
      /\[data-fork-composer-box\]\s*>\s*div/u.test(rule.selector),
    );
    expect(positional, "composer paint is coupled to child position").toHaveLength(0);
  });

  it("keeps the wrap observer in fork-owned code, not in the hot upstream file", () => {
    // The pure half of the density rule was always fork-owned; leaving the
    // observer and the latch state inline in a 2.9k-line upstream file split
    // one rule across two places and added fences to the file least able to
    // absorb them.
    const latchHook = readSibling("../custom/useComposerPromptWrapLatch.ts");
    expect(latchHook).toContain("ResizeObserver");
    expect(chatComposer).toMatch(/useComposerPromptWrapLatch\(\s*\n?\s*prompt,/u);
    // Named helpers rather than "ResizeObserver": ChatComposer legitimately
    // runs three observers of its own, for footer compactness and menu
    // positioning, so the broad check cannot tell the fork's from upstream's.
    expect(chatComposer).not.toContain("nextWrapLatch");
    expect(chatComposer).not.toContain("isPromptHeightWrapped");
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
