// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-composer-banner-surface`.
 *
 * Composer banners are the top section of the composer card. Wherever a card
 * is still drawn (light, the expanded stack's floating notices, the peek cap)
 * it takes the composer fill under the composer hairline instead of
 * upstream's severity tint; a dark attached banner draws no card at all and
 * sits at the vessel's full width flush on the prompt surface instead of
 * upstream's inset, tucked, frosted card.
 *
 * The colour half works by re-pointing the `--chat-composer-attached-*`
 * variables ComposerBanner's Surface and Peek both read. The geometry half is
 * keyed on the Root's slot, the attachment wrapper's slot, the shoulder-tab
 * attribute and the notice stack's drawer attribute. A sync that renames any
 * of them, or paints the peek's severity edge some other way, quietly brings
 * the blue inset slab back — everything still compiles.
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
const CARD = '[data-slot="composer-banner"][data-composer-banner-surface="attached"]';
const theme = readSibling("../theme.custom.css");
const banner = readSibling("../components/chat/ComposerBanner.tsx");
const bannerStack = readSibling("../components/chat/ComposerBannerStack.tsx");
const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const stashBadge = readSibling("../components/chat/ComposerStashBadge.tsx");
const chatView = readSibling("../components/ChatView.tsx");
const rules = cssRules(theme);

/**
 * Leaf rules that style the banner element itself, in file order — not the
 * wrapper rules that merely match on it through `:has()`, and not its
 * pseudo-element.
 */
function cardRules(predicate: (rule: (typeof rules)[number]) => boolean) {
  return rules.filter(
    (rule) =>
      flat(rule.selector).includes(CARD) &&
      flat(rule.selector).includes("[data-fork-composer-vessel]") &&
      !flat(rule.selector).includes('[data-slot="composer-banner-attachment"]') &&
      !flat(rule.selector).endsWith("::before") &&
      predicate(rule),
  );
}

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
  it("leaves the banner unpainted so it reads as vessel floor", () => {
    // The design has no card here: a banner is vessel floor above the prompt
    // box, the way the control row is vessel floor below it. Restating the
    // vessel's colour would double-composite on the palettes whose floor is
    // translucent, so the rule paints nothing and only clears the tuck.
    const [rule, ...rest] = cardRules(() => true);
    expect(rest).toHaveLength(0);
    expect(rule?.selector).toContain(`${MARKER}.dark`);
    expect(rule?.selector).toContain("[data-composer-shoulder-tab]");
    expect(rule?.body).toMatch(/--chat-composer-attachment-overlap:\s*0px/u);
    for (const painted of ["background", "border", "box-shadow"]) {
      expect(rule?.body, painted).not.toContain(painted);
    }
  });

  it("leaves the prompt box all four of its corners under a banner", () => {
    // Only the Questions card fuses with the prompt into one box; a notice
    // must not square the box that is drawn beneath it.
    const squared = rules.filter(
      (rule) =>
        rule.selector.includes("[data-fork-composer-box]") &&
        rule.body.includes("border-top-left-radius"),
    );
    expect(squared).toHaveLength(1);
    expect(squared[0]?.selector).toContain("[data-fork-pending-user-input]");
  });

  it("pulls the attachment wrappers out to the vessel's full width", () => {
    const rule = rules.find(
      (candidate) =>
        flat(candidate.selector).includes('[data-slot="composer-banner-attachment"]:has(') &&
        flat(candidate.selector).includes(CARD) &&
        candidate.body.includes("width: 100%"),
    );
    expect(rule?.selector).toContain(`${MARKER}.dark`);
    expect(rule?.body).toMatch(/max-width:\s*none/u);
    expect(rule?.body).toMatch(/margin:\s*0/u);
  });

  it("drops the frosted backdrop the tuck existed for", () => {
    const rule = rules.find(
      (candidate) =>
        flat(candidate.selector).includes(CARD) && flat(candidate.selector).endsWith("::before"),
    );
    expect(rule?.body).toMatch(/display:\s*none/u);
  });

  it("gives notices and the activity strip the design's metrics", () => {
    const rule = rules.find((candidate) =>
      candidate.body.includes("--composer-banner-icon-column"),
    );
    expect(rule?.selector).toContain('[data-composer-banner-drawer="true"]');
    expect(rule?.selector).toContain('[data-chat-composer-activity-strip="true"]');
    expect(rule?.body).toMatch(/--composer-banner-icon-column:\s*16px/u);
    expect(rule?.body).toMatch(/padding:\s*16px 8px 16px 16px/u);
    expect(rule?.body).toMatch(/font-size:\s*14px/u);
  });

  it("targets the slots and attributes the geometry is keyed on", () => {
    expect(componentSource("Root")).toContain('data-slot="composer-banner"');
    const attachment = componentSource("Attachment");
    expect(attachment).toContain('data-slot="composer-banner-attachment"');
    // The tuck the card rule zeroes, and the shoulder-tab margin still reads.
    expect(attachment).toContain("-mb-[calc(1rem+1px)]");
    expect(banner).toContain("--chat-composer-attachment-overlap");
    for (const slot of [
      "composer-banner-icon",
      "composer-banner-content",
      "composer-banner-actions",
    ]) {
      expect(banner, slot).toContain(`data-slot="${slot}"`);
    }
    expect(bannerStack).toContain('data-composer-banner-drawer="true"');
    expect(chatComposer).toContain('data-chat-composer-activity-strip="true"');
    expect(stashBadge).toContain("data-composer-shoulder-tab");
  });

  it("keeps the notice primary action on the fork's white Primary", () => {
    // --primary is #ffffff on every fork palette, so the design's white
    // Primary button is variant="default" rather than upstream's outline.
    const fenced = chatView.matchAll(
      /fork:begin fork-composer-banner-surface[\s\S]*?fork:end fork-composer-banner-surface/gu,
    );
    const bodies = [...fenced];
    expect(bodies).toHaveLength(2);
    for (const [body] of bodies) {
      expect(body).toContain('variant="default"');
    }
  });
});
