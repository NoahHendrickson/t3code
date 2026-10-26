/**
 * A device-local setting the stylesheets read from the root — see
 * `.fork/customizations.yaml#fork-glass-3d`.
 *
 * Every value but the default stamps an attribute on <html>, which the rules
 * it governs key on, so no component subscribes to it. Device-local, like
 * the palette the Glass settings belong to: a contracts field would put a
 * fork key in a schema upstream owns.
 */
import type * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

export interface ForkRootSetting<T> {
  /** Paints the stored value before first render and follows other tabs. */
  readonly initialize: () => void;
  /** The setting's value and its setter, which keeps one identity. */
  readonly useValue: () => [T, (value: T) => void];
}

// Primitives only: every read decodes storage afresh, and useSyncExternalStore
// needs a snapshot that compares equal while nothing changed.
export function createForkRootSetting<T extends string | number | boolean, E>(options: {
  readonly storageKey: string;
  readonly attribute: string;
  readonly schema: Schema.Codec<T, E>;
  readonly defaultValue: T;
  /** The attribute's value for a setting value; null removes it. */
  readonly attributeValue: (value: T) => string | null;
}): ForkRootSetting<T> {
  const { storageKey, attribute, schema, defaultValue, attributeValue } = options;
  // One module-level store per setting, so the setter is stable without a
  // memo and every mounted hook hears a change made by any of them.
  const listeners = new Set<() => void>();
  let initialized = false;

  const read = (): T => {
    try {
      return getLocalStorageItem(storageKey, schema) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const apply = (value: T) => {
    if (typeof document === "undefined") return;
    const stamp = attributeValue(value);
    if (stamp === null) document.documentElement.removeAttribute(attribute);
    else document.documentElement.setAttribute(attribute, stamp);
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

  const setValue = (value: T) => {
    try {
      setLocalStorageItem(storageKey, value, schema);
    } catch (error) {
      console.error(`[fork-root-setting] Could not store ${storageKey}.`, error);
    }
    // From what storage kept, not from `value`: the root must not show a
    // state that the control and a reload would not.
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
    useValue: () => [useSyncExternalStore(subscribe, read, () => defaultValue), setValue],
  };
}
