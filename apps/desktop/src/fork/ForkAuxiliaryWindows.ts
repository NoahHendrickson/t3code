import type * as Electron from "electron";

/**
 * Windows the fork opens beside the main one (the side chat — see
 * `.fork/customizations.yaml#fork-side-chat`). ElectronWindow's "main or
 * first window" fallback skips them, so with the main window closed a dock
 * click or a menu action reopens the app instead of surfacing the side chat.
 * Its own module so ElectronWindow can read it without importing the side
 * chat, which imports ElectronWindow.
 */
const auxiliaryWindows = new WeakSet<Electron.BrowserWindow>();

export function markForkAuxiliaryWindow(window: Electron.BrowserWindow): void {
  auxiliaryWindows.add(window);
}

export function isForkAuxiliaryWindow(window: Electron.BrowserWindow): boolean {
  return auxiliaryWindows.has(window);
}
