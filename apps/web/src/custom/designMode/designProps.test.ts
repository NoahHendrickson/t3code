import { describe, expect, it } from "vite-plus/test";

import { formatDesignProps, parsePropsAttr } from "./designProps";

describe("parsePropsAttr", () => {
  it("round-trips a stamped attribute", () => {
    const attr = JSON.stringify({ variant: "ghost", count: 2, active: true });
    expect(parsePropsAttr(attr)).toEqual({ variant: "ghost", count: 2, active: true });
  });

  it("re-validates — the attribute is page-controlled like data-dc-source", () => {
    expect(parsePropsAttr(JSON.stringify({ children: "x", ok: "y" }))).toEqual({ ok: "y" });
    expect(parsePropsAttr(JSON.stringify(["not", "a", "bag"]))).toBeNull();
  });

  it("returns null for missing or malformed JSON", () => {
    expect(parsePropsAttr(null)).toBeNull();
    expect(parsePropsAttr("")).toBeNull();
    expect(parsePropsAttr("{not json")).toBeNull();
  });
});

describe("formatDesignProps", () => {
  it("renders the JSX vocabulary the agent will grep for", () => {
    expect(formatDesignProps({ variant: "ghost", count: 3, disabled: true, open: false })).toBe(
      'variant="ghost" count={3} disabled open={false}',
    );
  });

  it("quote-escapes string values so they cannot break out of the attribute", () => {
    expect(formatDesignProps({ label: 'say "hi"' })).toBe('label="say \\"hi\\""');
  });
});
