import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const STORAGE_KEY = "t3code:fork:glass-new-agent-picture:v1";
const ATTRIBUTE = "data-fork-glass-picture";

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
  return { attributes, fireStorage, storageListeners };
}

// The initializer runs once per module instance, so each case loads its own.
async function initialize() {
  vi.resetModules();
  const module = await import("./forkGlassNewAgentPicture");
  expect(module.FORK_GLASS_PICTURE_OFF_ATTRIBUTE).toBe(ATTRIBUTE);
  return module.initializeForkGlassNewAgentPicture;
}

describe("initializeForkGlassNewAgentPicture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves the stage on when nothing is stored", async () => {
    const { attributes } = stubBrowser(null);
    (await initialize())();
    expect(attributes.has(ATTRIBUTE)).toBe(false);
  });

  it("stamps the root off before first render when the picture is switched off", async () => {
    const { attributes } = stubBrowser("false");
    (await initialize())();
    expect(attributes.get(ATTRIBUTE)).toBe("off");
  });

  it("follows another tab switching it back on", async () => {
    const { attributes, fireStorage } = stubBrowser("false");
    (await initialize())();
    fireStorage("true");
    expect(attributes.has(ATTRIBUTE)).toBe(false);
  });

  it("treats an unreadable value as on", async () => {
    const { attributes } = stubBrowser("not json");
    (await initialize())();
    expect(attributes.has(ATTRIBUTE)).toBe(false);
  });

  it("listens once however often it is called", async () => {
    const { storageListeners } = stubBrowser(null);
    const init = await initialize();
    init();
    init();
    expect(storageListeners).toHaveLength(1);
  });
});
