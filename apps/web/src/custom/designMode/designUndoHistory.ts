import type { DesignModeWritableKey } from "./protocol";

/**
 * Gesture-level undo for the design panel, host-side and per preview tab. One slider
 * gesture (or one typed commit) is one undoable step: ticks that land on the same
 * (property, element set) within the merge window collapse into the entry they started,
 * which keeps the FIRST tick's prev values — the pre-gesture state the panel's selection
 * snapshots were still showing when the gesture began — and the LAST tick's next value.
 *
 * The stack records only the two scrub-shaped writes (style drafts and X/Y insets). Any
 * other mutating verb (size mode, align, absolute, aspect lock, per-property revert,
 * discard) must call noteNonUndoable instead: popping an entry OLDER than an action we
 * cannot undo would un-do the wrong thing, so the honest behavior is an empty stack, not
 * a lying one. Navigation and engine teardown clear too — recorded element ids don't
 * survive a re-injection's id registry.
 *
 * Pure bookkeeping: no bridge calls, no Date reads (callers pass `at`), so the whole
 * contract is unit-testable. ForkDesignPanel records, applies popped entries over the
 * bridge, and owns the Cmd+Z / Cmd+Shift+Z listener.
 */

export interface DraftUndoTarget {
  readonly id: number;
  /** The value undo restores via applyDraft — the property's pre-gesture computed value
   * when the property already carried a draft. Null means "discard the draft instead"
   * (revertDraft): the property was undrafted before the gesture, or its prior value is
   * unknowable (write-only shorthands like `gap` never appear in snapshots). */
  readonly prev: string | null;
}

export interface InsetUndoTarget {
  readonly id: number;
  readonly prev: number;
}

export type DesignUndoEntry =
  | {
      readonly kind: "draft";
      readonly property: DesignModeWritableKey;
      readonly targets: readonly DraftUndoTarget[];
      readonly next: string;
    }
  | {
      readonly kind: "inset";
      readonly axis: "x" | "y";
      readonly targets: readonly InsetUndoTarget[];
      readonly next: number;
    };

interface StackedEntry {
  entry: DesignUndoEntry;
  /** Timestamp of the entry's newest merged tick — the merge window slides with the
   * gesture, so a long scrub stays one step. */
  at: number;
}

interface TabHistory {
  undo: StackedEntry[];
  redo: DesignUndoEntry[];
}

/** Ticks of one gesture arrive every frame; distinct gestures need a hand to leave the
 * label and come back. Held arrow keys repeat well inside this and merge, which is the
 * wanted reading of "one gesture"; two deliberate taps inside half a second merge too —
 * the cost of not threading a gesture id through every field's onEdit. */
const GESTURE_MERGE_MS = 500;

/** Bounds memory per tab; beyond it the oldest step quietly falls off, like any editor. */
const MAX_ENTRIES = 100;

const sameIdSet = (
  a: readonly { readonly id: number }[],
  b: readonly { readonly id: number }[],
): boolean => a.length === b.length && a.every((target, index) => target.id === b[index]!.id);

export class DesignUndoHistory {
  private readonly byTabId = new Map<string, TabHistory>();

  private tab(tabId: string): TabHistory {
    let history = this.byTabId.get(tabId);
    if (!history) {
      history = { undo: [], redo: [] };
      this.byTabId.set(tabId, history);
    }
    return history;
  }

  private push(tabId: string, entry: DesignUndoEntry, at: number): void {
    const history = this.tab(tabId);
    // A new edit forks history — the redone future is no longer reachable.
    history.redo = [];
    const top = history.undo.at(-1);
    if (top && at - top.at <= GESTURE_MERGE_MS && merges(top.entry, entry)) {
      // Same gesture: keep the first tick's prevs, take the newest next.
      top.entry = withNext(top.entry, entry);
      top.at = at;
      return;
    }
    history.undo.push({ entry, at });
    if (history.undo.length > MAX_ENTRIES) history.undo.shift();
  }

  recordDraft(
    tabId: string,
    property: DesignModeWritableKey,
    targets: readonly DraftUndoTarget[],
    next: string,
    at: number,
  ): void {
    if (targets.length === 0) return;
    this.push(tabId, { kind: "draft", property, targets, next }, at);
  }

  recordInset(
    tabId: string,
    axis: "x" | "y",
    targets: readonly InsetUndoTarget[],
    next: number,
    at: number,
  ): void {
    if (targets.length === 0) return;
    this.push(tabId, { kind: "inset", axis, targets, next }, at);
  }

  /** A mutating verb this stack does not record happened — drop both directions. */
  noteNonUndoable(tabId: string): void {
    this.byTabId.delete(tabId);
  }

  /** Navigation, engine teardown, tab close: recorded ids are meaningless now. */
  clear(tabId: string): void {
    this.byTabId.delete(tabId);
  }

  undo(tabId: string): DesignUndoEntry | null {
    const history = this.byTabId.get(tabId);
    const top = history?.undo.pop();
    if (!history || !top) return null;
    history.redo.push(top.entry);
    return top.entry;
  }

  redo(tabId: string): DesignUndoEntry | null {
    const history = this.byTabId.get(tabId);
    const entry = history?.redo.pop();
    if (!history || !entry) return null;
    // Re-armed infinitely far in the past so no later gesture can ever merge into a
    // redone step — it must stay poppable exactly as it was.
    history.undo.push({ entry, at: Number.NEGATIVE_INFINITY });
    return entry;
  }
}

const merges = (top: DesignUndoEntry, next: DesignUndoEntry): boolean => {
  if (top.kind === "draft" && next.kind === "draft") {
    return top.property === next.property && sameIdSet(top.targets, next.targets);
  }
  if (top.kind === "inset" && next.kind === "inset") {
    return top.axis === next.axis && sameIdSet(top.targets, next.targets);
  }
  return false;
};

const withNext = (top: DesignUndoEntry, next: DesignUndoEntry): DesignUndoEntry =>
  top.kind === "draft" && next.kind === "draft"
    ? { ...top, next: next.next }
    : top.kind === "inset" && next.kind === "inset"
      ? { ...top, next: next.next }
      : next;

/** The one history the live panel records into, keyed by runtimeTabId like every other
 * per-tab design-mode state. Tests construct their own. */
export const designUndoHistory = new DesignUndoHistory();
