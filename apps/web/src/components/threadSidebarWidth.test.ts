import { describe, expect, it } from "vite-plus/test";
import {
  clampThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  /* fork:begin narrow-workspace-layout — see .fork/customizations.yaml#narrow-workspace-layout */
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  /* fork:end narrow-workspace-layout */
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("resolveThreadSidebarMinimumWidth", () => {
  it("keeps the default minimum when the brand fits", () => {
    expect(resolveThreadSidebarMinimumWidth(0)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
    expect(resolveThreadSidebarMinimumWidth(194)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("grows to a brand wider than the default, rounding up", () => {
    expect(resolveThreadSidebarMinimumWidth(237.2)).toBe(238);
  });
});

describe("resolveThreadSidebarMaximumWidth", () => {
  it("never drops below a raised minimum on a narrow viewport", () => {
    /* fork:begin narrow-workspace-layout — see .fork/customizations.yaml#narrow-workspace-layout */
    // The shadow lowers the main-content reserve, so the viewports are stated
    // relative to it rather than as upstream's literal 800 and 1200.
    expect(resolveThreadSidebarMaximumWidth(THREAD_MAIN_CONTENT_MIN_WIDTH + 160, 238)).toBe(238);
    expect(resolveThreadSidebarMaximumWidth(THREAD_MAIN_CONTENT_MIN_WIDTH + 560, 238)).toBe(560);
    /* fork:end narrow-workspace-layout */
  });
});

describe("clampThreadSidebarWidth", () => {
  it("widens a stored width below a raised minimum", () => {
    expect(clampThreadSidebarWidth(208, 238, 560)).toBe(238);
  });

  it("keeps widths inside the range and caps wide ones", () => {
    expect(clampThreadSidebarWidth(300, 238, 560)).toBe(300);
    expect(clampThreadSidebarWidth(900, 238, 560)).toBe(560);
  });
});
