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
  const Schema = await import("effect/Schema");
  const { createForkRootSetting } = await import("./forkRootSetting");
  return createForkRootSetting({
    storageKey: STORAGE_KEY,
    attribute: ATTRIBUTE,
    schema: Schema.Boolean,
    defaultValue: true,
    attributeValue: (enabled) => (enabled ? null : "off"),
  }).initialize;
}

describe("createForkRootSetting", () => {
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

describe("the Glass settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function stamp(glass3d: string | null) {
    vi.resetModules();
    const values = new Map([["t3code:fork:glass-new-agent-picture:v1", "true"]]);
    if (glass3d !== null) values.set("t3code:fork:glass-3d:v1", glass3d);
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
    const glass3dModule = await import("./forkGlass3d");
    const picture = await import("./forkGlassNewAgentPicture");
    glass3dModule.initializeForkGlass3d();
    picture.initializeForkGlassNewAgentPicture();
    return Object.fromEntries(attributes);
  }

  it("stamps nothing at Full, the picture on", async () => {
    expect(await stamp(null)).toEqual({});
    expect(await stamp('"full"')).toEqual({});
  });

  it("stamps the 3D mode short of Full", async () => {
    expect(await stamp('"selection"')).toEqual({ "data-fork-glass-3d": "selection" });
    expect(await stamp('"off"')).toEqual({ "data-fork-glass-3d": "off" });
  });

  it("reads an unknown stored value as Full", async () => {
    expect(await stamp("false")).toEqual({});
  });
});
