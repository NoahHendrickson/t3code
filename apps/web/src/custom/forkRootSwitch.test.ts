import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const STORAGE_KEY = "t3code:fork:test-switch:v1";
const ATTRIBUTE = "data-fork-test-switch";

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

async function initialize() {
  const { createForkRootSwitch } = await import("./forkRootSwitch");
  return createForkRootSwitch({ storageKey: STORAGE_KEY, attribute: ATTRIBUTE }).initialize;
}

describe("createForkRootSwitch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves the root on when nothing is stored", async () => {
    const { attributes } = stubBrowser(null);
    (await initialize())();
    expect(attributes.has(ATTRIBUTE)).toBe(false);
  });

  it("stamps the root off before first render when switched off", async () => {
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

describe("the Glass switches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("each stamp their own attribute from their own key", async () => {
    vi.resetModules();
    const values = new Map([
      ["t3code:fork:glass-3d:v1", "false"],
      ["t3code:fork:glass-new-agent-picture:v1", "true"],
    ]);
    const attributes = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => values.get(key) ?? null },
      addEventListener: () => {},
    });
    vi.stubGlobal("document", {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      },
    });
    const glass3d = await import("./forkGlass3d");
    const picture = await import("./forkGlassNewAgentPicture");
    glass3d.initializeForkGlass3d();
    picture.initializeForkGlassNewAgentPicture();
    expect(Object.fromEntries(attributes)).toEqual({
      [glass3d.FORK_GLASS_3D_OFF_ATTRIBUTE]: "off",
    });
  });
});
