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

    const panel = glassRules.find((rule) => rule.selector.includes('[data-sidebar-version="v2"]'));
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
    const panel = glassRules.find((rule) => rule.selector.includes('[data-sidebar-version="v2"]'));
    expect(panel).toBeDefined();
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

  it("keeps the transcript far more opaque than the sidebar", () => {
    // The stage carries a few percent of wallpaper so it shares the sidebar's
    // cast and the seam between them stops reading as a hard edge. It is not
    // glass: the transcript holds long-form text and has to survive a bright,
    // busy desktop, so its alpha stays high and well above the sidebar's.
    const readAlpha = (body: string, token = "background-color") => {
      const match = new RegExp(`${token}:\\s*rgb\\([^)]*/\\s*(\\d+)%\\s*\\)`, "u").exec(body);
      return match?.[1] === undefined ? null : Number(match[1]);
    };

    const inset = glassRules.find((rule) => rule.selector.includes('[data-slot="sidebar-inset"]'));
    expect(inset).toBeDefined();
    const stageAlpha = readAlpha(inset?.body ?? "");
    expect(stageAlpha, "the chat stage must declare an explicit alpha").not.toBeNull();
    // Floor, not a target. Vibrancy darkens and desaturates its sample before
    // the stage composites over it, so a few percent of wallpaper is below the
    // perceptual threshold on a surface this large — the tuning range that does
    // anything visible starts well under 90%.
    expect(stageAlpha).toBeGreaterThanOrEqual(80);

    const panel = glassRules.find((rule) => rule.selector.includes('[data-sidebar-version="v2"]'));
    const panelAlpha = readAlpha(panel?.body ?? "", "--sidebar");
    expect(panelAlpha, "the glass panel must declare an explicit alpha").not.toBeNull();
    expect(
      stageAlpha ?? 0,
      "the transcript must never be more transparent than the sidebar",
    ).toBeGreaterThanOrEqual(panelAlpha ?? 0);

    // Both surfaces must tint toward the same neutral, or they drift apart in
    // hue. Neutral on purpose under glass: the palette's cool base (B > R) reads
    // as a cast fighting the wallpaper rather than as a surface taking its
    // colour, so the glass tints flatten to R = G = B and let the desktop supply
    // the hue. The opaque palette stays cool — that is Cool Darker's identity.
    const stageTint = /rgb\((\d+) (\d+) (\d+)\s*\//u.exec(inset?.body ?? "");
    expect(stageTint, "the stage tint must be an explicit rgb triple").not.toBeNull();
    const [, sr, sg, sb] = stageTint ?? [];
    expect(new Set([sr, sg, sb]).size, "glass tints must be neutral (R = G = B)").toBe(1);
  });

  it("keeps sidebar fills translucent under glass so rows do not punch holes", () => {
    const panel = glassRules.find((rule) => rule.selector.includes('[data-sidebar-version="v2"]'));
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
