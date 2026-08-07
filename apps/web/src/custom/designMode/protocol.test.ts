import { describe, expect, it } from "vite-plus/test";

import { countUnresolvedDesignElements } from "./protocol";

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
