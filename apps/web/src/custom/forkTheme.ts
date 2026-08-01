/**
 * Fork theme preference helpers — see `.fork/customizations.yaml#fork-cool-dark-theme`.
 *
 * Cool Dark is a named dark palette stored in the same `t3code:theme` key as
 * upstream's light/dark/system preference. The DOM still gets the `.dark`
 * class (so Tailwind/upstream dark tokens apply); the cooler, lighter palette
 * is keyed off `data-fork-theme="cool-dark"` in `theme.custom.css`.
 */

export const FORK_THEME_ATTRIBUTE = "data-fork-theme";
export const COOL_DARK_THEME = "cool-dark" as const;
export const COOL_DARK_LABEL = "Cool Dark";

/** Pre-paint / overscroll colour for Cool Dark — matches stage `--background`. */
export const COOL_DARK_BACKGROUND = "#1c1e20";

export type ForkThemePreference = "light" | "dark" | "cool-dark" | "system";
export type DesktopThemePreference = "light" | "dark" | "system";

export function isCoolDarkTheme(theme: string | null | undefined): theme is typeof COOL_DARK_THEME {
  return theme === COOL_DARK_THEME;
}

export function isDarkThemePreference(theme: ForkThemePreference): boolean {
  return theme === "dark" || theme === COOL_DARK_THEME;
}

/** Electron's nativeTheme only understands light/dark/system. */
export function toDesktopTheme(theme: ForkThemePreference): DesktopThemePreference {
  return theme === COOL_DARK_THEME ? "dark" : theme;
}

export function applyForkThemeAttribute(
  root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
  theme: ForkThemePreference,
): void {
  if (theme === COOL_DARK_THEME) {
    root.setAttribute(FORK_THEME_ATTRIBUTE, COOL_DARK_THEME);
    return;
  }
  root.removeAttribute(FORK_THEME_ATTRIBUTE);
}
