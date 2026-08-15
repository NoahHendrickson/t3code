/**
 * Fork sidebar glass — see `.fork/customizations.yaml#fork-cool-darker-sidebar-vibrancy`.
 *
 * Asks the desktop shell for native macOS vibrancy and records what it actually
 * got. The renderer never assumes the glass turned on: the main process resolves
 * `false` off macOS and with no bridge present, and only that resolved value
 * stamps the DOM marker. The CSS gate hangs off the marker rather than off the
 * palette, so a Linux or web client keeps solid fills instead of painting holes
 * into an opaque window.
 *
 * This module imports nothing from `forkTheme`, on purpose. It used to, and
 * `forkTheme` imports it, so the cycle had to be worked around with functions
 * that deferred reading the constants until call time. Taking `enabled` as an
 * argument deletes the cycle instead of dodging it — and, more importantly,
 * stops this module guessing at palette-specific values it has no business
 * knowing. The window's opaque restore colour is resolved in the main process
 * from `nativeTheme`, because only it knows the theme being restored to.
 */

export const FORK_SIDEBAR_VIBRANCY_ATTRIBUTE = "data-fork-sidebar-vibrancy";

type ForkDesktopBridge = {
  readonly setSidebarVibrancy: (enabled: boolean) => Promise<boolean>;
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
 * Monotonic id for in-flight syncs. Palette changes fire this without awaiting,
 * so Cool Darker → Dark → Cool Darker can resolve out of order and stamp the
 * marker from a superseded request. Only the newest sync is allowed to write.
 */
let latestSyncId = 0;

/**
 * Asks the desktop shell to match `enabled`, then stamps the marker with the
 * result. Resolves with whether the glass is actually on.
 *
 * Clearing runs synchronously before the request so switching away from glass
 * never leaves a frame of transparent CSS over an already-opaque window — that
 * flash reads as the sidebar blinking black.
 */
export async function syncForkSidebarVibrancy(
  enabled: boolean,
  root: Element | null = typeof document === "undefined" ? null : document.documentElement,
): Promise<boolean> {
  if (root === null) return false;

  latestSyncId += 1;
  const syncId = latestSyncId;
  const isStale = () => syncId !== latestSyncId;

  if (!enabled) stampMarker(root, false);

  const bridge = readBridge();
  if (bridge === null) {
    if (!isStale()) stampMarker(root, false);
    return false;
  }

  let applied = false;
  try {
    applied = await bridge.setSidebarVibrancy(enabled);
  } catch {
    // A bridge that rejects (older shell, window already torn down) means no
    // glass. Falling through to the opaque marker keeps the sidebar readable.
    applied = false;
  }

  // A newer sync has already answered; this one's result describes a palette
  // the user has left.
  if (isStale()) return applied;

  stampMarker(root, applied);
  return applied;
}
