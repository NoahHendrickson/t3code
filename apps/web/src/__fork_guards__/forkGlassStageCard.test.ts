// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-stage-card`.
 *
 * Under Glass every thread's chat view is a glass card 8px inside the stage,
 * with the gutter in the panel's colour and no seam. Losing the import, or
 * loading it before the palettes sheet, lets the stage ramp repaint the
 * gutter; and under the desktop glass the card and gutter must composite back
 * to the stage's reading value, or the transcript loses the opacity the
 * vibrancy entry protects.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const GLASS = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const PALETTE = `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;
const VIBRANCY = '[data-fork-sidebar-vibrancy="true"]';
const CHAT = "[data-chat-column-maximized-away]";
// The chat view, and the Automations page, which sits on the same card.
const ROOT = `:is(${CHAT},[data-fork-stage-card])`;

const sheet = readSibling("../theme.custom.glass-stage.css");
const rules = cssRules(sheet);
const palettes = readSibling("../theme.custom.palettes.css");

const compact = (value: string) => value.replace(/\s+/gu, "");
const flat = (value: string | undefined) => (value ?? "").replace(/\s+/gu, " ").trim();
const alphaOf = (body: string | undefined) =>
  Number(/rgb\(22 22 22 \/ (\d+)%\)/u.exec(body ?? "")?.[1] ?? Number.NaN);

describe("fork guard: fork-glass-stage-card", () => {
  it("loads after the palettes sheet", () => {
    const main = readSibling("../main.tsx");
    const palettesAt = main.indexOf('import "./theme.custom.palettes.css";');
    const stageAt = main.indexOf('import "./theme.custom.glass-stage.css";');
    expect(palettesAt).toBeGreaterThan(-1);
    expect(stageAt).toBeGreaterThan(palettesAt);
  });

  it("scopes every rule to the fork marker and Glass", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selector, `unscoped rule "${rule.selector}"`).toContain(GLASS);
      expect(rule.selector, `not scoped to Glass "${rule.selector}"`).toContain(PALETTE);
      // A filter cannot sample the native material: it flattens it to grey.
      expect(rule.body, `filter in ${rule.selector}`).not.toMatch(/backdrop-filter/u);
    }
  });

  it("paints the card inside the chat view at the root's inset, under its content", () => {
    // One declaration of the inset, at the Glass root and outside the
    // picture's switch; every reader takes it through var().
    const tokens = rules.find((rule) => rule.body.includes("--fork-glass-card-inset:"));
    expect(compact(tokens?.selector ?? "")).toBe(compact(`${GLASS}.dark${PALETTE}`));
    expect(tokens?.body).toMatch(/--fork-glass-card-inset:\s*8px/u);
    expect(tokens?.body).toContain("--fork-glass-card-inset-left: var(--fork-glass-card-inset)");
    expect(readSibling("../theme.custom.glass.css")).not.toContain("--fork-glass-card-inset:");
    const card = rules.find(
      (rule) =>
        compact(rule.selector).endsWith(`${ROOT}::before`) && !rule.selector.includes(VIBRANCY),
    );
    expect(flat(card?.body)).toContain(
      "inset: var(--fork-glass-card-inset) var(--fork-glass-card-inset) var(--fork-glass-card-inset) var(--fork-glass-card-inset-left);",
    );
    expect(card?.body).toContain("z-index: -1");
    expect(card?.body).toContain("pointer-events: none");
    // The draft's picture paints over the card: a different radius lets the
    // card's corners show round it.
    const radiusOf = (body: string | undefined) =>
      /border-radius:\s*([\w.]+)/u.exec(body ?? "")?.[1];
    const picture = cssRules(readSibling("../theme.custom.glass.css")).find((rule) =>
      compact(rule.selector).endsWith(`${CHAT}::after`),
    );
    expect(radiusOf(card?.body)).toBeDefined();
    expect(radiusOf(picture?.body)).toBe(radiusOf(card?.body));
    const root = rules.find((rule) => compact(rule.selector).endsWith(ROOT));
    expect(root?.body).toContain("isolation: isolate");
  });

  it("composites card over gutter back to the stage's reading value under the desktop glass", () => {
    const panel = alphaOf(/--fork-glass-panel:\s*(rgb\(22 22 22 \/ \d+%\))/u.exec(palettes)?.[1]);
    const stage = alphaOf(
      cssRules(palettes).find(
        (rule) =>
          rule.selector.includes(VIBRANCY) &&
          rule.selector.includes('[data-slot="sidebar-inset"]') &&
          !rule.selector.includes(":has(") &&
          rule.body.includes("background-image:"),
      )?.body,
    );
    const fill = alphaOf(
      rules.find(
        (rule) =>
          rule.selector.includes(VIBRANCY) && compact(rule.selector).endsWith(`${ROOT}::before`),
      )?.body,
    );
    expect(panel).toBeGreaterThan(0);
    expect(stage).toBeGreaterThan(panel);
    // 1 − (1 − card)(1 − panel), within a point of rounding.
    const composite = 100 - ((100 - fill) * (100 - panel)) / 100;
    expect(Math.abs(composite - stage)).toBeLessThanOrEqual(1);
  });

  it("names the Automations page's host, title and body, and styles each by name", () => {
    const page = readSibling("../custom/scheduled/ScheduledPage.tsx");
    for (const part of [
      "data-fork-stage-card",
      "data-fork-stage-card-title",
      "data-fork-stage-card-body",
    ]) {
      expect(page, `page lost ${part}`).toMatch(new RegExp(`\\b${part}=""`, "u"));
    }
    const title = rules.find((rule) => rule.selector.includes("[data-fork-stage-card-title]"));
    expect(compact(title?.selector ?? "")).toContain("[data-chat-header]");
    expect(title?.body).toContain("padding-left: calc(var(--fork-glass-card-inset-left) + 16px)");
    const body = rules.find((rule) => rule.selector.includes("[data-fork-stage-card-body]"));
    expect(body?.body).toContain("width: auto");
    expect(flat(body?.body)).toContain(
      "margin: 0 var(--fork-glass-card-inset) var(--fork-glass-card-inset) var(--fork-glass-card-inset-left);",
    );
    // By name, never by shape: a wrapped header or a banner between the two
    // would silently detach a structural selector.
    expect(sheet).not.toMatch(/\[data-fork-stage-card\]\s*>/u);
  });

  it("paints the gutter on both clients and drops the seam", () => {
    const gutters = rules.filter((rule) =>
      compact(rule.selector).endsWith(`[data-slot="sidebar-inset"]:has(${ROOT})`),
    );
    expect(gutters).toHaveLength(2);
    expect(gutters.every((rule) => rule.body.includes("var(--fork-glass-panel)"))).toBe(true);
    // The opaque arm must never reach the desktop glass: a fill there covers
    // the material.
    const opaque = gutters.find((rule) => rule.body.includes("background-color"));
    expect(compact(opaque?.selector ?? "")).toContain(`:not(${VIBRANCY})`);
    const seam = rules.find((rule) => rule.selector.includes('[data-slot="sidebar-container"]'));
    expect(seam?.body).toContain("border-color: var(--sidebar)");
  });
});
