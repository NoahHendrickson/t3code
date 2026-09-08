// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-list-animation`.
 *
 * The animation math lives next to the plugin
 * (`custom/sidebarV2ListAnimation.test.ts`). This file only guards the seam
 * inside upstream's `Sidebar.tsx`: that the list still mounts AutoAnimate,
 * and that it uses the fork plugin rather than the options object whose insert
 * path holds at opacity 0 for half of a 1.5× ease-in.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const animation = readSibling("../custom/sidebarV2ListAnimation.ts");

describe("fork guard: sidebar-v2-list-animation", () => {
  it("wires the symmetric list plugin into SidebarV2's AutoAnimate mount", () => {
    expect(sidebar).toContain('import { autoAnimate } from "@formkit/auto-animate"');
    expect(sidebar).toContain(
      'import { sidebarV2ListAnimation } from "~/custom/sidebarV2ListAnimation"',
    );
    expect(sidebar).toContain("autoAnimate(node, sidebarV2ListAnimation)");
    // The options form is what reintroduces the asymmetric insert path.
    expect(sidebar).not.toContain('autoAnimate(node, { duration: 150, easing: "ease-out" })');
  });

  it("keeps add as the reverse of remove", () => {
    expect(animation).toContain("SIDEBAR_V2_LIST_REMOVE_KEYFRAMES");
    expect(animation).toContain("SIDEBAR_V2_LIST_ADD_KEYFRAMES");
    expect(animation).toContain('transform: "scale(.98)", opacity: 0');
    expect(animation).toContain('transform: "scale(1)", opacity: 1');
    expect(animation).toContain("prefers-reduced-motion: reduce");
    // No removal is singled out. The card a collapsed group keeps for the
    // open route used to leave instantly because it left in the navigation
    // frame; the keep now reads a deferred route key so it leaves a frame
    // later and takes the same fade as every other row.
    expect(animation).not.toContain("data-fork-collapsed-keep");
    expect(animation).not.toMatch(/duration: \w+ \? 0 : duration/u);
  });

  it("lets a collapsed group's kept card leave after the navigation frame", () => {
    // Opening another thread is the frame the new chat view mounts. A kept
    // card removed in that frame fades late and the rows below slide up
    // unevenly; deferring the key the keep reads moves the removal into the
    // quiet re-render after it. The highlight stays on the live key.
    expect(sidebar).toContain("const keptRouteThreadKey = useDeferredValue(routeThreadKey);");
    const keep = /threadsVisibleInProjectSection\(\{([\s\S]*?)\}\)/u.exec(sidebar)?.[1];
    expect(keep).toBeDefined();
    expect(keep).toContain("keptRouteThreadKey");
    expect(keep).not.toContain("routeThreadKey");
    expect(sidebar).toContain("isActive={routeThreadKey === threadKey}");
  });
});
