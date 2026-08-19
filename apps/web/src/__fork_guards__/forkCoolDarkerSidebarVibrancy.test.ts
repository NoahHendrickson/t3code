// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Wallpaper glass has two ways to fail silently. If the CSS gate slips from the
 * resolved marker back to the palette, every web and Linux client running Cool
 * Darker paints transparent holes into an opaque window. If the marker survives
 * but the desktop method is unregistered, the sidebar goes glassy with nothing
 * behind it. Both are invisible to a macOS-only smoke test, so they are pinned
 * here.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import {
  FORK_SIDEBAR_VIBRANCY_ATTRIBUTE,
  syncForkSidebarVibrancy,
} from "../custom/forkSidebarVibrancy";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = [
  readSibling("../theme.custom.css"),
  readSibling("../theme.custom.palettes.css"),
].join("\n");
const themeRules = cssRules(theme);
const forkVibrancy = readSibling("../custom/forkSidebarVibrancy.ts");
const forkTheme = readSibling("../custom/forkTheme.ts");
const customizations = readSibling("../../../../.fork/customizations.yaml");
const desktopHandlers = readSibling("../../../desktop/src/ipc/DesktopIpcHandlers.ts");
const desktopPreload = readSibling("../../../desktop/src/preload.ts");
const desktopMethod = readSibling("../../../desktop/src/fork/ForkSidebarVibrancy.ts");

/** Every glass rule in the theme, by the marker the renderer stamps. */
const glassRules = themeRules.filter((rule) =>
  rule.selector.includes(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE),
);

/**
 * The panel block that carries the glass tint. Two glass rules now target the
 * v2 panel — this one and the opaque neutral fill for while it floats — so they
 * are told apart by the overlay gate rather than by which comes first in the
 * file. Everything about alpha, derived tokens and row washes belongs to this
 * one; the floating block deliberately gives alpha up.
 */
const glassPanelRule = glassRules.find(
  (rule) =>
    rule.selector.includes('[data-sidebar-version="v2"]') &&
    rule.selector.includes(':not([data-fork-sidebar-overlay="true"])'),
);

/** Minimal Element stand-in — the helper only ever sets/removes one attribute. */
function makeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
  } as unknown as Element & { attributes: Map<string, string> };
}

