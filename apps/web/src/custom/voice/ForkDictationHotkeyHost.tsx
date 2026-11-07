import { useEffect } from "react";
import { installForkDictationHotkey } from "./forkDictation";

/**
 * Mounted once above the router (see `__root.tsx`): installs the right
 * Command tap for the composer that registered itself, and removes it on
 * unmount. Renders nothing.
 */
export function ForkDictationHotkeyHost() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- installs the window-level right Command listener for the app's lifetime
  useEffect(() => installForkDictationHotkey(), []);
  return null;
}
