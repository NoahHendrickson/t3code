import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  SIDEBAR_VIBRANCY_ATTRIBUTE,
  applySidebarVibrancyAttribute,
  syncForkSidebarVibrancy,
} from "./forkSidebarVibrancy";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fork sidebar vibrancy", () => {
  it("stamps and clears the vibrancy attribute", () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
      removeAttribute(name: string) {
        attrs.delete(name);
      },
    };
    applySidebarVibrancyAttribute(root, true);
    expect(attrs.get(SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe("true");
    applySidebarVibrancyAttribute(root, false);
    expect(attrs.has(SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);
  });

  it("always disables vibrancy and clears the marker", async () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
      removeAttribute(name: string) {
        attrs.delete(name);
      },
    };
    vi.stubGlobal("document", { documentElement: root });
    applySidebarVibrancyAttribute(root, true);

    vi.stubGlobal("window", {});
    expect(await syncForkSidebarVibrancy("neutral-darker")).toBe(false);
    expect(attrs.has(SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);

    applySidebarVibrancyAttribute(root, true);
    const setForkSidebarVibrancy = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("window", { desktopBridge: { setForkSidebarVibrancy } });
    expect(await syncForkSidebarVibrancy("neutral-darker")).toBe(false);
    expect(setForkSidebarVibrancy).toHaveBeenCalledWith(false);
    expect(attrs.has(SIDEBAR_VIBRANCY_ATTRIBUTE)).toBe(false);
  });
});
