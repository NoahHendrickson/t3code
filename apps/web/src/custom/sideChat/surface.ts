/**
 * Whether this renderer is the desktop side chat window — see
 * `.fork/customizations.yaml#fork-side-chat`. The desktop loads the app with
 * `?surface=side-chat` ahead of the hash, so the flag holds for the window's
 * whole life while the hash router navigates.
 *
 * main.tsx imports this module first, because loading it isolates the
 * window's localStorage writes: every persisted store (composer drafts,
 * panels, terminals) writes its whole state on change, and two windows on
 * one origin would overwrite each other's — the side chat would erase the
 * main window's unsent drafts. The rule: a key the side chat has not
 * written reads the real storage, current with the main window; a key it has
 * written reads its own copy from then on. Copies live in memory, so they
 * last until the window reloads, which it does for each fresh chat
 * (SideChatShell). Client settings are not in localStorage on desktop;
 * useSettings re-reads them when a window gains focus.
 */

export function isSideChatSearch(search: string): boolean {
  return new URLSearchParams(search).get("surface") === "side-chat";
}

/** A Storage that reads through to `base` and keeps writes to itself. */
export function createWriteIsolatedStorage(base: Storage): Storage {
  // null marks a key removed here while it still exists in `base`.
  const writes = new Map<string, string | null>();
  const keys = (): string[] => {
    const all = new Set<string>();
    for (let index = 0; index < base.length; index += 1) {
      const key = base.key(index);
      if (key !== null) all.add(key);
    }
    for (const [key, value] of writes) {
      if (value === null) all.delete(key);
      else all.add(key);
    }
    return [...all];
  };
  return {
    get length() {
      return keys().length;
    },
    key: (index) => keys()[index] ?? null,
    getItem: (key) => {
      const written = writes.get(key);
      return written === undefined ? base.getItem(key) : written;
    },
    setItem: (key, value) => {
      writes.set(key, String(value));
    },
    removeItem: (key) => {
      writes.set(key, null);
    },
    clear: () => {
      for (const key of keys()) writes.set(key, null);
    },
  };
}

export const isSideChatSurface =
  typeof window !== "undefined" && isSideChatSearch(window.location.search);

if (isSideChatSurface) {
  // For the stylesheets: the Glass stage card fills this window instead of
  // standing inside it (theme.custom.glass-stage.css).
  document.documentElement.setAttribute("data-fork-side-chat", "true");
  // Window's attributes are configurable own properties of the global, so
  // this also covers bare `localStorage` references.
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createWriteIsolatedStorage(window.localStorage),
  });
}
