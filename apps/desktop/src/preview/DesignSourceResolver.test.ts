import { describe, expect, it } from "vite-plus/test";

import { describeResolvedSource, normalizeResolvedSource } from "./DesignSourceResult.ts";

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

  it("carries the source location and component name — nothing else crosses", () => {
    const result = normalizeResolvedSource({
      ...VALID,
      componentName: "SubmitButton",
      selector: "button.primary",
      snippet: "<button/>",
    } as typeof VALID);
    expect(result).toEqual({
      file: VALID.filePath,
      line: 12,
      column: 4,
      componentName: "SubmitButton",
    });
  });

  it("drops a component name that is not identifier-shaped", () => {
    expect(normalizeResolvedSource({ ...VALID, componentName: "a b\nc" } as typeof VALID)).toEqual({
      file: VALID.filePath,
      line: 12,
      column: 4,
    });
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

  // The failure this guards: a 71-line ComposerControl.tsx reported "at line 135" — a real
  // position in the SERVED module, which reads as authoritative and sends the agent hunting.
  it("rejects a location react-grab could not symbolicate", () => {
    const stack = [{ fileName: VALID.filePath, isSymbolicated: false }];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)).toBeNull();
  });

  it("judges symbolication by the frame naming the reported file", () => {
    const stack = [
      { fileName: "/src/other.tsx", isSymbolicated: false },
      { fileName: VALID.filePath, isSymbolicated: true },
    ];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)?.line).toBe(12);
  });

  it("treats a missing flag or missing stack as symbolicated", () => {
    expect(normalizeResolvedSource({ ...VALID, stack: [] } as typeof VALID)?.line).toBe(12);
    expect(
      normalizeResolvedSource({ ...VALID, stack: [{ fileName: VALID.filePath }] } as typeof VALID)
        ?.line,
    ).toBe(12);
  });
});

describe("describeResolvedSource", () => {
  it("returns the full location when there is one", () => {
    expect(describeResolvedSource({ ...VALID, componentName: "Btn" } as typeof VALID)).toEqual({
      file: VALID.filePath,
      line: 12,
      column: 4,
      componentName: "Btn",
    });
  });

  // A rejected location loses the LINE, not the file: react-grab reads the path off the
  // fiber's module, and only the position inside it needed symbolication.
  it("keeps the component name and the file when the line is rejected", () => {
    const stack = [{ fileName: VALID.filePath, isSymbolicated: false }];
    expect(
      describeResolvedSource({ ...VALID, stack, componentName: "Btn" } as typeof VALID),
    ).toEqual({ componentName: "Btn", file: VALID.filePath });
  });

  it("never emits a line or column alongside a rejected location", () => {
    const stack = [{ fileName: VALID.filePath, isSymbolicated: false }];
    const result = describeResolvedSource({ ...VALID, stack } as typeof VALID);
    expect(result).toEqual({ file: VALID.filePath });
    expect(result).not.toHaveProperty("line");
    expect(result).not.toHaveProperty("column");
  });

  it("returns null when nothing usable survives", () => {
    expect(describeResolvedSource(null)).toBeNull();
    expect(describeResolvedSource({})).toBeNull();
    const stack = [{ fileName: "/a.tsx", isSymbolicated: false }];
    expect(describeResolvedSource({ filePath: "/src/App.tsx\u0000", stack } as never)).toBeNull();
  });
});
