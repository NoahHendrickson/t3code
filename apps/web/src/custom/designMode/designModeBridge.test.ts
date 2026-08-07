import { beforeEach, describe, expect, it } from "vite-plus/test";

import { designModeBridge } from "./designModeBridge";
import type { DesignModeWritableKey } from "./protocol";

/**
 * The bridge's scrub coalescing contract, which nothing else can hold: scrub-driven
 * writes (applyDraft, setInset) cross into the guest at most once per animation frame
 * carrying the newest value, and every other command — including buildSend — flushes
 * them first, so a revert or send issued right after a scrub tick can never overtake it.
 *
 * No DOM: document and rAF are stubbed, frames run by hand.
 */

const TAB = "tab-1";
const PADDING: DesignModeWritableKey = "padding-top" as DesignModeWritableKey;

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

/** Runs every queued animation-frame callback, as one host frame would. */
const runFrame = () => {
  const queued = frames;
  frames = [];
  for (const frame of queued) frame();
};

beforeEach(() => {
  frames = [];
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    callback: () => void,
  ) => {
    frames.push(callback);
    return frames.length;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (id: number) => {
    if (id >= 1 && id <= frames.length) frames[id - 1] = () => undefined;
  };
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: () => [webview],
  };
  // Drain coalesced state a prior test may have left: discardAll flushes pending first.
  designModeBridge.discardAll(TAB);
  calls = [];
});

describe("designModeBridge scrub coalescing", () => {
  it("coalesces same-target scrub ticks to one crossing carrying the newest value", () => {
    designModeBridge.applyDraft(TAB, [1], PADDING, "4px");
    designModeBridge.applyDraft(TAB, [1], PADDING, "8px");
    expect(calls).toHaveLength(0);
    runFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[0]).toContain("8px");
    expect(calls[0]).not.toContain("4px");
  });

  it("keeps distinct targets separate, flushed in first-seen order", () => {
    designModeBridge.applyDraft(TAB, [1], PADDING, "4px");
    designModeBridge.setInset(TAB, [1], "x", 12);
    designModeBridge.applyDraft(TAB, [1], PADDING, "8px");
    runFrame();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[0]).toContain("8px");
    expect(calls[1]).toContain("setInset");
  });

  it("flushes pending writes ahead of a discrete command", () => {
    designModeBridge.applyDraft(TAB, [1], PADDING, "4px");
    designModeBridge.revertDraft(TAB, [1], [PADDING]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[1]).toContain("revertDraft");
    // The canceled frame must not replay the write after the revert.
    runFrame();
    expect(calls).toHaveLength(2);
  });

  it("flushes pending writes ahead of buildSend", async () => {
    designModeBridge.applyDraft(TAB, [1], PADDING, "4px");
    await designModeBridge.buildSend(TAB);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("applyDraft");
    expect(calls[1]).toContain("buildSend");
  });

  it("coalesces per element set, so a multi-select scrub is one crossing", () => {
    designModeBridge.applyDraft(TAB, [1, 2], PADDING, "4px");
    designModeBridge.applyDraft(TAB, [1, 2], PADDING, "8px");
    runFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("[1,2]");
  });
});
