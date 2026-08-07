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
  //
  // The shape below is what react-grab 0.1.44 ACTUALLY emits on failure: the frame comes back
  // untouched, with no `isSymbolicated` key at all. There is no `isSymbolicated: false` in the
  // dist, which is why the gate tests `=== true`. Asserting on a hand-written `false` would
  // pass against a shape the library never produces.
  it("rejects a frame that carries no symbolication flag", () => {
    const stack = [{ fileName: VALID.filePath, lineNumber: 12, columnNumber: 4 }];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)).toBeNull();
  });

  it("accepts only an explicitly symbolicated frame", () => {
    const stack = [
      { fileName: VALID.filePath, lineNumber: 12, columnNumber: 4, isSymbolicated: true },
    ];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)?.line).toBe(12);
  });

  it("pairs the frame by position, not by raw fileName", () => {
    // react-grab reports a served URL on the frame and a normalized path on the context, so a
    // raw string compare misses and the verdict used to fall to frames[0].
    const stack = [
      { fileName: "http://localhost:5173/src/other.tsx", lineNumber: 99, columnNumber: 1 },
      {
        fileName: "http://localhost:5173/src/components/Button.tsx?t=1",
        lineNumber: 12,
        columnNumber: 4,
        isSymbolicated: true,
      },
    ];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)?.line).toBe(12);
  });

  it("pairs by comparable path when position is ambiguous", () => {
    const stack = [
      { fileName: "http://localhost:5173/src/other.tsx", lineNumber: 12, columnNumber: 4 },
      {
        fileName: "http://localhost:5173/src/components/Button.tsx?t=1",
        lineNumber: 12,
        columnNumber: 4,
        isSymbolicated: true,
      },
    ];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)?.line).toBe(12);
  });

  it("fails closed when the reporting frame cannot be identified", () => {
    const stack = [{ fileName: "/src/unrelated.tsx", lineNumber: 500, columnNumber: 9 }];
    expect(normalizeResolvedSource({ ...VALID, stack } as typeof VALID)).toBeNull();
  });

  it("still trusts a bare location with no stack at all", () => {
    expect(normalizeResolvedSource({ ...VALID, stack: [] } as typeof VALID)?.line).toBe(12);
    expect(normalizeResolvedSource(VALID)?.line).toBe(12);
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
    const stack = [{ fileName: VALID.filePath, lineNumber: 12, columnNumber: 4 }];
    expect(
      describeResolvedSource({ ...VALID, stack, componentName: "Btn" } as typeof VALID),
    ).toEqual({ componentName: "Btn", file: VALID.filePath });
  });

  it("never emits a line or column alongside a rejected location", () => {
    const stack = [{ fileName: VALID.filePath, lineNumber: 12, columnNumber: 4 }];
    const result = describeResolvedSource({ ...VALID, stack } as typeof VALID);
    expect(result).toEqual({ file: VALID.filePath });
    expect(result).not.toHaveProperty("line");
    expect(result).not.toHaveProperty("column");
  });

  it("returns null when nothing usable survives", () => {
    expect(describeResolvedSource(null)).toBeNull();
    expect(describeResolvedSource({})).toBeNull();
    const stack = [{ fileName: "/a.tsx" }];
    expect(describeResolvedSource({ filePath: "/src/App.tsx\u0000", stack } as never)).toBeNull();
  });
});
