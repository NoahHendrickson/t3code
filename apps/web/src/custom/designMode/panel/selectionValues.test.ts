import { describe, expect, it } from "vite-plus/test";

import {
  DESIGN_MODE_STYLE_KEYS,
  type DesignModeElementSnapshot,
  type DesignModeStyleKey,
} from "../protocol";
import { fieldStateFor, isDrafted, isMixed } from "./selectionValues";

function snapshot(
  id: number,
  styles: Partial<Record<DesignModeStyleKey, string>>,
  drafted: string[] = [],
): DesignModeElementSnapshot {
  const full = Object.fromEntries(DESIGN_MODE_STYLE_KEYS.map((key) => [key, ""])) as Record<
    DesignModeStyleKey,
    string
  >;
  return {
    id,
    tag: "div",
    sourceLabel: null,
    sourceState: "resolved",
    styles: { ...full, ...styles },
    sizeModes: { width: "fixed", height: "fixed" },
    offsets: { x: 0, y: 0 },
    positionState: "flow",
    alignCaps: { horizontal: true, vertical: true },
    drafted,
  };
}

describe("selection values", () => {
  it("reports mixed only when the selection actually disagrees", () => {
    const a = snapshot(1, { width: "100px", "padding-top": "8px" });
    const b = snapshot(2, { width: "240px", "padding-top": "8px" });
    // One element can never be mixed with itself.
    expect(isMixed([a], "width")).toBe(false);
    expect(isMixed([a, b], "width")).toBe(true);
    expect(isMixed([a, b], "padding-top")).toBe(false);
    // Any key in the group disagreeing makes the field mixed.
    expect(isMixed([a, b], ["padding-top", "width"])).toBe(true);
    expect(isMixed([], "width")).toBe(false);
  });

  it("counts a property as changed when ANY selected element drafts it", () => {
    const a = snapshot(1, {}, ["padding-top"]);
    const b = snapshot(2, {}, []);
    expect(isDrafted([a, b], ["padding-top"])).toBe(true);
    expect(isDrafted([b], ["padding-top"])).toBe(false);
    expect(isDrafted([a, b], ["margin-top"])).toBe(false);
  });

  it("reverts the properties the field WRITES, not the ones it displays", () => {
    // The gap field reads row-gap/column-gap but drafts the `gap` shorthand.
    const drafted = snapshot(1, { "row-gap": "8px" }, ["gap"]);
    const reverted: string[][] = [];
    const field = fieldStateFor([drafted], (properties) => reverted.push([...properties]));
    const state = field(["row-gap", "column-gap"], ["gap"]);
    expect(state.drafted).toBe(true);
    state.onRevert();
    expect(reverted).toEqual([["gap"]]);
  });
});
