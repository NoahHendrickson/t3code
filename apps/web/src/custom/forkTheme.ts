/**
 * Fork dark-palette preference — see `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Cool Dark is a CSS palette overlay (`data-fork-theme="cool-dark"` + `.dark`), not a
 * fourth upstream `ThemePreference`. Upstream `t3code:theme` stays `light|dark|system`;
 * this module owns `t3code:fork-theme` (`cool-dark` | absent) and the DOM attribute.
 */

import { useCallback, useSyncExternalStore } from "react";

import { syncBrowserChromeTheme } from "../hooks/useTheme";

export const FORK_THEME_ATTRIBUTE = "data-fork-theme";
export const FORK_PALETTE_STORAGE_KEY = "t3code:fork-theme";
export const UPSTREAM_THEME_STORAGE_KEY = "t3code:theme";
export const COOL_DARK_THEME = "cool-dark" as const;
export const COOL_DARK_LABEL = "Cool Dark";

/** Pre-paint / overscroll colour for Cool Dark — matches stage `--background`. */
export const COOL_DARK_BACKGROUND = "#1c1e20";

export type ForkPalette = typeof COOL_DARK_THEME;
export type ForkPalettePreference = ForkPalette | null;
export type AppearanceOption = "light" | "dark" | "cool-dark" | "system";
type UpstreamTheme = "light" | "dark" | "system";

type AttributeRoot = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

let listeners: Array<() => void> = [];
let lastPalette: ForkPalettePreference | undefined;

function emitChange() {
  for (const listener of listeners) listener();
}

export function isCoolDarkPalette(
  value: string | null | undefined,
): value is typeof COOL_DARK_THEME {
  return value === COOL_DARK_THEME;
}

/** One-time bridge for builds that stored Cool Dark in `t3code:theme`. */
export function migrateLegacyCoolDarkTheme(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(UPSTREAM_THEME_STORAGE_KEY) !== COOL_DARK_THEME) {
      return;
    }
    window.localStorage.setItem(UPSTREAM_THEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(FORK_PALETTE_STORAGE_KEY, COOL_DARK_THEME);
  } catch {
    // Match upstream theme reads: ignore storage failures during bootstrap.
  }
}

export function readForkPalette(): ForkPalettePreference {
  if (typeof window === "undefined") return null;
  migrateLegacyCoolDarkTheme();
  try {
    const raw = window.localStorage.getItem(FORK_PALETTE_STORAGE_KEY);
    return isCoolDarkPalette(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeForkPalette(palette: ForkPalettePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (palette === null) {
      window.localStorage.removeItem(FORK_PALETTE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(FORK_PALETTE_STORAGE_KEY, palette);
    }
  } catch {
    // Appearance still updates the upstream theme; palette persistence is best-effort.
  }
}

export function applyForkPaletteAttribute(
  root: AttributeRoot,
  palette: ForkPalettePreference,
): void {
  if (palette === COOL_DARK_THEME) {
    root.setAttribute(FORK_THEME_ATTRIBUTE, COOL_DARK_THEME);
    return;
  }
  root.removeAttribute(FORK_THEME_ATTRIBUTE);
}

export function resolveAppearanceOption(
  theme: UpstreamTheme,
  palette: ForkPalettePreference,
): AppearanceOption {
  return palette === COOL_DARK_THEME && theme === "dark" ? COOL_DARK_THEME : theme;
}

function getPaletteSnapshot(): ForkPalettePreference {
  const palette = readForkPalette();
  if (lastPalette === palette) return lastPalette ?? null;
  lastPalette = palette;
  return palette;
}

function subscribePalette(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === FORK_PALETTE_STORAGE_KEY || event.key === UPSTREAM_THEME_STORAGE_KEY) {
      lastPalette = undefined;
      emitChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Stamp/clear `data-fork-theme` and refresh browser chrome to the active palette. */
export function applyForkPalette(palette: ForkPalettePreference): void {
  writeForkPalette(palette);
  if (typeof document !== "undefined") {
    applyForkPaletteAttribute(document.documentElement, palette);
    syncBrowserChromeTheme();
  }
  lastPalette = palette;
  emitChange();
}

/**
 * Appearance Select adapter: Cool Dark writes the fork palette and forces upstream
 * `dark`; Light / Dark / System clear the palette and set the upstream preference.
 */
export function useForkAppearance(theme: UpstreamTheme, setTheme: (theme: UpstreamTheme) => void) {
  const palette = useSyncExternalStore(subscribePalette, getPaletteSnapshot, () => null);
  const appearance = resolveAppearanceOption(theme, palette);

  const setAppearance = useCallback(
    (next: AppearanceOption) => {
      if (next === COOL_DARK_THEME) {
        applyForkPalette(COOL_DARK_THEME);
        setTheme("dark");
        return;
      }
      applyForkPalette(null);
      setTheme(next);
    },
    [setTheme],
  );

  return { appearance, setAppearance, palette } as const;
}

// Re-stamp after index.html pre-paint when this module first loads (e.g. Appearance).
if (typeof document !== "undefined" && typeof window !== "undefined") {
  migrateLegacyCoolDarkTheme();
  const palette = readForkPalette();
  applyForkPaletteAttribute(document.documentElement, palette);
  if (palette !== null) {
    syncBrowserChromeTheme();
  }
}
