/**
 * Fork dark-palette preferences — see `.fork/customizations.yaml#fork-cool-dark-theme`,
 * `#fork-neutral-dark-theme`, and `#fork-neutral-darker-theme`.
 *
 * Cool Dark / Neutral Dark / Neutral Darker are CSS palette overlays
 * (`data-fork-theme` + `.dark`), not widened upstream `ThemePreference` values.
 * Upstream `t3code:theme` stays `light|dark|system`; this module owns
 * `t3code:fork-theme` (`cool-dark` | `neutral-dark` | `neutral-darker` | absent)
 * and the DOM attribute.
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

export const NEUTRAL_DARK_THEME = "neutral-dark" as const;
export const NEUTRAL_DARK_LABEL = "Neutral Dark";
/** Pre-paint / overscroll colour for Neutral Dark — matches stage `--background`. */
export const NEUTRAL_DARK_BACKGROUND = "#1f1f1f";

export const NEUTRAL_DARKER_THEME = "neutral-darker" as const;
export const NEUTRAL_DARKER_LABEL = "Neutral Darker";
/** Pre-paint / overscroll colour for Neutral Darker — matches stage `--background`. */
export const NEUTRAL_DARKER_BACKGROUND = "#1a1a1a";

export const FORK_PALETTES = [COOL_DARK_THEME, NEUTRAL_DARK_THEME, NEUTRAL_DARKER_THEME] as const;
export type ForkPalette = (typeof FORK_PALETTES)[number];
export type ForkPalettePreference = ForkPalette | null;
export type AppearanceOption = "light" | "dark" | ForkPalette | "system";
type UpstreamTheme = "light" | "dark" | "system";

/** Settings derives its fork Appearance options from this — one row per palette. */
export const FORK_PALETTE_LABELS = {
  [COOL_DARK_THEME]: COOL_DARK_LABEL,
  [NEUTRAL_DARK_THEME]: NEUTRAL_DARK_LABEL,
  [NEUTRAL_DARKER_THEME]: NEUTRAL_DARKER_LABEL,
} as const satisfies Record<ForkPalette, string>;

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

export function isForkPalette(value: string | null | undefined): value is ForkPalette {
  return (
    value === COOL_DARK_THEME || value === NEUTRAL_DARK_THEME || value === NEUTRAL_DARKER_THEME
  );
}

function readUpstreamTheme(): UpstreamTheme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(UPSTREAM_THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
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
    return isForkPalette(raw) ? raw : null;
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
  if (palette !== null) {
    root.setAttribute(FORK_THEME_ATTRIBUTE, palette);
    return;
  }
  root.removeAttribute(FORK_THEME_ATTRIBUTE);
}

export function resolveActiveForkPalette(
  theme: UpstreamTheme,
  palette: ForkPalettePreference,
): ForkPalettePreference {
  return theme === "dark" && palette !== null ? palette : null;
}

export function resolveAppearanceOption(
  theme: UpstreamTheme,
  palette: ForkPalettePreference,
): AppearanceOption {
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
  const palette = readForkPalette();
  const activePalette = resolveActiveForkPalette(readUpstreamTheme(), palette);
  if (typeof document !== "undefined") {
    applyForkPaletteAttribute(document.documentElement, activePalette);
    // Synchronous, inside the suppressed-transition window: switching between
    // two fork palettes keeps upstream theme at "dark", so applyTheme no-ops
    // and this is the only repaint of html/body overscroll and theme-color.
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
  setTheme: (theme: UpstreamTheme) => void,
): void {
  suppressAppearanceTransitions(() => {
    writeForkPalette(isForkPalette(next) ? next : null);
    setTheme(isForkPalette(next) ? "dark" : next);
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
  window.addEventListener("storage", (event) => {
    if (
      event.key === null ||
      event.key === FORK_PALETTE_STORAGE_KEY ||
      event.key === UPSTREAM_THEME_STORAGE_KEY
    ) {
      syncForkPaletteFromStorage();
    }
  });
}

/** Appearance Select adapter over the upstream theme and fork palette stores. */
export function useForkAppearance(theme: UpstreamTheme, setTheme: (theme: UpstreamTheme) => void) {
  const palette = useSyncExternalStore(subscribePalette, getPaletteSnapshot, () => null);
  const appearance = resolveAppearanceOption(theme, palette);

  const setAppearance = useCallback(
    (next: AppearanceOption) => setForkAppearance(next, setTheme),
    [setTheme],
  );

  return { appearance, setAppearance, palette } as const;
}
