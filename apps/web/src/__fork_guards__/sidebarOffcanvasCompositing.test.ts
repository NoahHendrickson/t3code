// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#sidebar-offcanvas-compositing`.
 *
 * The desktop panel slides off-canvas on `translate`, not on `left` / `right`.
 * The rules hang off upstream's `data-slot`, `data-collapsible` and
 * `data-side` hooks in `ui/sidebar.tsx`: rename any of them and the
 * stylesheet keeps parsing while the panel quietly goes back to animating
 * layout on every toggle.
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
const flat = (selector: string) => selector.replace(/\s+/gu, " ");
const rules = cssRules(readSibling("../theme.custom.css"));
const sidebar = readSibling("../components/ui/sidebar.tsx");

const ruleFor = (selector: string) => rules.find((rule) => flat(rule.selector) === selector);

const parked = (side: "left" | "right") =>
  ruleFor(
    `${MARKER} [data-slot="sidebar"][data-collapsible="offcanvas"][data-side="${side}"] [data-slot="sidebar-container"]`,
  );

describe("fork guard: sidebar-offcanvas-compositing", () => {
  it("transitions the panel on translate and width, never on left or right", () => {
    const container = ruleFor(`${MARKER} [data-slot="sidebar-container"]`);
    expect(container?.body).toMatch(/transition-property:\s*translate,\s*width/u);
    expect(container?.body).not.toMatch(/\b(?:left|right)\b/u);
  });

  it("parks a collapsed panel by translating it off its own edge", () => {
    // The edge stays pinned so `left` / `right` never change; only the
    // compositor-driven translate does. -100% / 100% of the panel's own width
    // is exactly the calc(var(--sidebar-width)*-1) upstream animated.
    const left = parked("left");
    expect(left?.body).toMatch(/left:\s*0/u);
    expect(left?.body).toMatch(/translate:\s*-100% 0/u);
    const right = parked("right");
    expect(right?.body).toMatch(/right:\s*0/u);
    expect(right?.body).toMatch(/translate:\s*100% 0/u);
  });

  it("keeps upstream's hooks the rules select on", () => {
    expect(sidebar).toContain('data-slot="sidebar-container"');
    expect(sidebar).toContain('data-collapsible={state === "collapsed" ? collapsible : ""}');
    expect(sidebar).toContain("data-side={side}");
    // Upstream still ships the layout transition on that element; the fork's
    // rule is what overrides it. If upstream ever composites the slide itself,
    // this customization can be retired.
    expect(sidebar).toContain("transition-[left,right,width]");
  });
});
