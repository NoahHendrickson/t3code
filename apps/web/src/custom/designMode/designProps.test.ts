import { describe, expect, it } from "vite-plus/test";

import {
  formatDesignProps,
  MAX_PROP_VALUE_LENGTH,
  MAX_PROPS,
  parsePropsAttr,
  readDesignProps,
} from "./designProps";

describe("readDesignProps", () => {
  it("keeps primitive props and drops everything else", () => {
    expect(
      readDesignProps({
        variant: "ghost",
        count: 3,
        disabled: false,
        onClick: () => {},
        style: { color: "red" },
        items: [1, 2],
        nested: null,
        big: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ variant: "ghost", count: 3, disabled: false });
  });

  it("excludes children even when primitive — the request already carries Text:", () => {
    expect(readDesignProps({ children: "Save", variant: "ghost" })).toEqual({
      variant: "ghost",
    });
  });

  it("drops non-JSX-shaped names and strings carrying control characters", () => {
    expect(
      readDesignProps({ "a b": "spaced", "data-testid": "send", label: "line\nbreak" }),
    ).toEqual({ "data-testid": "send" });
  });

  it("caps the entry count and slices oversized string values", () => {
    const bag: Record<string, string> = {};
    for (let i = 0; i < MAX_PROPS + 5; i += 1) bag[`p${i}`] = "x".repeat(200);
    const out = readDesignProps(bag);
    expect(Object.keys(out ?? {})).toHaveLength(MAX_PROPS);
    expect(out?.p0).toBe("x".repeat(MAX_PROP_VALUE_LENGTH));
  });

  it("returns null for non-objects and empty survivors", () => {
    expect(readDesignProps(null)).toBeNull();
    expect(readDesignProps("variant=ghost")).toBeNull();
    expect(readDesignProps([1, 2])).toBeNull();
    expect(readDesignProps({ onClick: () => {} })).toBeNull();
  });
});

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