describe("fork guard: fork-cool-darker-sidebar-vibrancy", () => {
  it("registers the glass as a fork customization", () => {
    expect(customizations).toContain("id: fork-cool-darker-sidebar-vibrancy");
    expect(desktopMethod).toContain("fork:set-sidebar-vibrancy");
  });

  it("gates every glass rule on the resolved marker, never on the palette alone", () => {
    expect(glassRules.length).toBeGreaterThan(0);
    for (const rule of glassRules) {
      expect(rule.selector, `glass rule must also pin the fork marker: ${rule.selector}`).toContain(
        MARKER,
      );
      expect(rule.selector, `glass rule must be scoped to Cool Darker: ${rule.selector}`).toContain(
        `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`,
      );
    }

    // The inverse: no rule may go transparent off the palette alone.
    for (const rule of themeRules) {
      if (!rule.selector.includes(`[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`)) continue;
      if (rule.selector.includes(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)) continue;
      expect(
        rule.body,
        `Cool Darker must stay opaque without the glass marker: ${rule.selector}`,
      ).not.toContain("transparent");
    }
  });

  it("beats the inline chrome background with !important", () => {
    // syncBrowserChromeTheme assigns documentElement/body backgroundColor as
    // inline styles, which outrank any normal author rule. Dropping !important
    // here paints the stage straight over the vibrancy view — the glass fails
    // silently, with every other part of the pipeline still reporting success.
    const chrome = glassRules.find(
      (rule) => rule.selector.includes("body") && !rule.selector.includes("data-slot"),
    );
    expect(chrome).toBeDefined();
    expect(chrome?.body).toMatch(/background-color:\s*transparent\s*!important/u);

    const useTheme = readSibling("../hooks/useTheme.ts");
    expect(useTheme).toContain("document.body.style.backgroundColor");
  });

  it("clears every opaque bg-background inside the stage, by class not by name", () => {
    // Glass is exactly one layer: the inset paints it, everything inside that
    // fills opaquely is cleared. Enumerating those children by selector was a
    // standing regression — each new one silently covered the stage and looked
    // like "the CSS isn't loading". A single class match covers the ones
    // upstream has today and the ones it adds later.
    const clears = glassRules.filter((rule) => /background-color:\s*transparent;/u.test(rule.body));
    const byClass = clears.find(
      (rule) =>
        rule.selector.includes('[data-slot="sidebar-inset"]') &&
        rule.selector.includes(".bg-background"),
    );
    expect(byClass, "the stage must clear bg-background descendants by class").toBeDefined();
    expect(
      byClass?.selector,
      "a child combinator only reaches ChatView's root, not the header below it",
    ).not.toMatch(/sidebar-inset"\]\s*>\s*\.bg-background/u);

    // Both known painters really are descendants carrying that exact class: the
    // chat header, and ChatView's own root that fills the inset edge to edge.
    const chatView = readSibling("../components/ChatView.tsx");
    expect(chatView).toMatch(/data-chat-header[\s\S]{0,200}bg-background/u);
    expect(chatView).toMatch(/className="relative flex min-h-0[^"]*bg-background"/u);

    // A utility that @applies the fill inlines it into its own rule, so the
    // class match above cannot see it and the surface paints an opaque slab
    // across the column. Every such utility has to be named here explicitly —
    // this is the one clear that does not maintain itself.
    // Tailwind v4 @utility syntax, matching the backdrop-filter scan below —
    // the old `.class {` form matched nothing against upstream's v0.0.33
    // index.css and left this clause silently dead.
    const indexCss = readSibling("../index.css");
    const applied = [
      ...indexCss.matchAll(/@utility ([a-z-]+)\s*\{[^}]*?@apply[^;]*\bbg-background\b[^;]*;/gu),
    ]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    // surface-subheader was the canary here until upstream retired it in the
    // v0.0.33 cycle (the subheaders carry literal bg-background now). The list
    // is empty today; the loop below is what matters — any future utility that
    // @applies the fill must be named in the fork's clear rule.
    for (const name of applied) {
      expect(
        byClass?.selector ?? "",
        `.${name} @applies an opaque fill the class match cannot reach and must be cleared`,
      ).toContain(`.${name}`);
    }
  });

  it("washes the cards in the stage instead of leaving them opaque", () => {
    // `--card` is an opaque #1c1f22, and roughly thirty components paint it
    // inside the inset — the right panel's surface tiles most visibly. Each one
    // reads as a rectangle of missing wallpaper. Washed rather than cleared,
    // because a card is meant to sit a step above the stage.
    const card = glassRules.find(
      (rule) =>
        rule.selector.includes('[data-slot="sidebar-inset"]') && rule.selector.includes(".bg-card"),
    );
    expect(card, "cards in the stage must be washed by class, not enumerated").toBeDefined();
    expect(
      card?.body,
      "an opaque or tinted fill here stops the wallpaper at the card's edge",
    ).toMatch(/background-color:\s*rgb\(255 255 255 \/ \d+%\)/u);

    // Scoped to the inset: the sidebar block redefines --card to the panel tint,
    // so a wash there would paint a second layer over surfaced glass.
    expect(
      card?.selector,
      "the sidebar carries its own --card and must not take this wash",
    ).not.toContain('[data-sidebar-version="v2"]');

    // State precedence. Written like every other rule here — unlayered and
    // marker-scoped — this outranks `hover:bg-accent/60` as well, and the
    // "Open a surface" tiles lose their hover feedback entirely. The wash has to
    // join Tailwind's cascade rather than sit above it, so that every state
    // variant keeps winning without being enumerated.
    expect(
      card?.atRules ?? [],
      "the card wash must live in Tailwind's utilities layer, not above it",
    ).toContain("@layer utilities");
    expect(
      card?.selector,
      ":where() is what drops the marker to zero specificity so state variants still win",
    ).toContain(":where(");

    // The utility it must not beat is real. Upstream's v0.0.33 restyle split
    // the tile into a shared bg-card surface constant plus a per-tile
    // hover:bg-accent/60 className, so the two classes are asserted apart.
    const tabs = readSibling("../components/RightPanelTabs.tsx");
    expect(tabs, "the surface tiles are the case this protects").toContain("bg-card");
    expect(tabs, "the surface tiles are the case this protects").toContain("hover:bg-accent/60");

    // Redefining --card instead would look tidier and take the transcript's code
    // blocks with it, because index.css derives from that token.
    const indexCss = readSibling("../index.css");
    expect(indexCss, "--card is a derived token, so it must not be redefined under glass").toMatch(
      /--code-background:\s*color-mix\([^;]*var\(--card\)/u,
    );
    // The sidebar's own blocks redefine --card for the panel deliberately, and
    // nothing there derives from it. The stage is where the derived tokens land.
    for (const rule of glassRules) {
      if (!rule.selector.includes('[data-slot="sidebar-inset"]')) continue;
      expect(
        rule.body,
        `--card feeds --code-background and --surface-raised: ${rule.selector}`,
      ).not.toMatch(/^\s*--card:/mu);
    }
  });

  it("leaves the one element that paints the tint alone", () => {
    // sidebar-inner carries `bg-sidebar`. Clearing it along with the structural
    // wrappers makes the sidebar fully transparent, at which point the panel
    // opacity has nothing to apply to and tuning it does nothing — the failure
    // looks like "the theme update isn't loading" rather than a CSS bug.
    for (const rule of glassRules) {
      if (!rule.body.includes("background: transparent")) continue;
      expect(
        rule.selector,
        `sidebar-inner paints the glass tint and must keep its fill: ${rule.selector}`,
      ).not.toContain('[data-slot="sidebar-inner"]');
    }

    const sidebar = readSibling("../components/ui/sidebar.tsx");
    expect(sidebar).toMatch(/bg-sidebar[\s\S]*?data-slot="sidebar-inner"/u);
  });

  it("clears the scrim and keeps every backdrop-filter out of the composer", () => {
    // The scrim has to stay cleared: any fill there compounds with the stage
    // and reads darker than the rest of the column. What used to make that safe
    // was the vessel's blur hiding the transcript; the cutoff mask does that now
    // (see forkComposerShell), which is also what makes the filter removable.
    const scrim = glassRules.find((rule) =>
      rule.selector.includes('[data-chat-composer-overlay="true"]'),
    );
    expect(scrim, "the transcript scrim must still be cleared under glass").toBeDefined();
    expect(scrim?.body).toMatch(/background:\s*none/u);

    // A filter and the native material are alternatives, not layers: the
    // NSVisualEffectView is behind the window, so Chromium flattens the region
    // to composite the filter and the wallpaper is lost.
    for (const rule of glassRules) {
      for (const [, value] of rule.body.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gu)) {
        expect(
          value?.trim(),
          `a filter here flattens the vibrancy it sits on: ${rule.selector}`,
        ).toBe("none");
      }
    }

    // Upstream's own glass utilities carry filters as well, and they open OVER
    // the sidebar and the stage — each one flattens the patch it covers. Read
    // the class list out of index.css rather than hardcoding it, so a new
    // `*-glass` utility upstream fails here instead of shipping a grey card.
    // Upstream's v0.0.33 index.css declares these as Tailwind v4 @utility
    // blocks rather than bare classes, so the scan matches that syntax.
    const utilities = readSibling("../index.css");
    const filtered = new Set(
      [
        ...utilities.matchAll(
          /@utility ([a-z-]+)\s*\{[^}]*?(?<!-webkit-)backdrop-filter:\s*(?!none)[^;]+;/gu,
        ),
      ].map((match) => match[1] ?? ""),
    );
    const clearRule = glassRules.find((rule) => /backdrop-filter:\s*none/u.test(rule.body));
    for (const name of filtered) {
      expect(
        clearRule?.selector ?? "",
        `.${name} filters its backdrop and must be cleared under glass`,
      ).toContain(`.${name}`);
    }
    expect(filtered.size, "index.css should still declare the glass utilities").toBeGreaterThan(2);

    // Stated rather than merely absent, so re-adding one is a deliberate act.
    const cleared = glassRules.find(
      (rule) =>
        rule.selector.includes("[data-fork-composer-vessel]") &&
        /backdrop-filter:\s*none/u.test(rule.body),
    );
    expect(cleared, "the composer must clear backdrop-filter explicitly").toBeDefined();
    expect(cleared?.body).toContain("-webkit-backdrop-filter: none");
    expect(
      cleared?.selector,
      "the context chips carry the same clear — they are outside the vessel",
    ).toContain("[data-fork-composer-context-row]");
  });

  it("builds the composer out of washes, never out of tints", () => {
    // Every composer surface is an alpha over what is behind it. A tinted fill
    // anywhere here stops the wallpaper at the composer's edge.
    const stage = glassRules.find((rule) => rule.body.includes("--fork-context-chip-bg:"));
    expect(stage, "glass must state its own composer fills").toBeDefined();
    const valueOf = (token: string) => {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`, "u").exec(stage?.body ?? "")?.[1];
      expect(declaration, `${token} must be stated under glass`).toBeDefined();
      return declaration ?? "";
    };
    const alphaOf = (token: string) => {
      const declaration = valueOf(token);
      expect(declaration, `${token} must be a white wash`).toMatch(/^rgb\(255 255 255 \/ \d+%\)$/u);
      return Number(/(\d+)%/u.exec(declaration)?.[1]);
    };

    // Thin enough that the glass reads through the tray.
    const tray = alphaOf("--fork-composer-vessel-bg");
    expect(tray).toBeLessThanOrEqual(12);

    // The input darkens instead of lifting: a white wash here would compound
    // with the tray into a lighter box.
    const well = valueOf("--fork-composer-bg");
    expect(well, "the input must darken toward the stage, not lift off the tray").toContain(
      "var(--background)",
    );
    expect(well, "a white wash here lifts the input instead of recessing it").not.toContain(
      "255 255 255",
    );

    // The ring is the tray's alpha applied a second time; below the tray hides it.
    expect(alphaOf("--fork-composer-border")).toBeGreaterThanOrEqual(tray);

    // Focus must read as the same ring brightening, not a different material.
    expect(alphaOf("--fork-composer-border-focus")).toBeGreaterThan(
      alphaOf("--fork-composer-border"),
    );

    // Chips reach the ring's colour from one layer lower — the bare stage — so
    // they absorb both alphas where the ring only needs one.
    expect(alphaOf("--fork-context-chip-bg")).toBeGreaterThan(alphaOf("--fork-composer-border"));
    expect(alphaOf("--fork-context-chip-bg-hover")).toBeGreaterThan(
      alphaOf("--fork-composer-vessel-bg"),
    );

    // The row is outside the vessel, which is why the chips need their own alpha
    // and why the filter clear names them separately.
    const shell = readSibling("../custom/ComposerShell.tsx");
    const contextRow = shell.indexOf('data-fork-composer-context-row="true"');
    const vessel = shell.indexOf('"data-fork-composer-vessel": "true"');
    expect(contextRow).toBeGreaterThan(-1);
    expect(vessel).toBeGreaterThan(-1);
    expect(contextRow, "the context row must still precede the vessel").toBeLessThan(vessel);
  });

  it("hands the design-mode chrome the stage's own glass", () => {
    // The panel is an ordinary child of the inset, so anything it paints
    // composites ON the stage and can only move it toward opaque. Painting
    // nothing is the most glass available to it, not the least effort.
    const design = glassRules.find((rule) => rule.selector.includes("[data-fork-design-panel]"));
    expect(design, "the design panel must take the glass").toBeDefined();
    expect(
      design?.selector,
      "the layers rail takes the same treatment — half of this pair is the regression",
    ).toContain("[data-fork-design-layers]");

    const valueOf = (token: string) => {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`, "u").exec(design?.body ?? "")?.[1];
      expect(declaration, `${token} must be stated under glass`).toBeDefined();
      return declaration ?? "";
    };
    const alphaOf = (token: string) => {
      const declaration = valueOf(token);
      expect(declaration, `${token} must be a white wash`).toMatch(/^rgb\(255 255 255 \/ \d+%\)$/u);
      return Number(/(\d+)%/u.exec(declaration)?.[1]);
    };

    // A wash here would make the panel LESS glassy than the column it docks into.
    expect(valueOf("--fork-design-surface"), "the panel must paint nothing at all").toBe(
      "transparent",
    );

    // Fields sit on the bare stage once the surface paints nothing, so they
    // carry the chips' doubled alpha rather than a ring's single one.
    const field = alphaOf("--fork-design-field");
    // Only the colour picker's hex input reads --muted, at /40. Keeping the two
    // equal preserves the relationship that makes that input recede.
    expect(alphaOf("--muted"), "--muted must track the field token").toBe(field);

    // A lift, not a fill: over a field it has to stay readable as a selected
    // segment, which means it cannot be the heavier of the two.
    expect(
      alphaOf("--accent"),
      "--accent lifts off the field it sits in; heavier than the field inverts them",
    ).toBeLessThanOrEqual(field);

    // The token is the single dial. A fill hardcoded onto the container would
    // sail past this whole block, which is how the panel became a slab while the
    // rail beside it went glassy — the rail happened to use the bg-background
    // utility the class-based clear catches, and the panel did not.
    const panel = readSibling("../custom/designMode/panel/ForkDesignPanel.tsx");
    expect(panel).toContain("data-fork-design-panel");
    expect(panel, "the panel surface must stay driven by the token").toContain(
      "bg-[var(--fork-design-surface)]",
    );
    const rail = readSibling("../custom/designMode/ForkLayersTree.tsx");
    expect(rail).toContain("data-fork-design-layers");
    expect(rail, "the rail leans on the class-based bg-background clear").toContain(
      "bg-background",
    );
  });

  it("pins tokens that index.css derives from the panel fill", () => {
    // --sidebar-icon-color mixes in var(--sidebar). Once the panel fill carries
    // alpha, so does the glyph, and the wallpaper shows through the icons
    // themselves. Any token index.css derives from --sidebar has to be restated
    // opaquely inside the glass block.
    const indexCss = readSibling("../index.css");
    const derived = [
      ...indexCss.matchAll(/(--[\w-]+):\s*color-mix\([^;]*var\(--sidebar\)[^;]*\);/gu),
    ]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    expect(derived).toContain("--sidebar-icon-color");

    const panel = glassPanelRule;
    for (const token of derived) {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`, "u").exec(panel?.body ?? "");
      expect(
        declaration,
        `${token} derives from --sidebar and must be pinned under glass`,
      ).not.toBeNull();
      expect(declaration?.[1], `${token} must be opaque under glass`).toMatch(/^#[0-9a-f]{6}$/iu);
    }
  });

  it("goes opaque while the panel floats over the transcript", () => {
    // Glass assumes the panel sits beside the chat column with the window behind
    // it. In overlay mode (narrow window, or the right preview panel open) the
    // panel floats OVER the transcript, and a translucent fill there shows
    // message text through the thread rows rather than wallpaper.
    // Found by the translucent fill rather than by glassPanelRule, which is
    // defined by carrying this very gate — asserting it there would be
    // circular. The invariant is the other direction: whatever rule paints a
    // see-through panel must be gated off overlay.
    const panel = glassRules.find(
      (rule) =>
        rule.selector.includes('[data-sidebar-version="v2"]') &&
        /--sidebar:[^;]*\/\s*\d+%/u.test(rule.body),
    );
    expect(panel, "some glass rule must paint the translucent panel").toBeDefined();
    expect(
      panel?.selector,
      "the glass panel tint must not apply while the sidebar overlays the chat column",
    ).toContain(':not([data-fork-sidebar-overlay="true"])');

    // The flag is on the wrapper and the version attribute sits below it, so the
    // gate has to be the ancestor form.
    expect(panel?.selector).toMatch(
      /\[data-slot="sidebar-wrapper"\]:not\(\[data-fork-sidebar-overlay="true"\]\)/u,
    );
    const overlay = readSibling("../custom/narrowChatOverlay.ts");
    expect(overlay).toContain('SIDEBAR_OVERLAY_ATTRIBUTE = "data-fork-sidebar-overlay"');
    expect(overlay).toContain("targets.wrapper.setAttribute(SIDEBAR_OVERLAY_ATTRIBUTE");
  });

  it("keeps the floating panel neutral rather than falling back to the palette tint", () => {
    // Opaque is correct while it floats, cool-tinted is not: every surface
    // around it under glass is neutral, so the palette's #181b1e reads as a
    // different material rather than as the same panel without its glass.
    const floating = glassRules.find(
      (rule) =>
        rule.selector.includes('[data-sidebar-version="v2"]') &&
        rule.selector.includes('[data-fork-sidebar-overlay="true"]') &&
        !rule.selector.includes(":not("),
    );
    expect(floating, "the floating panel must state its own fill").toBeDefined();

    const fill = /--sidebar:\s*([^;]+);/u.exec(floating?.body ?? "")?.[1];
    expect(fill, "--sidebar must be stated for the floating panel").toBeDefined();
    // Opaque on purpose — alpha is exactly what this state gives up, so the
    // "keep alpha" rule the docked block follows must not be applied here.
    expect(fill, "the floating panel is opaque by design").toMatch(/^#[0-9a-f]{6}$/iu);

    const channels = /^#(..)(..)(..)$/u.exec(fill ?? "")?.slice(1) ?? [];
    expect(new Set(channels).size, `the floating panel must be neutral, got ${fill}`).toBe(1);
  });

  it("applies the material to the main window only", () => {
    // syncAllAppearance walks every BrowserWindow, which includes the PiP
    // preview window (its own fill, no fork CSS) and the WSL splash. Handing
    // those the material makes a previewed page without an opaque background
    // render see-through, and restoring repaints them with the app's fill.
    expect(desktopMethod).not.toContain("electronWindow.syncAllAppearance");
    expect(desktopMethod).toContain("electronWindow.main");
    expect(desktopMethod).toContain("isDestroyed()");

    // The PiP window really does carry its own fill, so this is not theoretical.
    const previewManager = readSibling("../../../desktop/src/preview/Manager.ts");
    expect(previewManager).toMatch(/backgroundColor:\s*"#[0-9a-f]{6}"/iu);
  });

  it("keeps the material live while the window is not key", () => {
    // NSVisualEffectView follows the window's active state by default, so the
    // glass drops to a flat inactive fill as soon as focus leaves the app. The
    // CSS behind it stays translucent either way, so it presents as the whole
    // app going opaque rather than as a window losing focus.
    const window = readSibling("../../../desktop/src/window/DesktopWindow.ts");
    expect(window).toMatch(/visualEffectState:\s*"active"/u);
    // Electron requires the pair; a visualEffectState without a vibrancy does
    // nothing at all.
    expect(window).toMatch(/vibrancy:\s*FORK_VIBRANCY_MATERIAL[\s\S]{0,120}visualEffectState/u);
  });

  it("keeps the transcript far more opaque than the sidebar", () => {
    // The stage carries a few percent of wallpaper so it shares the sidebar's
    // cast and the seam between them stops reading as a hard edge. It is not
    // glass: the transcript holds long-form text and has to survive a bright,
    // busy desktop, so its alpha stays high and well above the sidebar's.
    const readAlpha = (body: string, token = "background-color") => {
      const match = new RegExp(`${token}:\\s*rgb\\([^)]*/\\s*(\\d+)%\\s*\\)`, "u").exec(body);
      return match?.[1] === undefined ? null : Number(match[1]);
    };

    const stageRules = glassRules.filter(
      (rule) =>
        rule.selector.includes('[data-slot="sidebar-inset"]') &&
        rule.body.includes("background-image:"),
    );
    const inset = stageRules.find((rule) => !rule.selector.includes(":has("));
    const masked = stageRules.find((rule) => rule.selector.includes(":has(.fork-timeline-cutoff)"));
    expect(inset, "the stage must paint a fill of its own").toBeDefined();
    expect(
      masked,
      "the ramp must be scoped to the mask that licenses it, not to every inset",
    ).toBeDefined();

    const stopsOf = (body: string) =>
      [...body.matchAll(/rgb\((\d+) (\d+) (\d+)\s*\/\s*(\d+)%\)/gu)].map((match) => ({
        tint: [match[1], match[2], match[3]],
        alpha: Number(match[4]),
      }));

    // The chat stage is a gradient, thinning toward the floor where the cutoff
    // mask has already ended the transcript. Every stop keeps the flat fill's
    // rules.
    const stops = stopsOf(masked?.body ?? "");
    expect(stops.length, "the chat stage must declare explicit stops").toBeGreaterThan(0);

    // SidebarInset carries `bg-background`, an opaque fill that paints UNDER a
    // background-image. Without this the gradient composites over #141618 and
    // the glass silently does nothing — the same class of failure as the
    // !important on the chrome background.
    expect(
      inset?.body,
      "the utility's opaque fill must be cleared for the gradient to show",
    ).toMatch(/background-color:\s*transparent/u);

    // TRAP: `surface-grain` on the same element sets background-repeat and a
    // 128px background-size too. Override only the image and the gradient
    // inherits both and tiles down the column.
    const grain = readSibling("../index.css");
    expect(grain, "the grain utility still sets the properties this defends against").toMatch(
      /@utility surface-grain \{[^}]*background-repeat:\s*repeat[^}]*background-size:/u,
    );
    expect(inset?.body, "the gradient must not inherit the grain's tiling").toMatch(
      /background-repeat:\s*no-repeat/u,
    );
    expect(inset?.body, "the gradient must not inherit the grain's 128px size").toMatch(
      /background-size:\s*100% 100%/u,
    );

    // An absolute floor for every stop: below this the column stops being a
    // reading surface.
    const topAlpha = stops[0]?.alpha ?? 0;
    for (const stop of stops) {
      expect(stop.alpha, "no part of the stage may go below 80%").toBeGreaterThanOrEqual(80);
      expect(stop.alpha, "no stop may exceed the reading area").toBeLessThanOrEqual(topAlpha);
    }

    const panel = glassPanelRule;
    const panelAlpha = readAlpha(panel?.body ?? "", "--sidebar");
    expect(panelAlpha, "the glass panel must declare an explicit alpha").not.toBeNull();
    // The READING AREA, not every stop: the gradient's lower stops sit below the
    // cutoff mask, where there is no long-form text to protect.
    expect(
      topAlpha,
      "the reading area must never be more transparent than the sidebar",
    ).toBeGreaterThanOrEqual(panelAlpha ?? 0);

    // Settings, Usage and the empty state share this element with no mask to
    // end anything, so the licence the ramp takes does not reach them: every
    // stop of the unmasked fill answers to the sidebar.
    for (const stop of stopsOf(inset?.body ?? "")) {
      expect(
        stop.alpha,
        "an unmasked stage holds long-form text and may not go under the sidebar",
      ).toBeGreaterThanOrEqual(panelAlpha ?? 0);
    }

    // Neutral on purpose under glass: the palette's cool base reads as a cast
    // fighting the wallpaper, so the tints flatten to R = G = B and let the
    // desktop supply the hue. The opaque palette stays cool.
    for (const stop of [...stops, ...stopsOf(inset?.body ?? "")]) {
      expect(new Set(stop.tint).size, "glass tints must be neutral (R = G = B)").toBe(1);
    }
    // One triple across both fills: a stop that also shifts hue reads as a
    // colour wash down the column rather than as the stage thinning, and the
    // masked and unmasked stages have to be the same material.
    expect(
      new Set([...stops, ...stopsOf(inset?.body ?? "")].map((stop) => stop.tint.join(","))).size,
    ).toBe(1);
  });

  it("keeps sidebar fills translucent under glass so rows do not punch holes", () => {
    const panel = glassPanelRule;
    expect(panel).toBeDefined();
    // An opaque hex here is the "opaque plaque" regression: the row would hide
    // the wallpaper the panel is showing.
    for (const token of ["--sidebar", "--sidebar-row-hover", "--sidebar-row-selected"]) {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`, "u").exec(panel?.body ?? "");
      expect(declaration, `${token} missing from the glass panel`).not.toBeNull();
      expect(declaration?.[1], `${token} must keep alpha under glass`).toMatch(/\/\s*\d+%/u);
    }
  });

  it("stamps the marker from the resolved answer, not the request", async () => {
    const root = makeRoot();

    // Desktop says yes.
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: () => Promise.resolve(true),
    };
    await expect(syncForkSidebarVibrancy(true, root)).resolves.toBe(true);
    expect(root.attributes.get(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe("true");

    // Desktop says no (non-darwin): the marker must not survive.
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: () => Promise.resolve(false),
    };
    await expect(syncForkSidebarVibrancy(true, root)).resolves.toBe(false);
    expect(root.attributes.has(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);

    // A rejecting bridge is not glass either.
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: () => Promise.reject(new Error("no window")),
    };
    await expect(syncForkSidebarVibrancy(true, root)).resolves.toBe(false);
    expect(root.attributes.has(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);

    delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  });

  it("never asks for glass on a web client or when disabled", async () => {
    const root = makeRoot();
    delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;

    // No bridge at all — the browser build.
    await expect(syncForkSidebarVibrancy(true, root)).resolves.toBe(false);
    expect(root.attributes.has(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);

    const requests: boolean[] = [];
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: (enabled: boolean) => {
        requests.push(enabled);
        return Promise.resolve(enabled);
      },
    };
    await expect(syncForkSidebarVibrancy(false, root)).resolves.toBe(false);
    expect(requests).toEqual([false]);

    delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  });

  it("ignores a superseded sync so palette flips cannot stamp out of order", async () => {
    // The caller fires this without awaiting, so Cool Darker -> Dark -> Cool
    // Darker can resolve in any order. Only the newest request may write the
    // marker, or a stale answer re-enables glass the user has already left.
    const root = makeRoot();
    let releaseFirst: ((value: boolean) => void) | undefined;
    const gate = new Promise<boolean>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge = {
      setSidebarVibrancy: (enabled: boolean) => {
        call += 1;
        return call === 1 ? gate : Promise.resolve(enabled);
      },
    };

    const stale = syncForkSidebarVibrancy(true, root);
    const fresh = syncForkSidebarVibrancy(false, root);
    await expect(fresh).resolves.toBe(false);

    // The superseded call now answers "glass is on" — it must not be believed.
    releaseFirst?.(true);
    await expect(stale).resolves.toBe(true);
    expect(root.attributes.has(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);

    delete (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  });

  it("never lets the renderer choose the window's opaque restore colour", () => {
    // An earlier cut shipped Cool Darker's stage colour as the restore fill on
    // every call, so switching to Light, Dark, Cool Dark or either Neutral
    // palette repainted the window with #141618. The renderer only knows the
    // palette it is moving to; the main process resolves the colour from
    // nativeTheme instead.
    expect(forkVibrancy).not.toMatch(/opaqueBackground|COOL_DARKER_BACKGROUND/u);
    expect(desktopPreload).toMatch(/setSidebarVibrancy:\s*\(enabled: boolean\)/u);
    expect(desktopMethod).toContain("Electron.nativeTheme.shouldUseDarkColors");

    // The two colours are DesktopWindow's, mirrored because that helper is
    // module-private. If it changes, this fails rather than drifting.
    const desktopWindow = readSibling("../../../desktop/src/window/DesktopWindow.ts");
    const source =
      /getInitialWindowBackgroundColor[^}]*?\?\s*"(#[0-9a-f]{6})"\s*:\s*"(#[0-9a-f]{6})"/iu.exec(
        desktopWindow,
      );
    expect(source, "DesktopWindow's background helper changed shape").not.toBeNull();
    expect(desktopMethod).toContain(`"${source?.[1]}"`);
    expect(desktopMethod).toContain(`"${source?.[2]}"`);
  });

  it("keeps one owner for the window fill while glass is live", () => {
    // syncWindowAppearance also writes setBackgroundColor. Without this gate an
    // OS appearance change repaints the window opaque under a DOM that still
    // says glass is on — it dies with no marker update.
    const desktopWindow = readSibling("../../../desktop/src/window/DesktopWindow.ts");
    expect(desktopWindow).toContain("isForkGlassActive()");
    expect(desktopWindow).toMatch(
      /if \(!isForkGlassActive\(\)\) \{[\s\S]{0,160}setBackgroundColor\(getInitialWindowBackgroundColor/u,
    );
    // The flag lives apart from both writers; importing either from the other
    // closes a cycle.
    const glassState = readSibling("../../../desktop/src/fork/ForkGlassState.ts");
    expect(glassState).toContain("export function isForkGlassActive");
    expect(desktopMethod).toContain("setForkGlassActive(enabled)");
  });

  it("keeps the desktop method fork-owned and off the upstream contract", () => {
    // Registered, or the marker lands with no material behind it.
    expect(desktopHandlers).toContain("setForkSidebarVibrancy");
    expect(desktopPreload).toContain("forkDesktopBridge");

    // The whole point of the separate world key: DesktopBridge stays upstream's.
    expect(desktopPreload).toMatch(/satisfies DesktopBridge\);/u);
    const bridgeObject = desktopPreload.slice(
      desktopPreload.indexOf('contextBridge.exposeInMainWorld("desktopBridge"'),
      desktopPreload.indexOf("satisfies DesktopBridge);"),
    );
    expect(bridgeObject).not.toContain("setSidebarVibrancy");

    // macOS-only, and the renderer is told what actually happened.
    expect(desktopMethod).toContain('platform === "darwin"');
    expect(desktopMethod).toContain("return enabled;");

    // forkTheme drives it outside the synchronous chrome repaint, and owns the
    // palette decision so the helper imports nothing back — the cycle that
    // previously forced call-time indirection to dodge a TDZ crash.
    expect(forkTheme).toContain("syncForkSidebarVibrancy");
    expect(forkVibrancy).not.toContain('from "./forkTheme"');
    expect(forkVibrancy).toContain(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE);
  });
});
