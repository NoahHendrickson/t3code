/**
 * Figma's Fixed / Hug / Fill sizing modes — the read/write branch of the Forge's
 * deleted in-page panel (panel-layout.ts's onSizeModeChange), reconstructed against the
 * vendored helpers that survived: `defeatFillIfGrowing` (panel-specs.ts, the shared
 * fill-defeat both write paths and typed sizes use), `isFlex`/`mainAxisProp`
 * (panel-readers.ts), and the request builder's keyword passthrough (`auto`,
 * `fit-content`, `100%` ship as intent, never a measured px).
 *
 * Semantics per axis, matching Figma:
 * - fixed: draft the current measured size as explicit px (defeating a flex fill first
 *   so the number isn't a silent no-op on a `flex-1` element).
 * - hug: size to content. Flex children draft the literal `auto` (the Forge's own Hug
 *   keyword); a block-level width drafts `fit-content` (block `auto` means full width,
 *   not hug). Heights always hug with `auto`.
 * - fill: take the available space. Main axis of a flex child: `flex-grow: 1` +
 *   `flex-basis: 0%`; cross axis: `align-self: stretch`; outside flex: `100%`. The
 *   explicit size is released to `auto` so the fill can win.
 *
 * Reads are draft-first (a draft records intent; computed styles always resolve to px,
 * which cannot distinguish an authored `auto` from an authored `240px`). Without a
 * draft: flex fill semantics are detected from grow/stretch — including stretch being
 * the flex DEFAULT, so an unstyled flex child's cross axis reads Fill, exactly Figma's
 * model — and everything else reads Fixed. The badge sharpens as drafts accumulate; the
 * menu's write behavior is exact either way.
 */
import type { DesignModeSizeMode } from "../protocol";
import type { DraftStore } from "./vendor/drafts";
import { isFlex, mainAxisProp, normalizeAlign } from "./vendor/panel-readers";
import { defeatFillIfGrowing } from "./vendor/panel-specs";
import type { TaggedElement } from "./vendor/source";

export type SizeAxis = "width" | "height";

const HUG_KEYWORDS = new Set(["auto", "fit-content", "min-content", "max-content"]);

interface AxisContext {
  /** null when the parent is not a flex container. */
  role: "main" | "cross" | null;
}

function axisContext(el: TaggedElement, axis: SizeAxis): AxisContext {
  const parent = el.parentElement;
  if (!parent || !isFlex(parent as TaggedElement)) return { role: null };
  const direction = getComputedStyle(parent).flexDirection.startsWith("column") ? "column" : "row";
  return { role: mainAxisProp(direction) === axis ? "main" : "cross" };
}

/** Draft-first current value for `prop` — the same precedence every vendored reader uses. */
function currentValue(el: TaggedElement, prop: string, drafts: DraftStore): string {
  return drafts.current(el, prop) ?? getComputedStyle(el).getPropertyValue(prop);
}

export function readSizeMode(
  el: TaggedElement,
  axis: SizeAxis,
  drafts: DraftStore,
): DesignModeSizeMode {
  const draft = drafts.current(el, axis);
  if (draft !== null) {
    if (HUG_KEYWORDS.has(draft)) return "hug";
    if (draft === "100%") return "fill";
  }
  const { role } = axisContext(el, axis);
  if (role === "main") {
    const grow = Number.parseFloat(currentValue(el, "flex-grow", drafts));
    if (Number.isFinite(grow) && grow >= 1) return "fill";
  }
  if (role === "cross" && draft === null) {
    if (normalizeAlign(currentValue(el, "align-self", drafts)) === "stretch") return "fill";
  }
  return "fixed";
}

export function readSizeModes(
  el: TaggedElement,
  drafts: DraftStore,
): { width: DesignModeSizeMode; height: DesignModeSizeMode } {
  return {
    width: readSizeMode(el, "width", drafts),
    height: readSizeMode(el, "height", drafts),
  };
}

export function applySizeMode(
  el: TaggedElement,
  axis: SizeAxis,
  mode: DesignModeSizeMode,
  drafts: DraftStore,
): void {
  const { role } = axisContext(el, axis);
  switch (mode) {
    case "fixed": {
      // Freeze the size the element has RIGHT NOW, then pin it — measure before the
      // defeat, or releasing a fill would first collapse the element and pin that.
      const measured = Math.round(el.getBoundingClientRect()[axis]);
      defeatFillIfGrowing(el, axis, drafts);
      drafts.apply(el, axis, `${measured}px`);
      return;
    }
    case "hug": {
      defeatFillIfGrowing(el, axis, drafts);
      if (role === "cross") drafts.apply(el, "align-self", "flex-start");
      drafts.apply(el, axis, axis === "width" && role === null ? "fit-content" : "auto");
      return;
    }
    case "fill": {
      if (role === "main") {
        drafts.apply(el, "flex-grow", "1");
        drafts.apply(el, "flex-basis", "0%");
        drafts.apply(el, axis, "auto");
      } else if (role === "cross") {
        drafts.apply(el, "align-self", "stretch");
        drafts.apply(el, axis, "auto");
      } else {
        drafts.apply(el, axis, "100%");
      }
      return;
    }
  }
}
