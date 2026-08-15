/**
 * Fork sidebar glass — see `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Cool Darker is the only palette that asks the desktop shell for native macOS
 * vibrancy, so its sidebar shows the wallpaper the way Cursor's does. Every
 * other palette — and every non-desktop client — stays opaque.
 *
 * The renderer never assumes the glass turned on. `setSidebarVibrancy` resolves
 * with what the main process actually applied (false off macOS, false with no
 * desktop bridge), and only that resolved value stamps the DOM marker. The CSS
 * gate hangs off the marker rather than off the palette, so a Linux or web
 * client running Cool Darker keeps solid fills instead of painting holes into
 * an opaque window.
 */
import { COOL_DARKER_BACKGROUND, COOL_DARKER_THEME, type ForkPalettePreference } from "./forkTheme";

export const FORK_SIDEBAR_VIBRANCY_ATTRIBUTE = "data-fork-sidebar-vibrancy";

/**
 * `forkTheme` imports this module to drive the sync, so both constants are read
 * inside the functions rather than at module scope. Hoisting either into a
 * top-level `const` reintroduces the import cycle as a TDZ crash on load.
 */

/** Palettes that want wallpaper glass. Cool Darker is deliberately the only one. */
function wantsVibrancy(palette: ForkPalettePreference): boolean {
  return palette !== null && palette === COOL_DARKER_THEME;
}

/** Stage colour to repaint the window with whenever the glass goes away. */
function opaqueFallback(): string {
  return COOL_DARKER_BACKGROUND;
}

type ForkDesktopBridge = {
  readonly setSidebarVibrancy: (enabled: boolean, opaqueBackground: string) => Promise<boolean>;
};

/**
 * Read off `globalThis`, not `window`. In the renderer the two are the same
 * object; in a non-DOM test environment only `globalThis` exists, and reaching
 * for `window` there would make the helper silently untestable.
 */
function readBridge(): ForkDesktopBridge | null {
  const bridge = (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  if (typeof bridge !== "object" || bridge === null) return null;
  const candidate = bridge as { setSidebarVibrancy?: unknown };
  return typeof candidate.setSidebarVibrancy === "function" ? (bridge as ForkDesktopBridge) : null;
}

function stampMarker(root: Element, enabled: boolean): void {
  if (enabled) {
    root.setAttribute(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE, "true");
  } else {
    root.removeAttribute(FORK_SIDEBAR_VIBRANCY_ATTRIBUTE);
  }
}

/**
 * Asks the desktop shell to match `palette`, then stamps the marker with the
 * result. Resolves with whether the glass is actually on.
 *
 * Clearing runs synchronously before the request so switching away from Cool
 * Darker never leaves a frame of transparent CSS over an already-opaque window
 * — that flash reads as the sidebar blinking black.
 */
export async function syncForkSidebarVibrancy(
  palette: ForkPalettePreference,
  root: Element | null = typeof document === "undefined" ? null : document.documentElement,
): Promise<boolean> {
  if (root === null) return false;

  const wants = wantsVibrancy(palette);
  if (!wants) stampMarker(root, false);

  const bridge = readBridge();
  if (bridge === null) {
    stampMarker(root, false);
    return false;
  }

  let enabled = false;
  try {
    enabled = await bridge.setSidebarVibrancy(wants, opaqueFallback());
  } catch {
    // A bridge that rejects (older shell, window already torn down) means no
    // glass. Falling through to the opaque marker keeps the sidebar readable.
    enabled = false;
  }

  stampMarker(root, enabled);
  return enabled;
}
