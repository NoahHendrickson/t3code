/**
 * Fork-owned terminal typography, Tier 1 — see
 * `.fork/customizations.yaml#geist-typography`.
 *
 * The ghostty surface takes its font as a creation option, not from the
 * cascade, and since upstream's Settings → Appearance font work the drawer
 * feeds it the user's terminal preference. This module owns what an UNSET
 * preference means on the fork: the Geist Mono stack below, consumed by the
 * fenced empty-family branch in ThreadTerminalDrawer's terminalFontOptions.
 * (The xterm-era refit shim and the cascade `--font-mono` read that used to
 * live here are gone: the surface waits on document.fonts before measuring
 * and re-measures on loadingdone, and a live cascade read would leak
 * Advanced-mode code-font changes into a terminal the user asked to keep on
 * its default.)
 *
 * It leads with Geist Mono on purpose: font fallback is per-family and skips
 * families that aren't loaded, so naming the bundled face first costs nothing
 * when it is missing. "JetBrains Mono" stays named for a Linux user who has
 * it installed (the bundled face is gone — upstream dropped its webfonts).
 * No trailing `monospace`: the surface appends its own glyph fallbacks
 * (Symbols Nerd Font et al, then the generic), and a generic mid-list would
 * sit ahead of the Nerd Font faces.
 */
export const FORK_TERMINAL_FONT_FALLBACK =
  '"Geist Mono Variable", "Geist Mono", "SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo';
