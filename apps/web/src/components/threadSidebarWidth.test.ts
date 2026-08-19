// @effect-diagnostics nodeBuiltinImport:off - Regression coverage compares the sidebar component with its width contract.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_DEFAULT_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("thread sidebar width", () => {
  it("uses the default width when no preference is stored", () => {
    expect(resolveInitialThreadSidebarWidth(null, 1200)).toBe(THREAD_SIDEBAR_DEFAULT_WIDTH);
  });

  it("uses a stored width in the initial render", () => {
    expect(resolveInitialThreadSidebarWidth(360, 1200)).toBe(360);
  });

  it("clamps a stored width to the sidebar minimum", () => {
    expect(resolveInitialThreadSidebarWidth(120, 1200)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("leaves enough room for the main content on a smaller window", () => {
    const viewportWidth = 1000;

    expect(resolveInitialThreadSidebarWidth(900, viewportWidth)).toBe(
      viewportWidth - THREAD_MAIN_CONTENT_MIN_WIDTH,
    );
  });

  it("keeps the sidebar minimum when the whole layout is narrower than its minimums", () => {
    /* fork:begin narrow-workspace-layout — see .fork/customizations.yaml#narrow-workspace-layout
       Derived from the two minimums rather than hardcoded at 700, which is only
       narrower than their sum while THREAD_MAIN_CONTENT_MIN_WIDTH is upstream's
       40rem. The fork's 400px moves that sum to 608 and left this asserting the
       opposite of its own name. Holds for either constant. */
    const narrowerThanBothMinimums = THREAD_SIDEBAR_MIN_WIDTH + THREAD_MAIN_CONTENT_MIN_WIDTH - 1;

    expect(resolveInitialThreadSidebarWidth(900, narrowerThanBothMinimums)).toBe(
      THREAD_SIDEBAR_MIN_WIDTH,
    );
    /* fork:end narrow-workspace-layout */
  });

  it("shows the desktop wordmark across the sidebar's full legal width range", () => {
    const sidebarSource = NodeFS.readFileSync(
      new URL("./sidebar/SidebarChrome.tsx", import.meta.url),
      "utf8",
    );

    /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
       Upstream asserts its T3Wordmark link classes; the fork brand is its own
       mark + APP_BASE_NAME lockup (fork-sidebar-chrome), truncating rather
       than hiding, so the outcome under test — a brand that survives the
       sidebar's minimum width — is carried by min-w-0 + truncate instead. */
    expect(sidebarSource).toContain("sidebar-brand ml-auto h-6 w-fit min-w-0 shrink-0");
    expect(sidebarSource).toContain('className="truncate');
    /* fork:end fork-app-identity */
    expect(THREAD_SIDEBAR_MIN_WIDTH).toBe(13 * 16);
  });
});
