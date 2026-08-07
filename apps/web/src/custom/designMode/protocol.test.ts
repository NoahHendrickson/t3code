import { describe, expect, it } from "vite-plus/test";

import {
  countUnresolvedDesignElements,
  DESIGN_MODE_CONSOLE_PREFIX,
  DESIGN_MODE_STYLE_KEYS,
  parseDesignModeConsoleMessage,
} from "./protocol";

/**
 * The unresolved-count rule the pill and send toast surface: an element with a null
 * sourceLabel is one the request could not source-address by send time (the
 * SEND_SOURCE_WAIT_MS grace expired, or the page has no source mapping at all).
 */

const element = (sourceLabel: string | null) => ({ sourceLabel });

describe("countUnresolvedDesignElements", () => {
  it("counts only null sourceLabels", () => {
    expect(
      countUnresolvedDesignElements({
        elements: [element("App.tsx:12"), element(null), element("Card.tsx:8"), element(null)],
      }),
    ).toBe(2);
  });

  it("is zero when every element resolved", () => {
    expect(countUnresolvedDesignElements({ elements: [element("App.tsx:12")] })).toBe(0);
  });

  it("is zero for an empty element list", () => {
    expect(countUnresolvedDesignElements({ elements: [] })).toBe(0);
  });

  it("an empty-string label is resolved, not unresolved — only null means no source", () => {
    expect(countUnresolvedDesignElements({ elements: [element("")] })).toBe(0);
  });
});

/** A structurally complete snapshot the selection parser accepts, for varying one field. */
const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  tag: "div",
  sourceLabel: null,
  sourceState: "pending",
  styles: Object.fromEntries(DESIGN_MODE_STYLE_KEYS.map((key) => [key, "0px"])),
  sizeModes: { width: "fixed", height: "fixed" },
  offsets: { x: 0, y: 0 },
  positionState: "flow",
  alignCaps: { horizontal: true, vertical: true },
  drafted: [],
  ...overrides,
});

const selectionLine = (elements: unknown[]) =>
  DESIGN_MODE_CONSOLE_PREFIX + JSON.stringify({ type: "selection", elements });

describe("selection snapshot sourceState", () => {
  it.each(["resolved", "pending", "anonymous"])("accepts %s", (state) => {
    const message = parseDesignModeConsoleMessage(
      selectionLine([snapshot({ sourceState: state })]),
    );
    expect(message?.type).toBe("selection");
    expect(message?.type === "selection" && message.elements[0]?.sourceState).toBe(state);
  });

  it("rejects a snapshot without a sourceState — the disable gate must always get an answer", () => {
    const bare = snapshot();
    delete (bare as Record<string, unknown>).sourceState;
    expect(parseDesignModeConsoleMessage(selectionLine([bare]))).toBeNull();
  });

  it("rejects an unknown sourceState value", () => {
    expect(
      parseDesignModeConsoleMessage(selectionLine([snapshot({ sourceState: "maybe" })])),
    ).toBeNull();
  });
});
