/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The pure half of the preview design-source resolver: the result shape handed to
 * the Design-mode engine and the validation that produces it. Kept free of
 * react-grab/DOM imports so it stays unit-testable under node (the same split
 * PickLabelPosition.ts uses beside PickPreload.ts).
 */

export const DESIGN_SOURCE_RESOLVER_GLOBAL = "__T3_DESIGN_SOURCE_RESOLVER_V1__";

const MAX_FILE_LENGTH = 4096;

/** Exactly what the engine consumes — it synthesizes a canonical `file:line:col` tag and
 * derives labels/selectors itself, so nothing else crosses the bridge (PR #54 review).
 *
 * `componentName` rides alongside because it survives the one failure the location does not:
 * react-grab reads the fiber's position in the SERVED module and only maps it back to the
 * authored file when it can symbolicate. Unsymbolicated, `line` is a post-transform line
 * number — it looks valid, points into a file the agent then cannot make sense of (a 71-line
 * source "at line 135"), and costs more time than no location at all. The component name is
 * derived from the fiber itself, so it stays correct either way. */
export interface DesignSourceResult {
  file: string;
  line: number;
  column: number;
  componentName?: string;
}

/**
 * Validates and normalizes a react-grab element context into the resolver's result
 * shape. Returns null for anything without a usable development source location:
 * missing/empty/oversized file paths, control characters (a hostile page could feed
 * the engine a newline-bearing "path"), or non-integer line/column numbers. Line and
 * column are one-based on the way out; react-grab's occasional zero column is
 * clamped rather than rejected.
 */
export function normalizeResolvedSource(
  value: {
    filePath?: unknown;
    lineNumber?: unknown;
    columnNumber?: unknown;
    componentName?: unknown;
    stack?: unknown;
  } | null,
): DesignSourceResult | null {
  if (!value || typeof value !== "object") return null;
  const { filePath, lineNumber, columnNumber } = value;
  // An unsymbolicated frame reports GENERATED coordinates — the line in the module Vite
  // served, not in the file the agent will open. Rejecting the location outright is
  // deliberate: the engine's fallback (selector + component name) beats a confident pointer
  // at the wrong line of the right file, which reads as authoritative and is not.
  if (!isSymbolicated(value.stack, filePath)) return null;
  const file = normalizeFilePath(filePath);
  if (file === null) return null;
  if (typeof lineNumber !== "number" || !Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }
  if (typeof columnNumber !== "number" || !Number.isInteger(columnNumber) || columnNumber < 0) {
    return null;
  }
  const componentName = normalizeComponentName(value.componentName);
  return {
    file,
    line: lineNumber,
    column: Math.max(1, columnNumber),
    ...(componentName === null ? {} : { componentName }),
  };
}

/** A usable development file path, or null. TWIN of `readSourceFile` in
 * apps/web/src/custom/designMode/engine/nativeSource.ts, which re-checks this on the far side
 * of the page-shared global — keep the two in step. Page-controlled: length-capped, and rejected
 * outright when it carries control characters (a newline-bearing "path" could otherwise inject
 * instruction lines into the agent's request). */
export function normalizeFilePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_FILE_LENGTH) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value) ? null : value;
}

/** Identifier-shaped display names only — the value is page-controlled and ends up inside the
 * agent's request text. TWIN of `readComponentName` in nativeSource.ts; keep the patterns
 * identical. */
const COMPONENT_NAME_PATTERN = /^[A-Za-z_$][\w$.]{0,63}$/;

export function normalizeComponentName(value: unknown): string | null {
  return typeof value === "string" && COMPONENT_NAME_PATTERN.test(value) ? value : null;
}

/**
 * Whether react-grab mapped the reported location back to authored source.
 *
 * react-grab marks each stack frame with `isSymbolicated`. The frame naming `filePath` is the
 * one that produced the reported line/column, so its flag is the one that counts. A missing
 * flag reads as symbolicated (older react-grab builds omit it, and rejecting every location
 * there would be a regression), and so does an absent stack — that is the pre-existing
 * contract for hosts whose resolver hands back a bare location.
 */
export function isSymbolicated(stack: unknown, filePath: unknown): boolean {
  if (!Array.isArray(stack) || stack.length === 0) return true;
  const frames = stack.filter(
    (frame): frame is { fileName?: unknown; isSymbolicated?: unknown } =>
      typeof frame === "object" && frame !== null,
  );
  const match = frames.find((frame) => frame.fileName === filePath) ?? frames[0];
  if (!match) return true;
  return match.isSymbolicated !== false;
}

/**
 * What survives when the host could not trust the location: the file (if it was well-formed)
 * and the component name, and NEVER a position. `line`/`column` are typed `never` rather than
 * omitted so the two arms of `ResolvedDesignSource` cannot be confused — a hint carrying a
 * line would be exactly the bug this whole path exists to prevent, and it now fails to compile
 * instead of relying on a comment to hold the invariant.
 */
export interface DesignSourceHint {
  file?: string;
  componentName?: string;
  line?: never;
  column?: never;
}

/** The two discrete shapes the resolver puts on the wire. Additive: an engine reading only
 * `file`/`line`/`column` sees exactly what it saw before, and a host predating this still
 * satisfies that engine. */
export type ResolvedDesignSource = DesignSourceResult | DesignSourceHint;

/**
 * The payload the resolver puts on the wire: the validated location when there is one,
 * otherwise the hint. The component name comes off the fiber and stays correct either way.
 */
export function describeResolvedSource(
  value: Parameters<typeof normalizeResolvedSource>[0],
): ResolvedDesignSource | null {
  const source = normalizeResolvedSource(value);
  if (source) return source;
  // The line was untrustworthy; the FILE was not. react-grab reads the path off the fiber's
  // module, which is the authored path either way — only the position inside it needs
  // symbolication. Forwarding it (explicitly without line/column) keeps the single most
  // useful part of a rejected location instead of discarding the whole thing.
  const componentName = normalizeComponentName(value?.componentName);
  const file = normalizeFilePath(value?.filePath);
  if (componentName === null && file === null) return null;
  return {
    ...(componentName === null ? {} : { componentName }),
    ...(file === null ? {} : { file }),
  };
}
