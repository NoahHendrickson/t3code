import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DesignUndoHistory } from "./designUndoHistory";
import type { DesignModeWritableKey } from "./protocol";

/**
 * The undo history's own rules, which nothing else can hold: gesture ticks merge into one
 * step that keeps the first prevs and the last next, a fresh edit forks away the redo
 * future, non-undoable verbs empty the stack rather than leave it lying, and tabs never
 * see each other's steps.
 */

const TAB = "tab-1";
const PADDING = "padding-top" as DesignModeWritableKey;
const GAP = "gap" as DesignModeWritableKey;

let history: DesignUndoHistory;

beforeEach(() => {
  history = new DesignUndoHistory();
});

const draftAt = (at: number, next: string, prev: string | null = "8px", id = 1) => {
  history.recordDraft(TAB, PADDING, [{ id, prev }], next, at);
};

describe("designUndoHistory", () => {
  it("merges a gesture's ticks into one step: first prev, last next", () => {
    draftAt(0, "9px");
    draftAt(16, "10px");
    draftAt(32, "11px");
    const entry = history.undo(TAB);
    expect(entry).toEqual({
      kind: "draft",
      property: PADDING,
      targets: [{ id: 1, prev: "8px" }],
      next: "11px",
    });
    expect(history.undo(TAB)).toBeNull();
  });

  it("slides the merge window with the gesture, so a long scrub stays one step", () => {
    draftAt(0, "9px");
    draftAt(400, "10px");
    draftAt(800, "11px");
    history.undo(TAB);
    expect(history.undo(TAB)).toBeNull();
  });

  it("keeps separate gestures as separate steps", () => {
    draftAt(0, "12px");
    draftAt(1000, "16px", "12px");
    expect(history.undo(TAB)?.next).toBe("16px");
    expect(history.undo(TAB)?.next).toBe("12px");
  });

  it("does not merge across properties, element sets, or kinds", () => {
    draftAt(0, "12px");
    history.recordDraft(TAB, GAP, [{ id: 1, prev: null }], "4px", 16);
    history.recordDraft(TAB, PADDING, [{ id: 2, prev: "0px" }], "12px", 32);
    history.recordInset(TAB, "x", [{ id: 1, prev: 10 }], 20, 48);
    expect(history.undo(TAB)?.kind).toBe("inset");
    expect(history.undo(TAB)?.targets).toEqual([{ id: 2, prev: "0px" }]);
    const gap = history.undo(TAB);
    expect(gap?.kind === "draft" ? gap.property : null).toBe(GAP);
    expect(history.undo(TAB)?.next).toBe("12px");
  });

  it("redo restores what undo popped, in order", () => {
    draftAt(0, "12px");
    history.recordInset(TAB, "y", [{ id: 1, prev: 0 }], 24, 1000);
    expect(history.undo(TAB)?.kind).toBe("inset");
    expect(history.undo(TAB)?.kind).toBe("draft");
    expect(history.redo(TAB)?.kind).toBe("draft");
    expect(history.redo(TAB)?.kind).toBe("inset");
    expect(history.redo(TAB)).toBeNull();
  });

  it("a fresh edit forks history: the redone future is gone", () => {
    draftAt(0, "12px");
    history.undo(TAB);
    draftAt(1000, "20px");
    expect(history.redo(TAB)).toBeNull();
  });

  it("a redone step does not swallow the next gesture", () => {
    draftAt(0, "12px");
    history.undo(TAB);
    history.redo(TAB);
    draftAt(100, "16px", "12px");
    expect(history.undo(TAB)?.next).toBe("16px");
    expect(history.undo(TAB)?.next).toBe("12px");
  });

  it("clear (the non-undoable-verb path) empties both directions", () => {
    draftAt(0, "12px");
    history.undo(TAB);
    draftAt(1000, "16px");
    history.clear(TAB);
    expect(history.undo(TAB)).toBeNull();
    expect(history.redo(TAB)).toBeNull();
  });

  it("clear drops a tab's history without touching another tab's", () => {
    draftAt(0, "12px");
    history.recordDraft("tab-2", PADDING, [{ id: 7, prev: null }], "24px", 0);
    history.clear(TAB);
    expect(history.undo(TAB)).toBeNull();
    expect(history.undo("tab-2")?.targets).toEqual([{ id: 7, prev: null }]);
  });

  it("caps the stack by dropping the oldest step", () => {
    for (let index = 0; index < 120; index += 1) {
      draftAt(index * 1000, `${index}px`, `${index - 1}px`);
    }
    let steps = 0;
    while (history.undo(TAB) !== null) steps += 1;
    expect(steps).toBe(100);
  });
});
