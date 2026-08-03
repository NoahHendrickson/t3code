import { describe, expect, it, vi } from "vite-plus/test";

import {
  SIDEBAR_V2_LIST_ADD_KEYFRAMES,
  SIDEBAR_V2_LIST_ANIMATION_DURATION_MS,
  SIDEBAR_V2_LIST_ANIMATION_EASING,
  SIDEBAR_V2_LIST_REMOVE_KEYFRAMES,
  sidebarV2ListAnimationDurationMs,
} from "./sidebarV2ListAnimation";

describe("sidebarV2ListAnimation", () => {
  it("makes add the reverse of remove with the same timing", () => {
    expect([...SIDEBAR_V2_LIST_ADD_KEYFRAMES]).toEqual(
      [...SIDEBAR_V2_LIST_REMOVE_KEYFRAMES].reverse(),
    );
    expect(SIDEBAR_V2_LIST_ANIMATION_DURATION_MS).toBe(150);
    expect(SIDEBAR_V2_LIST_ANIMATION_EASING).toBe("ease-out");
  });

  it("uses the remove duration unless prefers-reduced-motion is set", () => {
    expect(sidebarV2ListAnimationDurationMs(() => ({ matches: false }))).toBe(
      SIDEBAR_V2_LIST_ANIMATION_DURATION_MS,
    );

    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(sidebarV2ListAnimationDurationMs(matchMedia)).toBe(0);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
