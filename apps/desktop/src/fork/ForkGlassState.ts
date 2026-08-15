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

/**
 * The material the window is built with and switched to at runtime. It lives
 * here for the same reason the flag does: `window/DesktopWindow.ts` attaches it
 * at construction (Electron's `vibrancy` option is construction-only — a window
 * created without it can never gain the view later) and `ForkSidebarVibrancy`
 * re-applies it on every enable, so both files need the value and neither can
 * import the other.
 *
 * `fullscreen-ui` over `under-window`, which this started on. Under-window is
 * the darkest sampler macOS offers: measured through the app it delivered a flat
 * ~49 grey, which caps every glass surface no matter what the stylesheet does —
 * the stage and the composer were both arithmetically correct and both had
 * almost nothing to show. The trade is that under-window samples the desktop
 * picture alone, so the glass ignores other apps moving beneath it; the
 * behind-window materials sample whatever is actually back there, and the glass
 * will react when a window passes under. `sidebar` is the next one to try if
 * this reacts too much.
 */
export const FORK_VIBRANCY_MATERIAL = "fullscreen-ui" as const;

let active = false;

/** True while a window is currently painted with the vibrancy material. */
export function isForkGlassActive(): boolean {
  return active;
}

/** Only `ForkSidebarVibrancy` should call this — it owns the material. */
export function setForkGlassActive(next: boolean): void {
  active = next;
}
