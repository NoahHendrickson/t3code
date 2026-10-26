/**
 * An on/off switch the stylesheets read from the root — see
 * `.fork/customizations.yaml#fork-glass-3d`.
 *
 * Off stamps `attribute="off"` on <html>; the rules it governs require its
 * absence, so no component subscribes to it. On by default. Device-local,
 * like the palette the Glass switches belong to: a contracts field would put
 * a fork key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

export interface ForkRootSwitch {
  /** Paints the stored preference before first render and follows other tabs. */
  readonly initialize: () => void;
  /** The switch's state and its setter, which keeps one identity. */
  readonly useEnabled: () => [boolean, (enabled: boolean) => void];
}

export function createForkRootSwitch(options: {
  readonly storageKey: string;
  readonly attribute: string;
}): ForkRootSwitch {
  const { storageKey, attribute } = options;
  // One module-level store per switch, so the setter is stable without a
  // memo and every mounted hook hears a change made by any of them.
  const listeners = new Set<() => void>();
  let initialized = false;

  const read = (): boolean => {
    try {
      return getLocalStorageItem(storageKey, Schema.Boolean) ?? true;
    } catch {
      return true;
    }
  };

  const apply = (enabled: boolean) => {
    if (typeof document === "undefined") return;
    if (enabled) document.documentElement.removeAttribute(attribute);
    else document.documentElement.setAttribute(attribute, "off");
  };

  const sync = () => {
    apply(read());
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const setEnabled = (enabled: boolean) => {
    try {
      setLocalStorageItem(storageKey, enabled, Schema.Boolean);
    } catch (error) {
      console.error(`[fork-root-switch] Could not store ${storageKey}.`, error);
    }
    // From what storage kept, not from `enabled`: the root must not show a
    // state that the switch and a reload would not.
    sync();
  };

  return {
    initialize: () => {
      if (initialized || typeof window === "undefined") return;
      initialized = true;
      apply(read());
      window.addEventListener("storage", (event) => {
        if (event.key === storageKey) sync();
      });
    },
    useEnabled: () => [useSyncExternalStore(subscribe, read, () => true), setEnabled],
  };
}
