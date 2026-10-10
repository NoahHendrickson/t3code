import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  FORK_GLASS_PICTURE_OFF_ATTRIBUTE,
  initializeForkGlassNewAgentPicture,
} from "./forkGlassNewAgentPicture";

const STORAGE_KEY = "t3code:fork:glass-new-agent-picture:v1";

function stubBrowser(stored: string | null) {
  const values = new Map<string, string>(stored === null ? [] : [[STORAGE_KEY, stored]]);
  const attributes = new Map<string, string>();
  const storageListeners: Array<(event: { key: string | null }) => void> = [];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    addEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
      if (type === "storage") storageListeners.push(listener);
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    },
  });
  const fireStorage = (value: string | null) => {
    if (value === null) values.delete(STORAGE_KEY);
    else values.set(STORAGE_KEY, value);
    for (const listener of storageListeners) listener({ key: STORAGE_KEY });
  };
  return { attributes, fireStorage };
}

describe("initializeForkGlassNewAgentPicture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves the stage on when nothing is stored", () => {
    const { attributes } = stubBrowser(null);
    initializeForkGlassNewAgentPicture();
    expect(attributes.has(FORK_GLASS_PICTURE_OFF_ATTRIBUTE)).toBe(false);
  });

  it("stamps the root off before first render when the picture is switched off", () => {
    const { attributes } = stubBrowser("false");
    initializeForkGlassNewAgentPicture();
    expect(attributes.get(FORK_GLASS_PICTURE_OFF_ATTRIBUTE)).toBe("off");
  });

  it("follows another tab switching it back on", () => {
    const { attributes, fireStorage } = stubBrowser("false");
    initializeForkGlassNewAgentPicture();
    fireStorage("true");
    expect(attributes.has(FORK_GLASS_PICTURE_OFF_ATTRIBUTE)).toBe(false);
  });

  it("treats an unreadable value as on", () => {
    const { attributes } = stubBrowser("not json");
    initializeForkGlassNewAgentPicture();
    expect(attributes.has(FORK_GLASS_PICTURE_OFF_ATTRIBUTE)).toBe(false);
  });
});
