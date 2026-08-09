/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The pure half of the preview design-source resolver: the result shape handed to
 * the Design-mode engine and the validation that produces it. Kept free of
 * react-grab/DOM imports so it stays unit-testable under node (the same split
 * PickLabelPosition.ts uses beside PickPreload.ts).
 */

import {
  type ForkDesignProps,
  MAX_DESIGN_PROP_VALUE_LENGTH,
  MAX_DESIGN_PROPS,
  normalizeForkDesignProps,
} from "@t3tools/shared/forkDesignProps";

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
  props?: ResolvedProps;
}

/** Local names for the shared props policy (`@t3tools/shared/forkDesignProps`), which the
 * guest engine re-validates against too. The POLICY has one implementation; the CALLS stay
 * dual on purpose — this side cannot vouch for what the page later writes into the
 * `data-t3-props` attribute the engine reads back off the DOM. */
export type ResolvedProps = ForkDesignProps;
export const MAX_PROPS = MAX_DESIGN_PROPS;
export const MAX_PROP_VALUE_LENGTH = MAX_DESIGN_PROP_VALUE_LENGTH;
export const normalizeResolvedProps = normalizeForkDesignProps;

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
    props?: unknown;
    stack?: unknown;
  } | null,
): DesignSourceResult | null {
  if (!value || typeof value !== "object") return null;
  const { filePath, lineNumber, columnNumber } = value;
  // An unsymbolicated frame reports GENERATED coordinates — the line in the module Vite
  // served, not in the file the agent will open. Rejecting the location outright is
  // deliberate: the engine's fallback (selector + component name) beats a confident pointer
  // at the wrong line of the right file, which reads as authoritative and is not.
  if (!isSymbolicated(value.stack, value)) return null;
  const file = normalizeFilePath(filePath);
  if (file === null) return null;
  if (typeof lineNumber !== "number" || !Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }
  if (typeof columnNumber !== "number" || !Number.isInteger(columnNumber) || columnNumber < 0) {
    return null;
  }
  const componentName = normalizeComponentName(value.componentName);
  // Gated on the component name: props are rendered as `<Name> — props: ...` in the request,
  // and a props bag with no component to hang it on has nowhere honest to appear.
  const props = componentName === null ? null : normalizeResolvedProps(value.props);
  return {
    file,
    line: lineNumber,
    column: Math.max(1, columnNumber),
    ...(componentName === null ? {} : { componentName }),
    ...(props === null ? {} : { props }),
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

/** react-grab reports a frame's raw `fileName` (a served URL like
 * `http://host/src/App.tsx?t=123`) but derives the context's `filePath` from it, so the two are
 * not comparable as-is. Reduced to a comparable path: origin, query, hash and a leading `./`
 * removed. Deliberately loose — this only has to pair a frame with the location it produced. */
function comparablePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let path = value;
  const scheme = path.indexOf("://");
  if (scheme !== -1) {
    const afterHost = path.indexOf("/", scheme + 3);
    path = afterHost === -1 ? "" : path.slice(afterHost);
  }
  const cut = Math.min(
    path.indexOf("?") === -1 ? path.length : path.indexOf("?"),
    path.indexOf("#") === -1 ? path.length : path.indexOf("#"),
  );
  path = path.slice(0, cut);
  if (path.startsWith("./")) path = path.slice(2);
  return path.length === 0 ? null : path;
}

interface RawFrame {
  fileName?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
  isSymbolicated?: unknown;
}

/** The frame that produced the reported location, or null when it cannot be identified.
 *
 * Position is the stronger signal and is tried first: `line`/`column` are copied verbatim from
 * the frame react-grab selected, whereas the path has been through its normalizer. The path
 * comparison is the fallback, on comparable form rather than raw. `frames[0]` is deliberately
 * NOT a fallback — it is not necessarily the reporting frame, and guessing here is what makes
 * the flag check meaningless. */
function findReportingFrame(
  frames: readonly RawFrame[],
  value: {
    filePath?: unknown;
    lineNumber?: unknown;
    columnNumber?: unknown;
  },
): RawFrame | null {
  const byPosition = frames.filter(
    (frame) => frame.lineNumber === value.lineNumber && frame.columnNumber === value.columnNumber,
  );
  if (byPosition.length === 1) return byPosition[0] ?? null;
  const wanted = comparablePath(value.filePath);
  if (wanted !== null) {
    const byPath = frames.filter((frame) => {
      const candidate = comparablePath(frame.fileName);
      return candidate !== null && (candidate === wanted || candidate.endsWith(wanted));
    });
    if (byPath.length >= 1) return byPath[0] ?? null;
  }
  return byPosition[0] ?? null;
}

/**
 * Whether react-grab mapped the reported location back to authored source.
 *
 * The check is `=== true`, not `!== false`, because of how the library actually reports this.
 * In react-grab 0.1.44 / bippy 0.5.41 the symbolicating function is
 * `return mapped ? {...frame, isSymbolicated: true} : frame` — a frame it FAILED to symbolicate
 * comes back untouched, carrying no flag at all. `!== false` therefore read every failure as a
 * success and passed generated coordinates straight through, which is the entire bug this gate
 * exists to stop. There is no `isSymbolicated: false` anywhere in either dist.
 *
 * Consequence worth stating: a host whose resolver emits frames without the flag now loses its
 * locations. That is the safe direction — an unflagged frame is indistinguishable from a failed
 * one, and a wrong line costs more than a missing one. An absent stack is still trusted, which
 * is the pre-existing contract for hosts that hand back a bare location with no stack at all.
 */
export function isSymbolicated(
  stack: unknown,
  value: { filePath?: unknown; lineNumber?: unknown; columnNumber?: unknown },
): boolean {
  if (!Array.isArray(stack) || stack.length === 0) return true;
  const frames = stack.filter(
    (frame): frame is RawFrame => typeof frame === "object" && frame !== null,
  );
  if (frames.length === 0) return true;
  const reporting = findReportingFrame(frames, value);
  // Fail closed: an unidentifiable frame means the flag cannot be read at all.
  if (!reporting) return false;
  return reporting.isSymbolicated === true;
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
  props?: ResolvedProps;
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
  // Props survive a rejected location exactly like the component name does — both come off
  // the fiber, and both matter MOST when there is no line to point at. Same component-name
  // gate as the full-location arm.
  const props = componentName === null ? null : normalizeResolvedProps(value?.props);
  return {
    ...(componentName === null ? {} : { componentName }),
    ...(file === null ? {} : { file }),
    ...(props === null ? {} : { props }),
  };
}
