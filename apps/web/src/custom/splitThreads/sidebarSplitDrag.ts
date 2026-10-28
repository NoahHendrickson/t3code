/**
 * Drag a sidebar card onto another to split them — see
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * Native drag and drop, so it stays clear of the pinned block's dnd-kit
 * sorting (pinned cards are neither sources nor targets) and of the file
 * drop every row already takes (those handlers only answer `Files` drags).
 * The list listens once for every row; the target is the row under the
 * pointer, found by its `data-thread-item` key.
 */
import type { DragEvent, PointerEvent } from "react";

const SPLIT_THREAD_DRAG_TYPE = "application/x-t3code-split-thread";
const DROP_TARGET_ATTRIBUTE = "data-fork-split-drop-target";

/** dataTransfer is unreadable during dragover, so the source rides here. */
let draggedThreadKey: string | null = null;

export function splitThreadDragSourceProps(threadKey: string, enabled: boolean) {
  if (!enabled) return null;
  return {
    // Decided per press, before the browser can start a drag: a press on the
    // row's hover actions begins the settle sweep, a pointer gesture a native
    // drag would cancel, and touch keeps its long-press menu.
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.draggable =
        event.pointerType === "mouse" &&
        !(event.target instanceof Element && event.target.closest("button, a, input") !== null);
    },
    onDragStart: (event: DragEvent<HTMLElement>) => {
      draggedThreadKey = threadKey;
      event.dataTransfer.setData(SPLIT_THREAD_DRAG_TYPE, threadKey);
      event.dataTransfer.effectAllowed = "link";
    },
  };
}

function rowUnder(event: DragEvent<HTMLElement>): HTMLElement | null {
  return event.target instanceof Element
    ? (event.target.closest<HTMLElement>("[data-thread-item]") ?? null)
    : null;
}

/** Spread on the list that holds the rows. */
export function makeSidebarSplitDropHandlers(input: {
  readonly canPair: (threadKey: string) => boolean;
  readonly onPair: (draggedKey: string, targetKey: string) => void;
}) {
  const clearTarget = (event: DragEvent<HTMLElement>) => {
    event.currentTarget
      .querySelectorAll(`[${DROP_TARGET_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(DROP_TARGET_ATTRIBUTE));
  };
  const isSplitDrag = (event: DragEvent<HTMLElement>) =>
    draggedThreadKey !== null && event.dataTransfer.types.includes(SPLIT_THREAD_DRAG_TYPE);
  const targetFor = (event: DragEvent<HTMLElement>) => {
    const row = rowUnder(event);
    const targetKey = row?.getAttribute("data-thread-item") ?? null;
    if (!row || targetKey === null || targetKey === draggedThreadKey) return null;
    return input.canPair(targetKey) ? { row, targetKey } : null;
  };
  return {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!isSplitDrag(event)) return;
      const target = targetFor(event);
      if (!target) {
        clearTarget(event);
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "link";
      if (!target.row.hasAttribute(DROP_TARGET_ATTRIBUTE)) {
        clearTarget(event);
        target.row.setAttribute(DROP_TARGET_ATTRIBUTE, "");
      }
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!isSplitDrag(event)) return;
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !event.currentTarget.contains(next)) clearTarget(event);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!isSplitDrag(event)) return;
      const target = targetFor(event);
      const dragged = draggedThreadKey;
      clearTarget(event);
      if (!target || dragged === null) return;
      event.preventDefault();
      input.onPair(dragged, target.targetKey);
    },
    onDragEnd: (event: DragEvent<HTMLElement>) => {
      draggedThreadKey = null;
      clearTarget(event);
    },
  };
}
