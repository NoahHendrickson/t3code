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

import { cn } from "../lib/utils";
import { CHROME_ROW_ICON_TINT } from "../custom/SidebarV2ChromeRows";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const layout = readSibling("../components/AppSidebarLayout.tsx");
const chrome = readSibling("../components/sidebar/SidebarChrome.tsx");
const desktopWindow = readSibling("../../../desktop/src/window/DesktopWindow.ts");

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

  it("matches the macOS control geometry from the header design", () => {
    expect(chrome).toContain("pl-[var(--workspace-controls-left)]");
    expect(layout).toContain('MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "80px"');
    // y=18 shares the header's optical axis with the toggle/brand; y=20 sat ~2pt low.
    expect(desktopWindow).toContain("trafficLightPosition: { x: 16, y: 18 }");
    expect(desktopWindow).not.toContain("trafficLightPosition: { x: 16, y: 20 }");
    const start = chrome.indexOf("<SidebarTrigger");
    const trigger = chrome.slice(start, chrome.indexOf("/>", start));
    expect(trigger).toContain("[&_svg]:size-5!");
    expect(trigger).toContain("[&_svg]:text-sidebar-muted-foreground/80!");
    expect(trigger).not.toContain("text-white");
    expect(layout).toContain('className="pointer-events-auto [&_svg]:size-5!"');
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

  it("keeps the sidebar header flat on every build", () => {
    expect(chrome).not.toContain("ForkSidebarHeaderBackdrop");
    expect(chrome).not.toContain("<SidebarStageBackdrop");
    expect(chrome).not.toContain("stage-dither");
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

  it("keeps the supplied Dev artwork on the remaining channel cues", () => {
    // The art is the designer's own PNG. An earlier revision reproduced it as a
    // Bayer dither in SVG, which scaled better but flattened the reference's
    // diagonal ramp — so "it still renders and still looks green" is exactly
    // the failure this asserts against.
    const art = readSibling("../custom/SidebarStageDitherArt.tsx");
    expect(art).toContain('from "./assets/sidebar-stage-dither-dev.png"');
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(
          new URL("../custom/assets/sidebar-stage-dither-dev.png", import.meta.url),
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
    expect(art).not.toMatch(/className="[^"]*\bstage-dither\b/u);
  });

  it("keeps the search and project rows fork-owned", () => {
    // Pure presentation. Fenced in place it left SidebarV2 carrying the whole
    // rewrite; here the fence is two call sites (actions + projects filter).
    const sidebarV2 = readSibling("../components/SidebarV2.tsx");
    expect(sidebarV2).toContain("<SidebarV2ChromeActionRows");
    expect(sidebarV2).toContain("<SidebarV2ProjectScopeRow");
    expect(sidebarV2).toContain("scopedProjectDisplayName=");
    expect(sidebarV2).not.toContain('data-testid="command-palette-trigger"');
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    // Composition / labels / testids — not internal row export names that a
    // helper collapse is free to erase.
    expect(rows).toContain("function ChromeLabeledAction");
    expect(rows).toContain('data-testid="command-palette-trigger"');
    expect(rows).toContain('testId="sidebar-v2-new-thread"');
    expect(rows).toContain('testId="sidebar-v2-add-project"');
    expect(rows).toContain('data-testid="sidebar-v2-project-filter"');
    expect(rows).toContain("New thread");
    expect(rows).toContain("Add project");
  });

  it("pays for the thread list's scroll gutter out of its own end padding", () => {
    // scrollbar-gutter:stable reserves the scrollbar inside the list's padding
    // box, so a symmetric px-2 is 8px of air on the left and 8 plus the
    // scrollbar on the right, and every card sits off-centre in its column.
    // The end padding gives that width back, and the gutter has to stay: the
    // compensation is meaningless without the thing it compensates for, so the
    // two only make sense together.
    const sidebarV2 = readSibling("../components/SidebarV2.tsx");
    expect(sidebarV2).toContain("[scrollbar-gutter:stable]");
    // One source for the 8. Spelling it once as a variable and reading it from
    // both sides is what stops a retune of the start padding leaving the end
    // subtracting from a stale base — three independent spellings of the same
    // number is how that drifts silently.
    expect(sidebarV2).toContain("[--sidebar-list-pad:--spacing(2)]");
    expect(sidebarV2).toContain("ps-(--sidebar-list-pad)");
    expect(sidebarV2).toContain(
      "pe-[calc(var(--sidebar-list-pad)-var(--sidebar-list-gutter,0px))]",
    );
    // And the width subtracted is measured, not assumed. --app-scrollbar-width
    // is only true where ::-webkit-scrollbar applies; on Firefox the reserved
    // gutter is the native width, or nothing at all under overlay scrollbars,
    // and a token-matching guard cannot see either. Reading the token here
    // again would reintroduce exactly that.
    const gutter = readSibling("../custom/useScrollGutterWidth.ts");
    expect(gutter).toContain("offsetWidth - node.clientWidth");
    expect(sidebarV2).toContain("ref={listScrollGutterRef}");
    // The token-based giveback is this file's own prior implementation —
    // pe-[calc(0.5rem-var(--app-scrollbar-width))], replaced by the measured
    // gutter in 56954bc8 — which makes it the likeliest thing a revert or a
    // wrong-side conflict resolution puts back, including *alongside* the
    // measured term, where the containment checks above stay green and the
    // last pe-* wins. Bounded to a pe-* utility so prose about the token
    // cannot trip it, and looser than the old exact literal so a re-spelling
    // like pe-[calc(var(--sidebar-list-pad)-var(--app-scrollbar-width))]
    // cannot sail past.
    expect(sidebarV2).not.toMatch(/pe-\[[^\]]*--app-scrollbar-width/u);
  });

  it("puts the exact brand lockup on the header's trailing edge", () => {
    expect(chrome).toMatch(/sidebar-brand[^"]*ml-auto/u);
    expect(chrome).not.toContain("ml-[var(--workspace-titlebar-content-left)]");
    expect(chrome).toMatch(/sidebar-brand[^"]*text-sidebar-foreground/u);
    expect(chrome).toContain("size-6 shrink-0");
    expect(chrome).toContain("text-[0.875rem] leading-4 font-medium");
    // The pixelated hack lived on the component, not the asset — a substring
    // check on the class list would not notice it coming back beside it.
    expect(chrome).not.toContain("image-rendering");
    // The mark's art is a 23x23 pixel grid drawn at a 24px slot. A bitmap can
    // only get there by resampling 23 cells onto 24 pixels, which blends every
    // cell into its neighbours — the blur the vector mark replaced. Keep it
    // vector, keep the viewBox on the 23-unit grid, and keep crispEdges so the
    // cells stay hard-edged at every DPR instead of antialiasing back to mush.
    const mark = NodeFS.readFileSync(
      NodeURL.fileURLToPath(new URL("../custom/assets/sidebar-brand-mark.svg", import.meta.url)),
      "utf8",
    );
    expect(mark).toContain('viewBox="0 0 23 23"');
    expect(mark).toContain('shape-rendering="crispEdges"');
    expect(mark).not.toMatch(/image-rendering|<image\b/u);
    // Every cell edge must land on the integer grid; a fractional coordinate is
    // the same smearing defect re-entering through the asset. The count keeps
    // the loop from passing vacuously, and the transform/<path> check pins the
    // geometry to plain rect attributes — an svgo pass or Figma re-export that
    // moves it into transforms or path data would otherwise hide fractional
    // coordinates from this guard entirely.
    const coords = [...mark.matchAll(/\s(?:x|y|width|height)="([^"]+)"/gu)];
    expect(coords.length).toBeGreaterThan(100);
    for (const coord of coords) {
      expect(coord[1]).toMatch(/^\d+$/u);
    }
    expect(mark).not.toMatch(/transform=|<path\b/u);
  });

  it("keeps the flat header independent of identification mode and honors the pill", () => {
    expect(chrome).not.toContain('=== "artwork"');
    expect(chrome).toContain('environmentIdentificationMode === "pill"');
    expect(chrome).toContain('data-environment-identification="pill"');
    const pill = chrome.slice(chrome.indexOf("{pillLabel ? ("), chrome.indexOf("</Badge>"));
    expect(pill).toContain("bg-sidebar-control-surface");
    expect(pill).toContain("text-sidebar-foreground");
    expect(pill).not.toContain("text-white");
  });

  it("keeps the chrome-row icon tint displacing the menu button's base dim", () => {
    // Upstream v0.0.30 gave sidebarMenuButtonVariants a parent-level icon pair
    // (muted-foreground at opacity-60) that outweighs an icon's own class, so
    // the fork rows counter it with a later same-slot pair that twMerge keeps.
    // Asserting the merged outcome rather than the source string is the point:
    // if upstream reshapes the selector ([&_svg], a data-slot rule, an !
    // modifier) so the pair stops conflicting, the dim survives the merge and
    // this reds while every source-string check stays green. The base is read
    // out of the cva call because upstream does not export it, and importing
    // the component just for its class string would drag the whole sidebar
    // module graph into this test.
    const sidebar = readSibling("../components/ui/sidebar.tsx");
    const base = /const sidebarMenuButtonVariants = cva\(\s*"([^"]+)"/u.exec(sidebar)?.[1];
    expect(base, "sidebarMenuButtonVariants base class not found").toBeTruthy();
    const merged = cn(base, CHROME_ROW_ICON_TINT);
    expect(merged).not.toMatch(/svg\]:opacity-60/u);
    expect(merged).toMatch(/svg\]:text-sidebar-muted-foreground\/80/u);
    expect(merged).toMatch(/svg\]:opacity-100/u);
    // One spelling: both chrome-row buttons reference the shared const, and
    // the literal exists only in its definition — a second paste is how the
    // two drifted apart before it was hoisted.
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    expect(rows.split("[&>svg]:opacity-100").length - 1).toBe(1);
    expect(rows.split("CHROME_ROW_ICON_TINT").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("keeps chrome type at 14px for actions and the Projects label", () => {
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    const type = /const CHROME_TYPE\s*=\s*"([^"]+)"/u.exec(rows)?.[1];
    expect(type).toBeDefined();
    expect(type).toContain("text-[0.875rem]");
    expect(type).not.toMatch(/\btext-xs\b/u);
    expect(type).not.toMatch(/\btext-sm\b/u);
    // Both the interactive control and the static Projects label read it.
    expect(rows).toContain("CHROME_TYPE");
    expect(rows.split("CHROME_TYPE").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("keeps Projects as a static label with an active-aware filter funnel", () => {
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    expect(rows).toMatch(/>\s*Projects\s*</u);
    expect(rows).toContain("ListFilterIcon");
    expect(rows).toContain("FolderPlusIcon");
    // Scope on-state: glyph lifts and aria/tooltip name the active project.
    expect(rows).toContain("data-active={isScoped");
    expect(rows).toContain("scopedProjectDisplayName");
    expect(rows).toContain("Filter threads by project — showing");
    expect(rows).toContain("TooltipPopup");
    // The label is not a menu trigger — the funnel owns the menu.
    expect(rows).not.toContain("ChevronsUpDownIcon");
    expect(rows).not.toContain("FolderOpenIcon");
  });
});
