/**
 * The layers rail's drag-to-reorder gesture.
 *
 * Handlers live on the tree CONTAINER, not on rows: a drag crosses rows and flips edges at
 * pointer-event rate, and per-row closures meant every one of those re-rendered the whole
 * rail (PR #57 review). Rows carry `data-layer-id`, the container resolves the row under the
 * pointer from it, and only the two rows that actually show an insertion line re-render.
 *
 * The gesture only ever expresses "put this row before that one": the guest owns the index
 * math, because the curated tree hoists tagged descendants through untagged wrappers and a
 * row's position in the TREE is not its position in the DOM.
 */
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";

import type { LayerRow } from "./layersTreeModel";

/** Which side of the hovered row the drop would land on. */
export type DropEdge = "before" | "after";

/** Where the insertion line is drawn right now — the only part of a drag that is render
 * state. The dragged row's identity lives in a ref, since nothing displays it. */
interface DropTarget {
  readonly overId: number;
  readonly edge: DropEdge;
}

export interface LayerDragContainerHandlers {
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
  readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
}

/** The row a drag event is over, from the `data-layer-id` the rail already stamps. */
function rowIdFromEvent(event: DragEvent<HTMLElement>): number | null {
  const host = (event.target as HTMLElement | null)?.closest?.("[data-layer-id]");
  const raw = host?.getAttribute("data-layer-id");
  const id = raw === null || raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

/**
 * The `beforeId` a drop resolves to — `{ beforeId: null }` meaning "to the end of the DOM
 * sibling list" — or null when the gesture must be refused.
 *
 * The subtlety is `nextSiblingId`: it is the next TREE sibling, and tree siblings are not
 * always DOM siblings (the curated walk hoists tagged descendants through untagged wrappers,
 * which is the whole reason rows carry `siblingGroup`). Dropping below the last row of a DOM
 * group therefore used to ship the id of a row under a DIFFERENT DOM parent, which the guest
 * correctly refuses (`reorderById` requires a shared parent) — so the drag simply did nothing,
 * with no feedback anywhere. "After the last sibling" is `null`, which the guest already reads
 * as "move to the end"; only a next sibling in the SAME group is a usable reference.
 *
 * Pure, and exported, because it is the one piece of this gesture that is arithmetic.
 */
export function resolveDropBeforeId(
  dragged: LayerRow,
  over: LayerRow,
  edge: DropEdge,
  byId: ReadonlyMap<number, LayerRow>,
): { readonly beforeId: number | null } | null {
  // The same gate `onDragOver` paints with — re-asserted here because the drop is what
  // actually commits, and a stale insertion line must never survive as a stale reference.
  if (over.node.siblingGroup !== dragged.node.siblingGroup) return null;
  if (edge === "before") return { beforeId: over.node.id };
  const next = over.nextSiblingId === null ? undefined : byId.get(over.nextSiblingId);
  if (!next || next.node.siblingGroup !== dragged.node.siblingGroup) return { beforeId: null };
  return { beforeId: next.node.id };
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
  dropTarget: DropTarget | null;
  /** True when this row may start a drag — a static, per-row value. */
  canDrag: (row: LayerRow) => boolean;
  containerHandlers: LayerDragContainerHandlers;
} {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragged = useRef<number | null>(null);
  const byId = useMemo(() => new Map(rows.map((row) => [row.node.id, row])), [rows]);

  // Mirrored in a ref so the handlers below can READ the live drop target without taking it
  // as a memo dependency: `dragover` fires at pointer rate, and depending on the state meant
  // rebuilding the whole handler object (and re-running the memo) on every edge flip.
  const dropTargetRef = useRef<DropTarget | null>(null);
  const setDrop = useCallback((next: DropTarget | null) => {
    const current = dropTargetRef.current;
    if (current === next) return;
    if (current && next && current.overId === next.overId && current.edge === next.edge) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  }, []);

  const canDrag = useCallback((row: LayerRow) => row.node.reorderable && !filtering, [filtering]);

  const containerHandlers = useMemo<LayerDragContainerHandlers>(
    () => ({
      onDragStart: (event) => {
        const id = rowIdFromEvent(event);
        const row = id === null ? undefined : byId.get(id);
        if (!row || !row.node.reorderable || filtering) return;
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag with no payload; the value itself is unused.
        event.dataTransfer.setData("text/plain", String(row.node.id));
        dragged.current = row.node.id;
        setDrop({ overId: row.node.id, edge: "before" });
      },
      onDragOver: (event) => {
        const source = dragged.current;
        if (source === null) return;
        const id = rowIdFromEvent(event);
        const row = id === null ? undefined : byId.get(id);
        const from = byId.get(source);
        // DOM siblings only, which is NOT the same as tree siblings: the curated walk hoists
        // tagged descendants through untagged wrappers, so two rows can share a tree parent
        // while living under different DOM parents. Gating on the tree let the rail paint an
        // insertion line and accept a drop the guest then refused, silently (PR #57 review).
        const droppable =
          row !== undefined &&
          from !== undefined &&
          row.node.siblingGroup === from.node.siblingGroup &&
          row.node.id !== source;
        if (!droppable) {
          event.dataTransfer.dropEffect = "none";
          // The line has to go with the refusal: leaving it painted on the last valid row
          // while the pointer sits over an undroppable one promises a drop that cannot happen.
          setDrop(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = (event.target as HTMLElement)
          .closest("[data-layer-id]")
          ?.getBoundingClientRect();
        if (!bounds) return;
        const edge: DropEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
        setDrop({ overId: row.node.id, edge });
      },
      onDragLeave: (event) => {
        // Only when the pointer leaves the LIST, not on every row-to-row crossing.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDrop(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        const source = dragged.current;
        const target = dropTargetRef.current;
        dragged.current = null;
        setDrop(null);
        if (source === null || !target) return;
        const row = byId.get(target.overId);
        const from = byId.get(source);
        if (!row || !from) return;
        const resolved = resolveDropBeforeId(from, row, target.edge, byId);
        if (!resolved) return;
        // Dropping a row onto its own edge is the "moved nothing" case; everything else goes
        // to the guest, INCLUDING a drag back to the original slot — that one drops the move
        // draft, which is the only way to undo a reorder from the rail.
        if (resolved.beforeId !== source) onReorder(source, resolved.beforeId);
      },
      onDragEnd: () => {
        dragged.current = null;
        setDrop(null);
      },
    }),
    [byId, filtering, onReorder, setDrop],
  );

  return { dropTarget, canDrag, containerHandlers };
}
