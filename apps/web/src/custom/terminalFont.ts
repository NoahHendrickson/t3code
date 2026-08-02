/**
 * Fork-owned terminal typography, Tier 1 — see
 * `.fork/customizations.yaml#geist-typography`.
 *
 * The ghostty surface takes its font from a creation option, not the cascade,
 * so the fork's `--font-mono` has to be resolved by hand at the mount site.
 * That is the whole reason this module exists. The surface itself waits for
 * the webfont and re-measures the cell grid when it lands, so unlike the
 * xterm era there is no refit shim here — just the cascade read and its
 * degraded-path fallback, testable without a DOM (the web unit project runs
 * on `environment: "node"`).
 */

/**
 * Used when the cascade read comes back empty — a detached mount, or the fork
 * marker not yet stamped. It leads with Geist Mono on purpose: font fallback
 * is per-family and skips families that aren't loaded, so naming the bundled
 * face first costs nothing when it is missing, and avoids the degraded path
 * quietly landing the terminal on SF Mono while the rest of the app is on
 * Geist. JetBrains Mono is kept as upstream's bundled Linux fallback. No
 * trailing `monospace`: the surface appends its own glyph fallbacks (which
 * end in the generic), and a generic mid-list would sit ahead of the Nerd
 * Font faces — see {@link terminalFontFamilyFrom}.
 */
export const FORK_TERMINAL_FONT_FALLBACK =
  '"Geist Mono Variable", "Geist Mono", "SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo';

/**
 * The cascade stacks end in the `monospace` generic, but the surface appends
 * its glyph fallbacks (Symbols Nerd Font et al, then `monospace`) after
 * whatever it is given. Handing over a stack with a generic mid-list is a
 * shape upstream's own default never produces — per-character fallback
 * should walk past a generic whose face lacks the glyph, but "should" is not
 * a place to leave prompt glyphs. Trim it; the surface restores the generic
 * at the true tail.
 */
function stripTrailingGenericFamilies(stack: string): string {
  const families = stack.split(",").map((family) => family.trim());
  while (families.length > 0 && families[families.length - 1]?.toLowerCase() === "monospace") {
    families.pop();
  }
  return families.join(", ");
}

/** Pure half of {@link resolveTerminalFontFamily}, so it can be tested without a DOM. */
export function terminalFontFamilyFrom(resolvedVariable: string): string {
  return stripTrailingGenericFamilies(resolvedVariable.trim()) || FORK_TERMINAL_FONT_FALLBACK;
}

/** Reads the cascade-resolved `--font-mono` off `element`. */
export function resolveTerminalFontFamily(element: Element): string {
  return terminalFontFamilyFrom(getComputedStyle(element).getPropertyValue("--font-mono"));
}
