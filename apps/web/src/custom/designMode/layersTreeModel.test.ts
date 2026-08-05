import { describe, expect, it } from "vite-plus/test";

import { ancestorsOf, flattenLayers, matchingIds } from "./layersTreeModel";
import type { DesignModeLayerNode } from "./protocol";

const node = (
  id: number,
  label: string,
  children: DesignModeLayerNode[] = [],
  tag = "div",
): DesignModeLayerNode => ({ id, tag, label, reorderable: false, siblingGroup: 0, children });

//  1 Page
//  ├─ 2 Header
//  │   └─ 4 Save          (depth 2 — collapsed by default)
//  └─ 3 Body
//      └─ 5 Total         (depth 2)
const roots = [
  node(1, "Page", [
    node(2, "Header", [node(4, "Save", [], "button")]),
    node(3, "Body", [node(5, "Total", [], "span")]),
  ]),
];

describe("layers tree model", () => {
  it("expands to the default depth and honors explicit expansion state", () => {
    // Depth 0 and 1 open by default, so the leaves under them are visible.
    expect(flattenLayers(roots, {}, null).map((row) => row.node.id)).toEqual([1, 2, 4, 3, 5]);
    // Explicit collapse beats the depth default, and takes the subtree with it.
    expect(flattenLayers(roots, { 2: false }, null).map((row) => row.node.id)).toEqual([
      1, 2, 3, 5,
    ]);
    expect(flattenLayers(roots, { 1: false }, null).map((row) => row.node.id)).toEqual([1]);
  });

  it("carries what a drag needs: depth, parent and the next sibling", () => {
    const rows = flattenLayers(roots, {}, null);
    const header = rows.find((row) => row.node.id === 2);
    const body = rows.find((row) => row.node.id === 3);
    expect(header).toMatchObject({ depth: 1, parentId: 1, nextSiblingId: 3, hasChildren: true });
    // Last child: a drop below it means "to the end", which the null encodes.
    expect(body).toMatchObject({ depth: 1, parentId: 1, nextSiblingId: null });
  });

  it("filters to matches plus their ancestors, and unfolds them", () => {
    const filter = matchingIds(roots, "save");
    expect(filter && [...filter].sort()).toEqual([1, 2, 4]);
    // A filtered tree the user still has to unfold is a filter that didn't do its job —
    // the deep match is visible without touching the expansion state.
    expect(flattenLayers(roots, {}, filter).map((row) => row.node.id)).toEqual([1, 2, 4]);
    // Tag matches too, so "button" finds the Save row.
    expect([...(matchingIds(roots, "button") ?? [])].sort()).toEqual([1, 2, 4]);
    expect(matchingIds(roots, "   ")).toBeNull();
    expect([...(matchingIds(roots, "nothing") ?? [])]).toEqual([]);
  });

  it("finds the ancestor path a reveal has to expand", () => {
    expect(ancestorsOf(roots, 5)).toEqual([1, 3]);
    expect(ancestorsOf(roots, 1)).toEqual([]);
    expect(ancestorsOf(roots, 99)).toBeNull();
  });
});
