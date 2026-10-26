/**
 * Glass 3D switch — see `.fork/customizations.yaml#fork-glass-3d`.
 *
 * Turns Glass's depth off and on: the stage card a thread sits in
 * (theme.custom.glass-stage.css) and the glints, sheens and halos on the
 * selected rows, chips, tabs, buttons and popups
 * (theme.custom.glass-surfaces.css). Off, every rule in both sheets stands
 * down through the root attribute below, and Glass paints the flat stage and
 * fills it had before them. The attribute is the one place the state lives in
 * the DOM; no component subscribes to it.
 *
 * Device-local, like the palette it belongs to: a contracts field would put
 * a fork key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";

import { getLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "t3code:fork:glass-3d:v1";

/** Stamped on the root while 3D is off; the 3D sheets' rules require its absence. */
export const FORK_GLASS_3D_OFF_ATTRIBUTE = "data-fork-glass-3d";

function apply3dAttribute(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) document.documentElement.removeAttribute(FORK_GLASS_3D_OFF_ATTRIBUTE);
  else document.documentElement.setAttribute(FORK_GLASS_3D_OFF_ATTRIBUTE, "off");
}

function read3dEnabled(): boolean {
  try {
    return getLocalStorageItem(STORAGE_KEY, Schema.Boolean) ?? true;
  } catch {
    return true;
  }
}

let initialized = false;

/** Paints the stored preference before first render and follows other tabs. */
export function initializeForkGlass3d(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  apply3dAttribute(read3dEnabled());
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) apply3dAttribute(read3dEnabled());
  });
}

/** Whether Glass draws its 3D card and surfaces, and its setter. */
export function useForkGlass3d(): [boolean, (enabled: boolean) => void] {
  const [enabled, setStored] = useLocalStorage(STORAGE_KEY, true, Schema.Boolean);
  const setEnabled = (next: boolean) => {
    setStored(next);
    // From what storage kept, not from `next`: the setter only logs a failed
    // write, and the root must not drop a look the switch and a reload would
    // still show.
    apply3dAttribute(read3dEnabled());
  };
  return [enabled, setEnabled];
}
