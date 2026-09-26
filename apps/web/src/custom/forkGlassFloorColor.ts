/**
 * Fork glass floor colour — see `.fork/customizations.yaml#fork-glass-floor-color`.
 *
 * The opaque Glass surface-glass overlays (the scroll-to-end pill and its
 * kin) stand on `--fork-popup-glass-floor`, the colour the sidebar panel
 * reads on screen. Popups no longer do; they sit on the live glass through
 * the popup cutout. The palette carries a hand-measured value;
 * on the desktop the main process can do better, estimating it from the
 * wallpaper under the window (apps/desktop/src/fork/ForkGlassFloorColor.ts).
 * This module asks for that estimate once glass is actually on, writes it
 * over the token as an inline style on the root, and follows the shell's
 * change events (window moved or resized, app refocused) while glass stays
 * on. Off glass, or with no bridge, or when the shell answers null, the
 * inline value is removed and the palette's token shows through again.
 *
 * Imports nothing from `forkTheme`, like the vibrancy helper: the caller
 * passes whether glass resolved on, so this module never guesses at palettes.
 */

export const FORK_GLASS_FLOOR_TOKEN = "--fork-popup-glass-floor";

type FloorColor = { readonly r: number; readonly g: number; readonly b: number };

type ForkGlassFloorBridge = {
  readonly read: (sidebarWidth: number) => Promise<FloorColor | null>;
  readonly onChange: (listener: (color: FloorColor) => void) => () => void;
};

function readBridge(): ForkGlassFloorBridge | null {
  const bridge = (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  if (typeof bridge !== "object" || bridge === null) return null;
  const candidate = (bridge as { glassFloorColor?: unknown }).glassFloorColor;
  if (typeof candidate !== "object" || candidate === null) return null;
  const floor = candidate as { read?: unknown; onChange?: unknown };
  return typeof floor.read === "function" && typeof floor.onChange === "function"
    ? (candidate as ForkGlassFloorBridge)
    : null;
}

/** The sidebar's on-screen width, for the strip the shell samples. */
function readSidebarWidth(): number {
  if (typeof document === "undefined") return 256;
  const container = document.querySelector<HTMLElement>('[data-slot="sidebar-container"]');
  const width = container?.getBoundingClientRect().width ?? 0;
  return width > 0 ? Math.round(width) : 256;
}

function writeFloor(root: HTMLElement, color: FloorColor | null): void {
  // The theme tests hand the palette sync a bare fake root with no style
  // object; a token that cannot be written is simply not written.
  if (typeof root.style?.setProperty !== "function") return;
  if (color === null) {
    root.style.removeProperty(FORK_GLASS_FLOOR_TOKEN);
  } else {
    root.style.setProperty(FORK_GLASS_FLOOR_TOKEN, `rgb(${color.r} ${color.g} ${color.b})`);
  }
}

let unsubscribe: (() => void) | null = null;
/** Monotonic id so a superseded sync (glass toggled twice) never writes. */
let latestSyncId = 0;

/**
 * Called with whether glass resolved on. Writes the shell's estimate over the
 * floor token while it is, and clears it otherwise.
 */
export async function syncForkGlassFloorColor(
  glassOn: boolean,
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
): Promise<void> {
  if (root === null) return;
  latestSyncId += 1;
  const syncId = latestSyncId;
  const isStale = () => syncId !== latestSyncId;

  unsubscribe?.();
  unsubscribe = null;
  if (!glassOn) {
    writeFloor(root, null);
    return;
  }

  const bridge = readBridge();
  if (bridge === null) {
    writeFloor(root, null);
    return;
  }

  let color: FloorColor | null = null;
  try {
    color = await bridge.read(readSidebarWidth());
  } catch {
    color = null;
  }
  if (isStale()) return;
  writeFloor(root, color);
  if (color === null) return;

  unsubscribe = bridge.onChange((next) => {
    if (!isStale()) writeFloor(root, next);
  });
}
