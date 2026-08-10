/**
 * Neutral Darker sidebar vibrancy cleanup — see
 * `.fork/customizations.yaml#fork-neutral-darker-theme`.
 *
 * Wallpaper-through-sidebar via Electron vibrancy was removed. This helper
 * only clears any leftover native vibrancy + DOM marker so a hot desktop
 * session recovers to the solid Neutral Darker panel.
 */

export const SIDEBAR_VIBRANCY_ATTRIBUTE = "data-fork-sidebar-vibrancy";

type SidebarVibrancyBridge = {
  setForkSidebarVibrancy?: (enabled: boolean) => Promise<boolean>;
};

function readBridge(): SidebarVibrancyBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.desktopBridge as SidebarVibrancyBridge | undefined;
}

type AttributeRoot = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export function applySidebarVibrancyAttribute(root: AttributeRoot, active: boolean): void {
  if (active) {
    root.setAttribute(SIDEBAR_VIBRANCY_ATTRIBUTE, "true");
    return;
  }
  root.removeAttribute(SIDEBAR_VIBRANCY_ATTRIBUTE);
}

/** Always disable sidebar vibrancy and clear the DOM marker. */
export async function syncForkSidebarVibrancy(_activePalette: string | null): Promise<boolean> {
  const bridge = readBridge();
  const setVibrancy = bridge?.setForkSidebarVibrancy;

  if (typeof setVibrancy === "function") {
    try {
      await setVibrancy(false);
    } catch {
      // Bridge failures still clear the marker below.
    }
  }

  if (typeof document !== "undefined") {
    applySidebarVibrancyAttribute(document.documentElement, false);
  }
  return false;
}
