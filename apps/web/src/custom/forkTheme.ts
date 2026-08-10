/**
 * Fork dark-palette preference — see `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Cool Dark is a CSS palette overlay (`data-fork-theme="cool-dark"` + `.dark`), not an
 * upstream theme definition. Upstream `t3code:theme` may contain a standard, built-in,
 * or imported theme id; this module owns `t3code:fork-theme` (`cool-dark` | absent)
 * and the DOM attribute.
 */

import { useCallback, useSyncExternalStore } from "react";

import {
  readThemePreference,
  subscribeToThemeChanges,
  syncBrowserChromeTheme,
} from "../hooks/useTheme";
import type { ThemePreference } from "../themePalette";

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
export type ResolvedAppearanceOption = AppearanceOption | ThemePreference;

type AttributeRoot = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

let listeners: Array<() => void> = [];
let lastPalette: ForkPalettePreference | undefined;
let initialized = false;

function emitChange() {
  for (const listener of listeners) listener();
}

function isCoolDarkPalette(value: string | null | undefined): value is typeof COOL_DARK_THEME {
  return value === COOL_DARK_THEME;
}

function readUpstreamTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    return readThemePreference();
  } catch {
    return "system";
  }
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

/** Pure preference read: migration belongs to startup, never React render. */
export function readForkPalette(): ForkPalettePreference {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FORK_PALETTE_STORAGE_KEY);
    return isCoolDarkPalette(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeForkPalette(palette: ForkPalettePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (palette === null) {
      window.localStorage.removeItem(FORK_PALETTE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(FORK_PALETTE_STORAGE_KEY, palette);
    }
  } catch {
    // The synchronization pass below applies the value storage actually retained.
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

export function resolveActiveForkPalette(
  theme: ThemePreference,
  palette: ForkPalettePreference,
  isDark = theme === "dark",
): ForkPalettePreference {
  return theme === "dark" && isDark && palette === COOL_DARK_THEME ? COOL_DARK_THEME : null;
}

export function resolveAppearanceOption(
  theme: ThemePreference,
  palette: ForkPalettePreference,
): ResolvedAppearanceOption {
  return resolveActiveForkPalette(theme, palette) ?? theme;
}

function getPaletteSnapshot(): ForkPalettePreference {
  const palette = readForkPalette();
  if (lastPalette === palette) return lastPalette ?? null;
  lastPalette = palette;
  return palette;
}

function subscribePalette(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

/** Reconcile the DOM and React subscribers to values storage actually retained. */
function syncForkPaletteFromStorage(): void {
  const theme = readUpstreamTheme();
  let palette = readForkPalette();
  if (theme !== "dark" && palette !== null) {
    writeForkPalette(null);
    palette = readForkPalette();
  }
  const activePalette = resolveActiveForkPalette(
    theme,
    palette,
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  if (typeof document !== "undefined") {
    applyForkPaletteAttribute(document.documentElement, activePalette);
    syncBrowserChromeTheme();
  }
  lastPalette = palette;
  emitChange();
}

function suppressAppearanceTransitions(update: () => void): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    update();
    return;
  }

  const root = document.documentElement;
  root.classList.add("no-transitions");
  update();
  // Force a reflow so every palette-driven property changes while suppression is active.
  // oxlint-disable-next-line no-unused-expressions
  root.offsetHeight;
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => root.classList.remove("no-transitions"));
  } else {
    root.classList.remove("no-transitions");
  }
}

/** Apply an Appearance option and reconcile partial storage failures to one visible state. */
export function setForkAppearance(
  next: AppearanceOption,
  setTheme: (theme: ThemePreference) => boolean,
): void {
  suppressAppearanceTransitions(() => {
    writeForkPalette(next === COOL_DARK_THEME ? COOL_DARK_THEME : null);
    setTheme(next === COOL_DARK_THEME ? "dark" : next);
    syncForkPaletteFromStorage();
  });
}

/**
 * Start the document-level palette owner after the fork marker is stamped.
 * React subscriptions only report state; this listener keeps every route and tab painted.
 */
export function initializeForkTheme(): void {
  if (initialized || typeof window === "undefined" || typeof document === "undefined") return;
  initialized = true;
  migrateLegacyCoolDarkTheme();
  syncForkPaletteFromStorage();
  subscribeToThemeChanges(syncForkPaletteFromStorage);
  window.addEventListener("storage", (event) => {
    if (event.key === FORK_PALETTE_STORAGE_KEY) {
      syncForkPaletteFromStorage();
    }
  });
}

/** Appearance adapter over the upstream theme and fork palette stores. */
export function useForkAppearance(
  theme: ThemePreference,
  setTheme: (theme: ThemePreference) => boolean,
) {
  const palette = useSyncExternalStore(subscribePalette, getPaletteSnapshot, () => null);
  const appearance = resolveAppearanceOption(theme, palette);

  const setAppearance = useCallback(
    (next: AppearanceOption) => setForkAppearance(next, setTheme),
    [setTheme],
  );

  return { appearance, setAppearance, palette } as const;
}
