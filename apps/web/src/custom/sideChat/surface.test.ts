import { describe, expect, it } from "vite-plus/test";

import { createWriteIsolatedStorage, isSideChatSearch } from "./surface";

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

describe("isSideChatSearch", () => {
  it("matches only the side-chat surface flag", () => {
    expect(isSideChatSearch("?surface=side-chat")).toBe(true);
    expect(isSideChatSearch("?foo=1&surface=side-chat")).toBe(true);
    expect(isSideChatSearch("")).toBe(false);
    expect(isSideChatSearch("?surface=main")).toBe(false);
  });
});

describe("createWriteIsolatedStorage", () => {
  it("reads through to the real storage", () => {
    const base = memoryStorage({ theme: "dark" });
    const storage = createWriteIsolatedStorage(base);
    expect(storage.getItem("theme")).toBe("dark");
    // Later writes by the main window show through too.
    base.setItem("theme", "light");
    expect(storage.getItem("theme")).toBe("light");
  });

  it("never writes to the real storage", () => {
    const base = memoryStorage({ drafts: "main" });
    const storage = createWriteIsolatedStorage(base);
    storage.setItem("drafts", "side");
    storage.setItem("other", "x");
    storage.removeItem("drafts");
    storage.clear();
    expect(base.getItem("drafts")).toBe("main");
    expect(base.getItem("other")).toBeNull();
  });

  it("shows its own writes and removals over the real storage", () => {
    const base = memoryStorage({ a: "1", b: "2" });
    const storage = createWriteIsolatedStorage(base);
    storage.setItem("a", "local");
    storage.removeItem("b");
    storage.setItem("c", "3");
    expect(storage.getItem("a")).toBe("local");
    expect(storage.getItem("b")).toBeNull();
    expect(storage.length).toBe(2);
    expect([0, 1].map((index) => storage.key(index)).toSorted()).toEqual(["a", "c"]);
    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.getItem("a")).toBeNull();
  });
});
