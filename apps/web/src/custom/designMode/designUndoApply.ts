import { designModeBridge } from "./designModeBridge";
import type { DesignUndoEntry } from "./designUndoHistory";

/**
 * Turns a popped history entry into bridge commands — the one place undo/redo semantics
 * live, so the panel's keydown effect stays wiring (PR #70 review). Sibling of
 * designUndoHistory.ts rather than part of it: the history stays pure and bridge-free.
 *
 * Undo restores per element, because a multi-select's prevs can differ: a non-null prev
 * re-applies as a draft, a null prev means the property carried no draft before the
 * gesture — discard it (revertDraft) rather than pin its computed value as a fake edit.
 * Redo re-applies the gesture's final value to the whole element set in one call, exactly
 * as the gesture itself did.
 */
export function applyDesignUndoEntry(
  runtimeTabId: string,
  entry: DesignUndoEntry,
  direction: "undo" | "redo",
): void {
  const ids = entry.targets.map((target) => target.id);
  if (entry.kind === "draft") {
    if (direction === "redo") {
      designModeBridge.applyDraft(runtimeTabId, ids, entry.property, entry.next);
      return;
    }
    for (const target of entry.targets) {
      if (target.prev !== null) {
        designModeBridge.applyDraft(runtimeTabId, [target.id], entry.property, target.prev);
      } else {
        designModeBridge.revertDraft(runtimeTabId, [target.id], [entry.property]);
      }
    }
    return;
  }
  if (direction === "redo") {
    designModeBridge.setInset(runtimeTabId, ids, entry.axis, entry.next);
    return;
  }
  for (const target of entry.targets) {
    designModeBridge.setInset(runtimeTabId, [target.id], entry.axis, target.prev);
  }
}
