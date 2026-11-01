// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-glass-scroll-pill`.
 * Without the hook, the pill stamp or the cutoff's named gradients, the pill
 * is a 6% wash over live transcript text, and everything still compiles.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_PILL_HOLE_ATTRIBUTE, pillHoleStyle } from "../custom/forkGlassScrollPillHole";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const GLASS_GATE =
  ':root[data-fork="noahhendrickson-t3code"][data-fork-sidebar-vibrancy="true"].dark[data-fork-theme="cool-darker"]';

const flat = (text: string) => text.replace(/\s+/gu, " ").trim();
const palettes = cssRules(readSibling("../theme.custom.palettes.css"));
const theme = cssRules(readSibling("../theme.custom.css"));
const glassRule = (selector: string) =>
  palettes.find((rule) => flat(rule.selector) === `${GLASS_GATE} ${selector}`);

describe("fork guard: fork-glass-scroll-pill", () => {
  it("measures the pill from the lane that wraps it", () => {
    const overlays = readSibling("../components/chat/TimelineOverlays.tsx");
    expect(overlays).toMatch(
      /fork:begin fork-glass-scroll-pill[^]*?useForkGlassScrollPillHole\(props\.bottom\)[^]*?fork:end fork-glass-scroll-pill[^]*?ref=\{forkPillLaneRef\}[^]*?className="chat-scroll-to-bottom/u,
    );
    // The hook finds the pill by this stamp and paints it through the glass variant.
    expect(overlays).toContain('data-scroll-to-end="true"');
    expect(overlays).toContain('variant="glass"');
    // And the scroller as the lane's sibling, by the cutoff class.
    expect(readSibling("../components/chat/MessagesTimeline.tsx")).toContain(
      '"fork-timeline-cutoff"',
    );
  });

  it("paints the popover's wash on the stage, not the floor estimate", () => {
    const rest = glassRule("[data-scroll-to-end].surface-glass");
    expect(flat(rest?.body ?? "")).toContain(
      "background: linear-gradient(var(--fork-composer-vessel-bg), var(--fork-composer-vessel-bg));",
    );
    const hover = glassRule("[data-scroll-to-end].surface-glass:is(:hover, [data-pressed])");
    expect(hover?.body).toBeDefined();
    for (const rule of [rest, hover]) {
      expect(rule?.body).not.toContain("--fork-popup-glass-floor");
    }
  });

  it("cuts the pill out of the transcript as a third cutoff layer", () => {
    const base = theme.find(
      (rule) =>
        rule.selector.includes(".fork-timeline-cutoff") &&
        !rule.selector.includes(".topbar-scroll-fade") &&
        rule.body.includes("--fork-timeline-cutoff-mask:"),
    );
    expect(base?.body).toContain("--fork-timeline-top-mask:");
    expect(flat(base?.body ?? "")).toContain(
      "mask-image: var(--fork-timeline-top-mask), var(--fork-timeline-cutoff-mask);",
    );

    const hole = glassRule(`.fork-timeline-cutoff[${FORK_PILL_HOLE_ATTRIBUTE}]`);
    const body = flat(hole?.body ?? "");
    expect(body).toContain(
      "mask-image: var(--fork-timeline-top-mask), var(--fork-timeline-cutoff-mask), var(--fork-pill-hole-image, none);",
    );
    expect(body).toMatch(/(?<!-webkit-)mask-composite: add, subtract, add;/u);
    expect(body).toContain("-webkit-mask-composite: source-over, source-out, source-over;");
  });

  it("places the hole on the pill's frame in the scroller's box", () => {
    const style = pillHoleStyle(
      // A pressed pill reports a scaled rect; the centre and layout size still land the frame.
      { centerX: 500, centerY: 700, width: 120, height: 24, radius: 33554400 },
      { x: 200, y: 100 },
    );
    expect(style["--fork-pill-hole-x"]).toBe("240px");
    expect(style["--fork-pill-hole-y"]).toBe("588px");
    expect(style["--fork-pill-hole-w"]).toBe("120px");
    expect(style["--fork-pill-hole-h"]).toBe("24px");
    expect(decodeURIComponent(style["--fork-pill-hole-image"] ?? "")).toContain("rx='12'");
  });
});
