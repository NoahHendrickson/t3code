/**
 * Fork glass ownership flag — see
 * `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Two places write `BrowserWindow.setBackgroundColor`: this fork's vibrancy
 * handler and `syncWindowAppearance` in `window/DesktopWindow.ts`, which repaints
 * the opaque theme fill whenever the OS appearance changes. Without a shared
 * flag the second one silently kills the glass while the renderer still believes
 * it is on — the window goes opaque and no marker updates.
 *
 * Deliberately its own module rather than a field on either side: both of those
 * files need to read it, and importing one from the other closes a cycle.
 */

let active = false;

/** True while a window is currently painted with the vibrancy material. */
export function isForkGlassActive(): boolean {
  return active;
}

/** Only `ForkSidebarVibrancy` should call this — it owns the material. */
export function setForkGlassActive(next: boolean): void {
  active = next;
}
