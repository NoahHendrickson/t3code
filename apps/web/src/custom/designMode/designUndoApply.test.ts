import { beforeEach, describe, expect, it } from "vite-plus/test";

import { applyDesignUndoEntry } from "./designUndoApply";
import type { DesignUndoEntry } from "./designUndoHistory";
import type { DesignModeWritableKey } from "./protocol";

/**
 * The undo/redo → bridge fan-out, testable without mounting the panel (PR #70 review):
 * undo restores per element and turns a null prev into a draft discard rather than a
 * fake edit; redo re-applies the gesture's final value to the whole set in one call.
 *
 * Same no-DOM harness as designModeBridge.test.ts: a stub document serves the webview,
 * and calls are asserted by the executeJavaScript expressions they produce.
 */

const TAB = "tab-1";
const PADDING = "padding-top" as DesignModeWritableKey;

let calls: string[] = [];
let frames: Array<() => void> = [];

const webview = {
  isConnected: true,
  getAttribute: (name: string) => (name === "data-preview-tab" ? TAB : null),
  executeJavaScript: (code: string) => {
    calls.push(code);
    return Promise.resolve(null);
  },
};

/** Coalesced bridge writes (once PR #69 lands) flush no later than the next frame. The
 * callback must be QUEUED, not run inline: an inline run flushes before the bridge stores
 * the frame handle, leaving a stale handle that starves every later write. */
const runFrames = () => {
  const queued = frames;
  frames = [];
  for (const frame of queued) frame();
};

beforeEach(() => {
  frames = [];
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: () => [webview],
  };
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    callback: () => void,
  ) => {
    frames.push(callback);
    return frames.length;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (id: number) => {
    if (id >= 1 && id <= frames.length) frames[id - 1] = () => undefined;
  };
  // Drain bridge state a prior test may have left queued, then start clean.
  runFrames();
  calls = [];
});

const apply = (entry: DesignUndoEntry, direction: "undo" | "redo") => {
  applyDesignUndoEntry(TAB, entry, direction);
  runFrames();
};

const draftEntry: DesignUndoEntry = {
  kind: "draft",
  property: PADDING,
  targets: [
    { id: 1, prev: "8px" },
    { id: 2, prev: null },
  ],
  next: "16px",
};

const insetEntry: DesignUndoEntry = {
  kind: "inset",
  axis: "x",
  targets: [
    { id: 1, prev: 10 },
    { id: 2, prev: 24 },
  ],
  next: 40,
};

describe("applyDesignUndoEntry", () => {
  it("undo of a draft restores per element: prev re-applies, null prev discards", () => {
    apply(draftEntry, "undo");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[0]).toContain("[1]");
    expect(calls[0]).toContain("8px");
    expect(calls[1]).toContain("revertDraft");
    expect(calls[1]).toContain("[2]");
  });

  it("redo of a draft re-applies the final value to the whole set in one call", () => {
    apply(draftEntry, "redo");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[0]).toContain("[1,2]");
    expect(calls[0]).toContain("16px");
  });

  it("undo of an inset restores each element's own offset", () => {
    apply(insetEntry, "undo");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("setInset");
    expect(calls[0]).toContain("[1]");
    expect(calls[0]).toContain("10");
    expect(calls[1]).toContain("[2]");
    expect(calls[1]).toContain("24");
  });

  it("redo of an inset moves the whole set to the gesture's final offset", () => {
    apply(insetEntry, "redo");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("setInset");
    expect(calls[0]).toContain("[1,2]");
    expect(calls[0]).toContain("40");
  });
});
