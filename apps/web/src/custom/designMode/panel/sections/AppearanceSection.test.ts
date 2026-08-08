import { describe, expect, it } from "vite-plus/test";

import {
  DESIGN_MODE_STYLE_KEYS,
  type DesignModeElementSnapshot,
  type DesignModeStyleKey,
} from "../../protocol";
import { hasCustomCornerRadii } from "./AppearanceSection";

function styles(
  corners: Partial<
    Record<
      | "border-top-left-radius"
      | "border-top-right-radius"
      | "border-bottom-right-radius"
      | "border-bottom-left-radius",
      string
    >
  >,
): DesignModeElementSnapshot["styles"] {
  const full = Object.fromEntries(DESIGN_MODE_STYLE_KEYS.map((key) => [key, "0px"])) as Record<
    DesignModeStyleKey,
    string
  >;
  return { ...full, ...corners };
}

describe("hasCustomCornerRadii", () => {
  it("is false when every corner matches", () => {
    expect(
      hasCustomCornerRadii(
        styles({
          "border-top-left-radius": "4px",
          "border-top-right-radius": "4px",
          "border-bottom-right-radius": "4px",
          "border-bottom-left-radius": "4px",
        }),
      ),
    ).toBe(false);
  });

  it("is true when any corner disagrees", () => {
    expect(
      hasCustomCornerRadii(
        styles({
          "border-top-left-radius": "4px",
          "border-top-right-radius": "0px",
          "border-bottom-right-radius": "0px",
          "border-bottom-left-radius": "4px",
        }),
      ),
    ).toBe(true);
  });
});
