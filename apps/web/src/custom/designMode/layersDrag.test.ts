import { describe, expect, it } from "vite-plus/test";

import { resolveDropBeforeId } from "./layersDrag";
import type { LayerRow } from "./layersTreeModel";

/**
 * The rail's drop arithmetic, which is the half of the gesture that can be wrong silently:
 * an unusable `beforeId` reaches the guest, `reorderById` refuses it because the two elements
 * do not share a DOM parent, and the drag simply does nothing with no feedback anywhere.
 *
 * `siblingGroup` is what makes this non-obvious — the curated walk hoists tagged descendants
 * through untagged wrappers, so rows that are siblings in the TREE routinely are not siblings
 * in the DOM, and `nextSiblingId` is a tree fact.
 */

const row = (
  id: number,
  siblingGroup: number,
  nextSiblingId: number | null,
  reorderable = true,
): LayerRow => ({
  node: { id, tag: "div", label: `#${id}`, reorderable, siblingGroup, children: [] },
  depth: 1,
  parentId: 0,
  nextSiblingId,
  expanded: false,
  hasChildren: false,
});

const index = (rows: readonly LayerRow[]) => new Map(rows.map((r) => [r.node.id, r]));

describe("resolveDropBeforeId", () => {
  it("drops before the hovered row", () => {
    const a = row(1, 7, 2);
    const b = row(2, 7, null);
    expect(resolveDropBeforeId(b, a, "before", index([a, b]))).toEqual({ beforeId: 1 });
  });

  it("drops after a row by naming its next sibling", () => {
    const a = row(1, 7, 2);
    const b = row(2, 7, 3);
    const c = row(3, 7, null);
    expect(resolveDropBeforeId(c, a, "after", index([a, b, c]))).toEqual({ beforeId: 2 });
  });

  it("drops after the last sibling as 'to the end', not as a dangling reference", () => {
    const a = row(1, 7, 2);
    const b = row(2, 7, null);
    expect(resolveDropBeforeId(a, b, "after", index([a, b]))).toEqual({ beforeId: null });
  });

  it("treats a next sibling in another DOM group as the end of this one", () => {
    // The regression: `b` is last under ITS dom parent, but the tree gives it a next sibling
    // hoisted out of an untagged wrapper. Shipping `3` here made the guest refuse the whole
    // reorder — sibling-relative moves are only meaningful within one DOM parent.
    const a = row(1, 7, 2);
    const b = row(2, 7, 3);
    const hoisted = row(3, 9, null);
    expect(resolveDropBeforeId(a, b, "after", index([a, b, hoisted]))).toEqual({ beforeId: null });
  });

  it("refuses a drop onto a row in another DOM group", () => {
    const a = row(1, 7, null);
    const foreign = row(2, 9, null);
    expect(resolveDropBeforeId(a, foreign, "before", index([a, foreign]))).toBeNull();
    expect(resolveDropBeforeId(a, foreign, "after", index([a, foreign]))).toBeNull();
  });

  it("treats a next sibling missing from the rendered rows as the end", () => {
    // A collapsed or re-emitted tree can leave `nextSiblingId` naming a row that is no longer
    // drawn; "to the end" is the honest answer, never a reference the guest cannot resolve.
    const a = row(1, 7, 2);
    const b = row(2, 7, 99);
    expect(resolveDropBeforeId(a, b, "after", index([a, b]))).toEqual({ beforeId: null });
  });
});
