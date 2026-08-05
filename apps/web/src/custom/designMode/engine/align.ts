/**
 * Figma's align row (the Position section's six buttons), mapped honestly onto CSS.
 *
 * Figma aligns the selected object inside its own parent frame. There is no single CSS
 * property that means that, so the mapping is per parent context — and where a context has
 * no honest answer the capability is reported false and the panel disables those buttons
 * rather than writing something that quietly does nothing:
 *
 * - out of flow (an absolute draft, or already absolute/fixed in the app's CSS): both axes,
 *   written as insets measured against the offset parent — exactly what Figma does.
 * - auto-layout (flex) child: the CROSS axis only, as `align-self`. Figma disables the main
 *   axis for auto-layout children too; a single child cannot claim the main axis without
 *   moving its siblings, and writing the parent's `justify-content` would do just that.
 * - grid child: both axes — `justify-self` / `align-self` are exactly this control.
 * - block child of a plain parent: horizontal only, as the `margin-*: auto` idiom, and only
 *   when the element is block-level and actually narrower than its parent (otherwise there
 *   is no slack to move it through and the buttons would be theatre).
 *
 * Geometry is read through offsetLeft/offsetWidth/clientWidth rather than
 * getBoundingClientRect: those are layout px, so canvas mode's page transform can't scale
 * the arithmetic (the same trap sizeMode.ts documents for measured sizes).
 */
import type { DesignModeAlignAxis, DesignModeAlignCaps, DesignModeAlignValue } from "../protocol";
import type { DraftStore } from "./vendor/drafts";
import { isEffectivelyAbsolute, POSITION_ROWS } from "./vendor/panel-specs";
import type { TaggedElement } from "./vendor/source";

/** Displays that participate in block layout, i.e. that `margin: auto` can actually move. */
const BLOCK_LEVEL = new Set(["block", "flex", "grid", "table", "list-item", "flow-root"]);

type ParentModel =
  | { kind: "absolute" }
  | { kind: "flex"; direction: "row" | "column" }
  | { kind: "grid" }
  | { kind: "block"; alignable: boolean }
  | { kind: "none" };

function parentModel(el: TaggedElement, drafts: DraftStore): ParentModel {
  if (isEffectivelyAbsolute(el, drafts)) return { kind: "absolute" };
  const parent = el.parentElement;
  if (!parent) return { kind: "none" };
  const parentStyle = getComputedStyle(parent);
  const display = parentStyle.display;
  if (display === "flex" || display === "inline-flex") {
    return {
      kind: "flex",
      direction: parentStyle.flexDirection.startsWith("column") ? "column" : "row",
    };
  }
  if (display === "grid" || display === "inline-grid") return { kind: "grid" };
  const blockLevel = BLOCK_LEVEL.has(getComputedStyle(el).display);
  const width = el instanceof HTMLElement ? el.offsetWidth : 0;
  return { kind: "block", alignable: blockLevel && width > 0 && width < parent.clientWidth };
}

export function alignCapsFor(el: TaggedElement, drafts: DraftStore): DesignModeAlignCaps {
  return capsFor(parentModel(el, drafts));
}

/** Split from alignCapsFor so the apply path can reuse the parent model it already built —
 * two getComputedStyle pairs per click otherwise (PR #57 review). */
function capsFor(model: ParentModel): DesignModeAlignCaps {
  switch (model.kind) {
    case "absolute":
    case "grid":
      return { horizontal: true, vertical: true };
    case "flex":
      // Cross axis only: a row's cross axis is vertical, a column's is horizontal.
      return { horizontal: model.direction === "column", vertical: model.direction === "row" };
    case "block":
      return { horizontal: model.alignable, vertical: false };
    case "none":
      return { horizontal: false, vertical: false };
  }
}

/** flex-start / center / flex-end — the flexbox spelling of an align value. */
const flexValue = (value: DesignModeAlignValue): string =>
  value === "start" ? "flex-start" : value === "end" ? "flex-end" : "center";

/** Moves an out-of-flow element to the parent's start / centre / end on one axis, then writes
 * the result through the same X/Y commit the panel's fields use (draft inset or plain
 * left/top css, decided by POSITION_ROWS' own `write`). */
function alignOutOfFlow(
  el: TaggedElement,
  axis: DesignModeAlignAxis,
  value: DesignModeAlignValue,
  drafts: DraftStore,
): void {
  if (!(el instanceof HTMLElement)) return;
  const host = el.offsetParent instanceof HTMLElement ? el.offsetParent : document.documentElement;
  const horizontal = axis === "horizontal";
  const available = horizontal ? host.clientWidth : host.clientHeight;
  const size = horizontal ? el.offsetWidth : el.offsetHeight;
  const current = horizontal ? el.offsetLeft : el.offsetTop;
  const target =
    value === "start"
      ? 0
      : value === "center"
        ? Math.round((available - size) / 2)
        : available - size;
  const row = horizontal ? POSITION_ROWS[0] : POSITION_ROWS[1];
  const read = row.read;
  const write = row.write;
  if (!read || !write) return;
  // The fields read in margin-edge basis while offsetLeft is border-edge, so shift by the
  // DELTA rather than assigning the target outright — a margin would otherwise be counted twice.
  write(el, Math.round(read(el) + (target - current)), drafts);
}

/** Aligns one element within its parent. A no-op when the axis has no honest mapping — the
 * panel gates on alignCapsFor first, so this is the second line of defence, not the first. */
export function alignElement(
  el: TaggedElement,
  axis: DesignModeAlignAxis,
  value: DesignModeAlignValue,
  drafts: DraftStore,
): void {
  const model = parentModel(el, drafts);
  const caps = capsFor(model);
  if (axis === "horizontal" ? !caps.horizontal : !caps.vertical) return;
  switch (model.kind) {
    case "absolute":
      alignOutOfFlow(el, axis, value, drafts);
      return;
    case "flex":
      drafts.apply(el, "align-self", flexValue(value));
      return;
    case "grid":
      drafts.apply(el, axis === "horizontal" ? "justify-self" : "align-self", value);
      return;
    case "block": {
      // The margin-auto idiom: an auto side absorbs the slack, so the element is pushed away
      // from it. Both sides auto centres. The opposite side is pinned to 0 so a previously
      // drafted alignment can't linger and fight the new one.
      drafts.apply(el, "margin-left", value === "start" ? "0px" : "auto");
      drafts.apply(el, "margin-right", value === "end" ? "0px" : "auto");
      return;
    }
    case "none":
      return;
  }
}
