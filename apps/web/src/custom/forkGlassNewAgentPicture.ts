/**
 * Glass new-agent picture switch — see
 * `.fork/customizations.yaml#fork-glass-new-agent-stage`.
 *
 * Turns Glass's new-agent stage (theme.custom.glass.css) off and on. Off,
 * every rule in that sheet stands down through the root attribute below,
 * so a draft paints on the same stage as a started thread; the composer
 * still centres, which is fork-new-agent-draft's and not the stage's. The
 * popup cutout and the palettes sheet read the same attribute, so popups,
 * the thread details popover among them, cut holes as in a started thread.
 * The attribute is the one place the state lives in the DOM; no component
 * subscribes to it.
 *
 * Device-local, like the palette it belongs to: a contracts field would put
 * a fork key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";
import { useCallback } from "react";

import { getLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "t3code:fork:glass-new-agent-picture:v1";

/** Stamped on the root while the picture is off; the stage sheet's rules require its absence. */
export const FORK_GLASS_PICTURE_OFF_ATTRIBUTE = "data-fork-glass-picture";

function applyPictureAttribute(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) document.documentElement.removeAttribute(FORK_GLASS_PICTURE_OFF_ATTRIBUTE);
  else document.documentElement.setAttribute(FORK_GLASS_PICTURE_OFF_ATTRIBUTE, "off");
}

function readPictureEnabled(): boolean {
  try {
    return getLocalStorageItem(STORAGE_KEY, Schema.Boolean) ?? true;
  } catch {
    return true;
  }
}

let initialized = false;

/** Paints the stored preference before first render and follows other tabs. */
export function initializeForkGlassNewAgentPicture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  applyPictureAttribute(readPictureEnabled());
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyPictureAttribute(readPictureEnabled());
  });
}

/** Whether Glass paints its picture behind a new agent's draft, and its setter. */
export function useForkGlassNewAgentPicture(): [boolean, (enabled: boolean) => void] {
  const [enabled, setStored] = useLocalStorage(STORAGE_KEY, true, Schema.Boolean);
  const setEnabled = useCallback(
    (next: boolean) => {
      setStored(next);
      // From what storage kept, not from `next`: the setter only logs a
      // failed write, and the root must not hide a picture the switch and a
      // reload would still show.
      applyPictureAttribute(readPictureEnabled());
    },
    [setStored],
  );
  return [enabled, setEnabled];
}
