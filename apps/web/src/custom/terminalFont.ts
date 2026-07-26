/**
 * Fork-owned terminal typography, Tier 1 — see
 * `.fork/customizations.yaml#geist-typography`.
 *
 * xterm takes its font from a constructor option, not the cascade, so the
 * fork's `--font-mono` has to be resolved by hand and re-applied once the
 * webfont actually lands. That is the whole reason this module exists. Keeping
 * it out of `ThreadTerminalDrawer`'s mount effect leaves that ~1.5k-line
 * upstream hot path with two one-line call sites instead of forty lines of
 * fork logic, and lets the behaviour be tested without a DOM (the web unit
 * project runs on `environment: "node"`).
 */

/**
 * Size for the `FontFaceSet.load()` shorthand. Syntactically required and
 * irrelevant to matching — the family selects the face, the size does not.
 */
const FONT_LOAD_PROBE_SIZE = "12px";

/**
 * Any family other than the one being applied. xterm's option setter drops
 * equal writes, so re-applying the resolved stack has to be preceded by a
 * different value to register as a change. See `remeasure` below.
 */
const REMEASURE_BOUNCE_FAMILY = "monospace";

/**
 * Used when the cascade read comes back empty — a detached mount, or the fork
 * marker not yet stamped. It leads with Geist Mono on purpose: font fallback
 * is per-family and skips families that aren't loaded, so naming the bundled
 * face first costs nothing when it is missing, and avoids the degraded path
 * quietly landing the terminal on SF Mono while the rest of the app is on
 * Geist. JetBrains Mono is kept as upstream's bundled Linux fallback.
 */
export const FORK_TERMINAL_FONT_FALLBACK =
  '"Geist Mono Variable", "Geist Mono", "SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace';

/** Pure half of {@link resolveTerminalFontFamily}, so it can be tested without a DOM. */
export function terminalFontFamilyFrom(resolvedVariable: string): string {
  return resolvedVariable.trim() || FORK_TERMINAL_FONT_FALLBACK;
}

/** Reads the cascade-resolved `--font-mono` off `element`. */
export function resolveTerminalFontFamily(element: Element): string {
  return terminalFontFamilyFrom(getComputedStyle(element).getPropertyValue("--font-mono"));
}

/**
 * First family of a CSS font stack, for use in a `font` shorthand. Computed
 * custom properties preserve the authored text, so a multi-word family arrives
 * already quoted.
 */
export function firstFontFamily(stack: string): string | null {
  const first = stack.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * The slice of xterm's `Terminal` this module touches. `fontFamily` is optional
 * because `ITerminalOptions` declares it that way.
 */
export interface ForkTerminalFontTarget {
  readonly cols: number;
  readonly rows: number;
  readonly options: { fontFamily?: string | undefined };
  readonly buffer: { readonly active: { readonly viewportY: number; readonly baseY: number } };
  scrollToBottom: () => void;
}

export interface RefitTerminalWhenFontsReadyArgs {
  readonly terminal: ForkTerminalFontTarget;
  /** False once the terminal has been torn down, so a late resolve is dropped. */
  readonly isCurrent: () => boolean;
  /** Upstream's `fitTerminalSafely(fitAddon)`. */
  readonly fit: () => void;
  /** Upstream's `resizeTerminal`, propagating the new geometry to the PTY. */
  readonly resize: (cols: number, rows: number) => unknown;
  readonly fonts?: Pick<FontFaceSet, "load" | "ready"> | undefined;
  readonly scheduleFrame?: ((callback: () => void) => void) | undefined;
}

function defaultScheduleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  callback();
}

/**
 * xterm sizes its cell grid at `open()`. With a webfont that can happen before
 * the face has landed, leaving the grid measured against the fallback metrics —
 * measurably so: Geist Mono renders at the unknown-font fallback width until it
 * loads, and wider afterwards. This re-measures once the fonts settle and then
 * propagates the corrected geometry, both locally and to the PTY.
 */
export async function refitTerminalWhenFontsReady(
  args: RefitTerminalWhenFontsReadyArgs,
): Promise<void> {
  const fonts = args.fonts ?? globalThis.document?.fonts;
  if (!fonts) return;

  // Set from `resolveTerminalFontFamily` at the call site; if some future
  // upstream refactor stops passing one there is no resolved stack to restore,
  // and xterm's own default already measured correctly.
  const fontFamily = args.terminal.options.fontFamily;
  if (!fontFamily) return;

  const probe = firstFontFamily(fontFamily);
  if (probe) {
    // Derived from the family we actually resolved rather than hardcoded, for
    // two reasons. It cannot go stale when the mono face changes; and in an
    // unmarked, pure-upstream build it names a local system face with no
    // `@font-face` rule, so nothing is fetched and the fork's "an unmarked
    // build never pulls a Geist byte" invariant holds.
    //
    // `load()` rejects if a matching face fails to load. An unhandled
    // rejection would be pure noise here: a missing webfont just means the
    // fallback metrics were already correct.
    await fonts.load(`${FONT_LOAD_PROBE_SIZE} ${probe}`).catch(() => []);
  }
  await fonts.ready;
  if (!args.isCurrent()) return;

  // xterm's option setter drops equal writes — `_setupOptions` guards with
  // `if (this.rawOptions[propName] !== value)` — so re-assigning the same stack
  // fires no change event and nothing re-measures. Bounce through another
  // family to force it. Both writes are in one task, so nothing paints between.
  args.terminal.options.fontFamily = REMEASURE_BOUNCE_FAMILY;
  args.terminal.options.fontFamily = fontFamily;

  // Fit on the next frame rather than inline: that avoids betting on xterm
  // re-measuring synchronously inside the setter, and mirrors the frame
  // upstream already uses at its `drawerHeight`/`resizeEpoch` fit site.
  (args.scheduleFrame ?? defaultScheduleFrame)(() => {
    if (!args.isCurrent()) return;
    // Mirrors the fit/propagate sequence upstream uses at both of its own fit
    // sites: nothing in the drawer subscribes to `onResize`, so the PTY only
    // learns the new column count if we tell it. Without this the corrected
    // grid is narrower than the width the PTY is still wrapping to.
    const active = args.terminal.buffer.active;
    const wasAtBottom = active.viewportY >= active.baseY;
    args.fit();
    if (wasAtBottom) {
      args.terminal.scrollToBottom();
    }
    void args.resize(args.terminal.cols, args.terminal.rows);
  });
}
