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
const MAX_LABEL_LENGTH = 256;

export interface DesignSourceResult {
  file: string;
  line: number;
  column: number;
  componentName: string | null;
  selector: string | null;
}

const boundedLabel = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value.slice(0, MAX_LABEL_LENGTH) : null;

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
    selector?: unknown;
  } | null,
): DesignSourceResult | null {
  if (!value || typeof value !== "object") return null;
  const { filePath, lineNumber, columnNumber } = value;
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > MAX_FILE_LENGTH) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(filePath)) return null;
  if (typeof lineNumber !== "number" || !Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }
  if (typeof columnNumber !== "number" || !Number.isInteger(columnNumber) || columnNumber < 0) {
    return null;
  }
  return {
    file: filePath,
    line: lineNumber,
    column: Math.max(1, columnNumber),
    componentName: boundedLabel(value.componentName),
    selector: boundedLabel(value.selector),
  };
}
