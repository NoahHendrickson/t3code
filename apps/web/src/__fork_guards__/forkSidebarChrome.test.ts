// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Moving the collapse toggle into the sidebar header creates one way to brick
 * the app: the toggle now unmounts with the panel it collapses. Two things stop
 * that — the floating control still renders while the sidebar is shut, and the
 * keybinding is registered above both. Most of this file is about those two.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { resolveForkSidebarHeaderArt } from "../custom/SidebarHeaderBackdrop";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const layout = readSibling("../components/AppSidebarLayout.tsx");
const chrome = readSibling("../components/sidebar/SidebarChrome.tsx");

describe("fork guard: fork-sidebar-chrome", () => {
  it("still offers a toggle while the sidebar is collapsed", () => {
    // The inline toggle leaves with the panel. Without this branch a collapsed
    // sidebar can only be reopened by keyboard or by finding the rail.
    expect(layout).toContain("if (isSidebarVisible) return null;");
    expect(layout).toContain("data-sidebar-control");
  });

  it("registers the toggle keybinding above the button that can unmount", () => {
    // Order matters, not just presence: an early return placed before the
    // effect would make the shortcut itself conditional on the sidebar being
    // open — the one state in which you need it most.
    const effect = layout.indexOf('!== "sidebar.toggle"');
    const earlyReturn = layout.indexOf("if (isSidebarVisible) return null;");
    expect(effect).toBeGreaterThanOrEqual(0);
    expect(earlyReturn).toBeGreaterThan(effect);
  });

  it("draws the toggle inside the sidebar header on every viewport", () => {
    // Hiding it above `md` was correct while the desktop toggle floated
    // elsewhere. Left in place it would hide the only toggle an open sidebar
    // has on desktop. Scoped to the element rather than the file so prose about
    // the class cannot satisfy or break the check.
    const start = chrome.indexOf("<SidebarTrigger");
    expect(start).toBeGreaterThanOrEqual(0);
    const trigger = chrome.slice(start, chrome.indexOf("/>", start));
    expect(trigger).not.toContain("md:hidden");
  });

  it("clears the macOS traffic lights", () => {
    // The floating control used this inset; the inline toggle inherits the same
    // problem, and without it the button lands under the window buttons.
    expect(chrome).toContain("pl-[var(--workspace-controls-left)]");
  });

  it("draws the fork's dither on the Dev channel and leaves Nightly alone", () => {
    // Nightly is the control: it is the one label still routed to upstream's
    // own art, so a change that collapsed every channel onto one artwork fails
    // here.
    const backdrop = readSibling("../components/SidebarStageBackdrop.tsx");
    expect(backdrop).toContain("<SidebarStageDitherArt");
    expect(backdrop).toContain("NightlySkyArt");
    expect(backdrop).not.toContain("stage-blueprint");
  });

  it("gives the sidebar header artwork on every build, release included", () => {
    // The point of the split: upstream renders header art only on a non-prod
    // build. A regression here is invisible in dev — where art shows either way
    // — and only surfaces as a bare header in the packaged app.
    expect(chrome).toContain("<ForkSidebarHeaderBackdrop");
    // Behaviour, not source text: "Alpha" is the label a packaged fork build
    // carries, and upstream classifies it as no-art.
    expect(resolveForkSidebarHeaderArt("Alpha")).toBe("release");
    expect(resolveForkSidebarHeaderArt("Dev")).toBe("dev");
    expect(resolveForkSidebarHeaderArt("Nightly")).toBe("nightly");
  });

  it("leaves the send button and auth screen gated on the build channel", () => {
    // Those two are what still say "this is a Dev build" now that the sidebar
    // no longer does. Both must keep testing the variant rather than rendering
    // unconditionally.
    for (const path of [
      "../components/chat/ComposerPrimaryActions.tsx",
      "../components/auth/AuthSurfaceShell.tsx",
    ]) {
      const file = readSibling(path);
      expect(file, `${path} stopped gating its stage art`).toMatch(/stage(?:Backdrop)?Variant \?/u);
      expect(file).not.toContain("ForkSidebarHeaderBackdrop");
    }
  });

  it("keeps the release and dev builds on different artwork", () => {
    // The one thing this split exists for: telling a dev build from a release
    // build at a glance. Both tones resolving to the same file still renders
    // and still looks right in isolation, which is why it needs asserting.
    const art = readSibling("../custom/SidebarStageDitherArt.tsx");
    expect(art).toContain("release: releaseDitherUrl");
    expect(art).toContain("dev: devDitherUrl");
    for (const asset of ["sidebar-stage-dither.png", "sidebar-stage-dither-dev.png"]) {
      expect(
        NodeFS.existsSync(
          NodeURL.fileURLToPath(new URL(`../custom/assets/${asset}`, import.meta.url)),
        ),
        `${asset} is missing`,
      ).toBe(true);
    }
  });

  it("paints the supplied artwork rather than regenerating it", () => {
    // The art is the designer's own PNG. An earlier revision reproduced it as a
    // Bayer dither in SVG, which scaled better but flattened the reference's
    // diagonal ramp — so "it still renders and still looks green" is exactly
    // the failure this asserts against.
    const art = readSibling("../custom/SidebarStageDitherArt.tsx");
    expect(art).toContain('from "./assets/sidebar-stage-dither.png"');
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(
          new URL("../custom/assets/sidebar-stage-dither.png", import.meta.url),
        ),
      ),
    ).toBe(true);
  });

  it("covers rather than tiles the band", () => {
    // The source ramps diagonally, so any repeat butts a light edge against a
    // dark one and draws a seam at every tile boundary.
    const art = readSibling("../custom/SidebarStageDitherArt.tsx");
    expect(art).toContain("bg-cover");
    expect(art).toContain("bg-no-repeat");
  });

  it("ends the band on a hard edge instead of upstream's dissolve", () => {
    // Upstream masks its art out and ramps a gradient ::after over it. Both
    // have to be switched off for this variant, and only for this variant.
    const theme = readSibling("../theme.custom.css");
    expect(theme).toMatch(
      /\.sidebar-stage-backdrop:has\(\.stage-dither\)[\s\S]{0,200}mask-image:\s*none/u,
    );
    expect(theme).toMatch(
      /\.sidebar-stage-backdrop:has\(\.stage-dither\)::after\s*\{[^}]*background:\s*none/u,
    );
  });

  it("keeps the search and project rows fork-owned", () => {
    // ~150 lines of pure presentation. Fenced in place it left SidebarV2
    // carrying the whole rewrite; here the fence is two call sites.
    const sidebarV2 = readSibling("../components/SidebarV2.tsx");
    expect(sidebarV2).toContain("<SidebarV2SearchRow");
    expect(sidebarV2).toContain("<SidebarV2ProjectScopeRow");
    expect(sidebarV2).not.toContain('aria-label="Filter threads by project"');
    expect(sidebarV2).not.toContain('data-testid="command-palette-trigger"');
  });

  it("puts the brand on the header's trailing edge", () => {
    expect(chrome).toMatch(/sidebar-brand[^"]*ml-auto/u);
    expect(chrome).not.toContain("ml-[var(--workspace-titlebar-content-left)]");
  });
});
