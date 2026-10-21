/**
 * The side chat's half of the fork desktop bridge — see
 * `.fork/customizations.yaml#fork-side-chat` and the `sideChat` entry in
 * apps/desktop/src/preload.ts. Read off `globalThis` so it stays testable.
 */
interface SideChatBridge {
  /** Fires when the desktop hides the side chat; the next open is a new chat. */
  readonly onFresh: (listener: () => void) => () => void;
}

export function readSideChatBridge(): SideChatBridge | null {
  const bridge = (globalThis as { forkDesktopBridge?: unknown }).forkDesktopBridge;
  if (typeof bridge !== "object" || bridge === null) return null;
  const candidate = (bridge as { sideChat?: unknown }).sideChat;
  if (typeof candidate !== "object" || candidate === null) return null;
  return typeof (candidate as { onFresh?: unknown }).onFresh === "function"
    ? (candidate as SideChatBridge)
    : null;
}
