import { describe, expect, it } from "vite-plus/test";

import {
  MAX_DESIGN_PROP_VALUE_LENGTH,
  MAX_DESIGN_PROPS,
  normalizeForkDesignProps,
} from "./forkDesignProps.ts";

/**
 * These own the POLICY. Both trust boundaries call it independently — the desktop
 * resolver on a React fiber, the guest engine on a page-controlled `data-t3-props`
 * attribute — so the rules are asserted once, here, rather than twice against two copies.
 */
describe("normalizeForkDesignProps", () => {
  it("keeps primitives and drops everything a props bag should never carry", () => {
    expect(
      normalizeForkDesignProps({
        variant: "ghost",
        count: 3,
        disabled: false,
        onClick: () => {},
        style: { color: "red" },
        items: [1, 2],
        nested: null,
        notFinite: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ variant: "ghost", count: 3, disabled: false });
  });

  it("excludes children even when primitive — the request already carries the text", () => {
    expect(normalizeForkDesignProps({ children: "Save", variant: "ghost" })).toEqual({
      variant: "ghost",
    });
  });

  it("skips non-JSX-shaped names but keeps data-/aria- ones", () => {
    expect(
      normalizeForkDesignProps({ "a b": "spaced", "data-testid": "send", "aria-label": "Send" }),
    ).toEqual({ "data-testid": "send", "aria-label": "Send" });
  });

  it("rejects strings carrying control characters, including DEL", () => {
    // The request-injection guard: a newline-bearing value could otherwise open a new
    // instruction line in the agent's request text.
    // Escapes, never literal bytes — a raw NUL in a source file makes git call it binary.
    expect(
      normalizeForkDesignProps({ nl: "line\nbreak", nul: "a\u0000b", del: "a\u007fb" }),
    ).toBeNull();
    // Tab is a control character on this rule too.
    expect(normalizeForkDesignProps({ tabbed: "tab\tinside", ok: "fine" })).toEqual({
      ok: "fine",
    });
  });

  it("caps the entry count and slices oversized string values", () => {
    const bag: Record<string, string> = {};
    for (let i = 0; i < MAX_DESIGN_PROPS + 5; i += 1) bag[`p${i}`] = "x".repeat(200);
    const out = normalizeForkDesignProps(bag);
    expect(Object.keys(out ?? {})).toHaveLength(MAX_DESIGN_PROPS);
    expect(out?.p0).toBe("x".repeat(MAX_DESIGN_PROP_VALUE_LENGTH));
  });

  it("returns null rather than an empty bag when nothing survives", () => {
    expect(normalizeForkDesignProps(null)).toBeNull();
    expect(normalizeForkDesignProps("variant=ghost")).toBeNull();
    expect(normalizeForkDesignProps([1, 2])).toBeNull();
    expect(normalizeForkDesignProps({ onClick: () => {} })).toBeNull();
  });
});
