/**
 * The layers rail's drag-to-reorder gesture, kept out of the row map so that map stays a
 * renderer (PR #57 review).
 *
 * The gesture only ever expresses "put this row before that one": the guest owns the index
 * math, because the curated tree hoists tagged descendants through untagged wrappers and a
 * row's position in the TREE is not its position in the DOM.
 */
import { useCallback, useState, type DragEvent } from "react";

import type { LayerRow } from "./layersTreeModel";

/** Which side of the hovered row the drop would land on. */
export type DropEdge = "before" | "after";

interface DragState {
  readonly id: number;
  /** The row under the pointer, or null when the pointer has left every row. */
  readonly overId: number | null;
  readonly edge: DropEdge;
}

export interface LayerDragHandlers {
  readonly draggable: boolean;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
}

export function useLayersDrag({
  rows,
  filtering,
  onReorder,
}: {
  rows: readonly LayerRow[];
  /** A filter is active. Dragging is refused while one is: `nextSiblingId` is computed from
   * the FILTERED sibling list, so "after A" would ship the wrong reference whenever the real
   * next sibling is hidden — and landing somewhere the rail never showed is worse than
   * declining the gesture (PR #57 review). */
  filtering: boolean;
  onReorder: (id: number, beforeId: number | null) => void;
}): {
  dropEdgeFor: (rowId: number) => DropEdge | null;
  handlersFor: (row: LayerRow) => LayerDragHandlers;
} {
  const [drag, setDrag] = useState<DragState | null>(null);

  const dropEdgeFor = useCallback(
    (rowId: number) => (drag?.overId === rowId ? drag.edge : null),
    [drag],
  );

  const handlersFor = useCallback(
    (row: LayerRow): LayerDragHandlers => ({
      draggable: row.node.reorderable && !filtering,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag with no payload; the value itself is unused.
        event.dataTransfer.setData("text/plain", String(row.node.id));
        setDrag({ id: row.node.id, overId: row.node.id, edge: "before" });
      },
      onDragOver: (event) => {
        if (!drag) return;
        const dragged = rows.find((candidate) => candidate.node.id === drag.id);
        // Siblings only: the move draft reorders, it does not reparent, and an accepted drop
        // that quietly did nothing would be the worse answer.
        const sameParent =
          dragged !== undefined &&
          dragged.parentId === row.parentId &&
          dragged.node.id !== row.node.id;
        if (!sameParent) {
          event.dataTransfer.dropEffect = "none";
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const edge: DropEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
        if (drag.overId !== row.node.id || drag.edge !== edge) {
          setDrag({ ...drag, overId: row.node.id, edge });
        }
      },
      onDragLeave: () => {
        if (drag?.overId === row.node.id) setDrag({ ...drag, overId: null });
      },
      onDrop: (event) => {
        event.preventDefault();
        if (!drag) return;
        const beforeId = drag.edge === "before" ? row.node.id : row.nextSiblingId;
        // Dropping a row onto its own edge is the "moved nothing" case; everything else goes
        // to the guest, INCLUDING a drag back to the original slot — that one drops the move
        // draft, which is the only way to undo a reorder from the rail.
        if (beforeId !== drag.id) onReorder(drag.id, beforeId);
        setDrag(null);
      },
      onDragEnd: () => setDrag(null),
    }),
    [drag, filtering, onReorder, rows],
  );

  return { dropEdgeFor, handlersFor };
}
