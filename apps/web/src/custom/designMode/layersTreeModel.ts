/**
 * The layers rail's view model — everything about the tree that is arithmetic rather than
 * rendering, so the rail component stays a renderer and this stays testable.
 *
 * The rail draws a FLAT list: a tree of rows with collapsed subtrees removed, a search
 * filter applied, and each row carrying what its interactions need (depth for the indent,
 * its parent and next sibling for a drag's drop target, whether it can be expanded).
 */
import type { DesignModeLayerNode } from "./protocol";

/** Depth below which nodes start expanded — the top two levels give the page's structure
 * without a wall of rows on first open. */
export const DEFAULT_EXPAND_DEPTH = 2;

export interface LayerRow {
  readonly node: DesignModeLayerNode;
  readonly depth: number;
  readonly parentId: number | null;
  /** The next sibling in the tree, or null when this is the last child — a drop below this
   * row means "before that sibling", and null means "to the end". */
  readonly nextSiblingId: number | null;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
}

export const isExpanded = (
  expanded: Readonly<Record<number, boolean>>,
  id: number,
  depth: number,
): boolean => expanded[id] ?? depth < DEFAULT_EXPAND_DEPTH;

/** Ids whose label or tag matches, plus every ancestor — a match deep in the tree has to
 * bring its path with it or the row has nothing to hang under. */
export function matchingIds(
  roots: readonly DesignModeLayerNode[],
  query: string,
): ReadonlySet<number> | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return null;
  const keep = new Set<number>();
  const walk = (node: DesignModeLayerNode, ancestors: number[]): boolean => {
    const path = [...ancestors, node.id];
    const self =
      node.label.toLowerCase().includes(needle) || node.tag.toLowerCase().includes(needle);
    // Walk every child even after a hit: a matching parent must not hide a matching child's
    // own path, and the subtree of a match stays browsable.
    const childHit = node.children.map((child) => walk(child, path)).some(Boolean);
    if (self || childHit) for (const id of path) keep.add(id);
    return self || childHit;
  };
  for (const root of roots) walk(root, []);
  return keep;
}

/**
 * Flattens the tree to the rows the rail actually draws. While a search is active every
 * surviving node is treated as expanded — a filtered tree the user still has to unfold is
 * a filter that didn't do its job.
 */
export function flattenLayers(
  roots: readonly DesignModeLayerNode[],
  expanded: Readonly<Record<number, boolean>>,
  filter: ReadonlySet<number> | null,
): LayerRow[] {
  const rows: LayerRow[] = [];
  const walk = (
    nodes: readonly DesignModeLayerNode[],
    depth: number,
    parentId: number | null,
  ): void => {
    const visible = filter ? nodes.filter((node) => filter.has(node.id)) : nodes;
    for (const [index, node] of visible.entries()) {
      const children = filter
        ? node.children.filter((child) => filter.has(child.id))
        : node.children;
      const open = filter !== null || isExpanded(expanded, node.id, depth);
      rows.push({
        node,
        depth,
        parentId,
        nextSiblingId: visible[index + 1]?.id ?? null,
        expanded: open,
        hasChildren: children.length > 0,
      });
      if (open && children.length > 0) walk(children, depth + 1, node.id);
    }
  };
  walk(roots, 0, null);
  return rows;
}

/** Every ancestor of `id`, outermost first — what a reveal has to expand. */
export function ancestorsOf(roots: readonly DesignModeLayerNode[], id: number): number[] | null {
  const walk = (node: DesignModeLayerNode, path: number[]): number[] | null => {
    if (node.id === id) return path;
    for (const child of node.children) {
      const found = walk(child, [...path, node.id]);
      if (found) return found;
    }
    return null;
  };
  for (const root of roots) {
    const found = walk(root, []);
    if (found) return found;
  }
  return null;
}
