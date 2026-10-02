import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  effortStopIndex,
  findEffortDescriptor,
  orderTraitRows,
  type SelectDescriptor,
} from "./composerModelTraits";

const claudeEffort: SelectDescriptor = {
  id: "effort",
  label: "Reasoning",
  type: "select",
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High", isDefault: true },
    { id: "max", label: "Max" },
    { id: "ultrathink", label: "Ultrathink" },
  ],
  promptInjectedValues: ["ultrathink"],
};

describe("findEffortDescriptor", () => {
  it("finds each provider's effort option, skipping traits that come first", () => {
    const contextWindow: ProviderOptionDescriptor = {
      id: "contextWindow",
      label: "Context Window",
      type: "select",
      options: [
        { id: "200k", label: "200k" },
        { id: "1m", label: "1M" },
      ],
    };
    for (const id of ["effort", "reasoningEffort", "reasoning", "variant"]) {
      const effort = { ...claudeEffort, id };
      expect(findEffortDescriptor([contextWindow, effort])).toBe(effort);
    }
  });

  it("leaves a single-level effort to the segmented controls", () => {
    const fixed = { ...claudeEffort, options: [{ id: "high", label: "High" }] };
    expect(findEffortDescriptor([fixed])).toBeNull();
  });
});

describe("effortStopIndex", () => {
  it("lands on the stored level, else the default", () => {
    expect(effortStopIndex({ ...claudeEffort, currentValue: "max" }, false)).toBe(3);
    expect(effortStopIndex(claudeEffort, false)).toBe(2);
  });

  it("lands on Ultrathink while the prompt carries it, whatever is stored", () => {
    expect(effortStopIndex({ ...claudeEffort, currentValue: "low" }, true)).toBe(4);
  });
});

describe("orderTraitRows", () => {
  it("puts Fast Mode above Context Window at the bottom, whatever order the provider lists", () => {
    const fastMode: ProviderOptionDescriptor = {
      id: "fastMode",
      label: "Fast Mode",
      type: "boolean",
    };
    const thinking: ProviderOptionDescriptor = {
      id: "thinking",
      label: "Thinking",
      type: "boolean",
    };
    const contextWindow: ProviderOptionDescriptor = {
      id: "contextWindow",
      label: "Context Window",
      type: "select",
      options: [{ id: "1m", label: "1M" }],
    };
    // Claude lists Fast Mode before Context Window; Cursor lists them the other way round.
    const claude = [claudeEffort, fastMode, contextWindow];
    const cursor = [{ ...claudeEffort, id: "reasoning" }, contextWindow, thinking, fastMode];
    expect(orderTraitRows(claude, claudeEffort).map((d) => d.id)).toEqual([
      "fastMode",
      "contextWindow",
    ]);
    expect(orderTraitRows(cursor, null).map((d) => d.id)).toEqual([
      "reasoning",
      "thinking",
      "fastMode",
      "contextWindow",
    ]);
  });
});
