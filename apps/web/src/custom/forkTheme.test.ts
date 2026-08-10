import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createStorage(
  initial: Record<string, string> = {},
  overrides: Partial<Storage> = {},
): { readonly storage: Storage; readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
      ...overrides,
    },
  };
}

function createDocumentRoot() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  return {
    attributes,
    classes,
    root: {
      classList: {
        add: (name: string) => classes.add(name),
        contains: (name: string) => classes.has(name),
        remove: (name: string) => classes.delete(name),
      },
      get offsetHeight() {
        return 0;
      },
      removeAttribute: (name: string) => attributes.delete(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  };
}

afterEach(() => {
  vi.doUnmock("../hooks/useTheme");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fork theme synchronization", () => {
  it("keeps palette reads pure and runs the legacy migration explicitly", async () => {
    const setItem = vi.fn<(key: string, value: string) => void>();
    const { storage, values } = createStorage(
      { "t3code:theme": "cool-dark" },
      {
        setItem: (key, value) => {
          setItem(key, value);
          values.set(key, value);
        },
      },
    );
    vi.stubGlobal("window", { localStorage: storage });
    vi.doMock("../hooks/useTheme", () => ({
      readThemePreference: () => storage.getItem("t3code:theme") ?? "system",
      subscribeToThemeChanges: vi.fn(() => () => {}),
      syncBrowserChromeTheme: vi.fn(),
    }));

    const { migrateLegacyCoolDarkTheme, readForkPalette } = await import("./forkTheme");
    expect(readForkPalette()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();

    migrateLegacyCoolDarkTheme();
    expect(values.get("t3code:theme")).toBe("dark");
    expect(values.get("t3code:fork-theme")).toBe("cool-dark");
  });

  it("reconciles the DOM for palette and upstream-theme storage events", async () => {
    const { storage, values } = createStorage({
      "t3code:theme": "dark",
      "t3code:fork-theme": "cool-dark",
    });
    const { attributes, classes, root } = createDocumentRoot();
    classes.add("dark");
    let storageHandler: ((event: StorageEvent) => void) | undefined;
    const syncBrowserChromeTheme = vi.fn();
    let themeChangeHandler: (() => void) | undefined;
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === "storage") storageHandler = listener;
      },
      localStorage: storage,
    });
    vi.stubGlobal("document", { documentElement: root });
    vi.doMock("../hooks/useTheme", () => ({
      readThemePreference: () => storage.getItem("t3code:theme") ?? "system",
      subscribeToThemeChanges: (listener: () => void) => {
        themeChangeHandler = listener;
        return () => {};
      },
      syncBrowserChromeTheme,
    }));

    const { FORK_THEME_ATTRIBUTE, initializeForkTheme } = await import("./forkTheme");
    initializeForkTheme();
    expect(attributes.get(FORK_THEME_ATTRIBUTE)).toBe("cool-dark");

    // ThemeEditorHost writes through upstream's same-tab store, where the
    // browser does not emit a storage event. The document-level subscription
    // must clear both the visible overlay and its latent preference.
    values.set("t3code:theme", "custom-theme");
    themeChangeHandler?.();
    expect(attributes.has(FORK_THEME_ATTRIBUTE)).toBe(false);
    expect(values.has("t3code:fork-theme")).toBe(false);

    values.set("t3code:theme", "dark");
    values.set("t3code:fork-theme", "cool-dark");
    storageHandler?.({ key: "t3code:fork-theme" } as StorageEvent);
    expect(attributes.get(FORK_THEME_ATTRIBUTE)).toBe("cool-dark");

    values.delete("t3code:fork-theme");
    values.set("t3code:theme", "system");
    storageHandler?.({ key: "t3code:fork-theme" } as StorageEvent);
    expect(attributes.has(FORK_THEME_ATTRIBUTE)).toBe(false);
    expect(syncBrowserChromeTheme).toHaveBeenCalledTimes(4);
  });

  it("uses the retained storage value after a failed palette write and suppresses repaint", async () => {
    const { storage, values } = createStorage(
      { "t3code:theme": "system" },
      {
        setItem: (key, value) => {
          if (key === "t3code:fork-theme") throw new Error("palette write blocked");
          values.set(key, value);
        },
      },
    );
    const { attributes, classes, root } = createDocumentRoot();
    let animationFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("window", {
      localStorage: storage,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationFrame = callback;
        return 1;
      },
    });
    vi.stubGlobal("document", { documentElement: root });
    vi.doMock("../hooks/useTheme", () => ({
      readThemePreference: () => storage.getItem("t3code:theme") ?? "system",
      subscribeToThemeChanges: vi.fn(() => () => {}),
      syncBrowserChromeTheme: vi.fn(),
    }));

    const { FORK_THEME_ATTRIBUTE, readForkPalette, resolveAppearanceOption, setForkAppearance } =
      await import("./forkTheme");
    setForkAppearance("cool-dark", (theme) => {
      storage.setItem("t3code:theme", theme);
      return true;
    });

    expect(values.get("t3code:theme")).toBe("dark");
    expect(readForkPalette()).toBeNull();
    expect(resolveAppearanceOption("dark", readForkPalette())).toBe("dark");
    expect(attributes.has(FORK_THEME_ATTRIBUTE)).toBe(false);
    expect(classes.has("no-transitions")).toBe(true);

    animationFrame?.(0);
    expect(classes.has("no-transitions")).toBe(false);
  });
});
