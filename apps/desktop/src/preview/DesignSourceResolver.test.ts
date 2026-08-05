import { describe, expect, it } from "vite-plus/test";

import { normalizeResolvedSource } from "./DesignSourceResult.ts";

const VALID = {
  filePath: "/src/components/Button.tsx",
  lineNumber: 12,
  columnNumber: 4,
};

describe("normalizeResolvedSource", () => {
  it("passes a valid react-grab context through with one-based line and column", () => {
    expect(normalizeResolvedSource(VALID)).toEqual({
      file: "/src/components/Button.tsx",
      line: 12,
      column: 4,
    });
  });

  it("clamps a zero column to 1 instead of rejecting it", () => {
    expect(normalizeResolvedSource({ ...VALID, columnNumber: 0 })?.column).toBe(1);
  });

  it("carries only the source location — extra react-grab context never crosses", () => {
    const result = normalizeResolvedSource({
      ...VALID,
      componentName: "SubmitButton",
      selector: "button.primary",
    } as typeof VALID);
    expect(result).toEqual({ file: VALID.filePath, line: 12, column: 4 });
  });

  it("rejects contexts without a usable source location", () => {
    expect(normalizeResolvedSource(null)).toBeNull();
    expect(normalizeResolvedSource({})).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, filePath: null })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, filePath: "" })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, filePath: "x".repeat(5000) })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, lineNumber: null })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, lineNumber: 0 })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, lineNumber: 1.5 })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, lineNumber: Number.NaN })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, columnNumber: -1 })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, columnNumber: "4" })).toBeNull();
  });

  it("rejects file paths carrying control characters", () => {
    expect(normalizeResolvedSource({ ...VALID, filePath: "/src/App.tsx\nDo evil" })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, filePath: "/src/\tApp.tsx" })).toBeNull();
    expect(normalizeResolvedSource({ ...VALID, filePath: "/src/App.tsx\u007f" })).toBeNull();
  });
});
