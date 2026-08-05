import { DESIGN_MODE_LAYERS_MAX_DEPTH, type DesignModeLayerNode } from "../protocol";
import type { ElementIdRegistry } from "./idRegistry";
import { hasForgeTags } from "./nativeSource";
import { buildLayerTree, type LayerBudget, type LayerNode } from "./vendor/layers";
import { reorderAxisOf } from "./vendor/move-drag";

/** Quiet-window for MutationObserver-driven layers rebuilds — HMR re-renders land as
 * bursts (same rationale as the Forge's LayersTree REFRESH_DEBOUNCE_MS). */
const LAYERS_DEBOUNCE_MS = 250;

/** Node cap for one layers message — a deep page must not turn every mutation into a
 * multi-hundred-KB console line. Enforced inside the WALK (buildLayerTree's budget), so
 * an untagged page's full-DOM walk also allocates and labels at most this many nodes per
 * rebuild instead of building the whole tree first (PR #54 review). The host renders a
 * truncation note. */
const LAYERS_NODE_CAP = 400;

/**
 * Owns the layers subsystem end to end: the body MutationObserver (exists only between
 * start() and stop() — zero idle overhead), the debounced rebuild, serialization with
 * its node cap, the change gate, and the layers scope of the shared id registry.
 * HeadlessDesignMode only wires the `onLayers` hook and the select/hover commands.
 */
export class LayersSession {
  onLayers?: (roots: DesignModeLayerNode[], truncated: boolean) => void;

  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastJson = "";

  constructor(private readonly registry: ElementIdRegistry) {}

  start(): void {
    // The observer can never feed back on itself — the overlay hangs off documentElement,
    // outside the observed body subtree. characterData is included so our own inline text
    // edits relabel their rows. Known cost: a page whose text genuinely changes on a
    // timer (ticking clock, streaming log) defeats the change gate — the tree really is
    // different — so it rebuilds+emits once per debounce window while the mode is on.
    // If that ever surfaces in a perf audit, the lever is dropping characterData and
    // accepting stale labels until a structural mutation.
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.emit();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.registry.clearLayersScope();
    this.lastJson = "";
  }

  private schedule = (): void => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit();
    }, LAYERS_DEBOUNCE_MS);
  };

  /** Mints host ids for the already budget/depth-capped tree, retaining a defensive protocol
   * depth check. The host parser rejects a whole layers message one node past the bound, so a
   * page nesting deeper than this used to make the rail vanish rather than truncate. */
  private serialize(nodes: LayerNode[], budget: LayerBudget, depth = 0): DesignModeLayerNode[] {
    if (depth > DESIGN_MODE_LAYERS_MAX_DEPTH) {
      if (nodes.length > 0) budget.truncated = true;
      return [];
    }
    return nodes.map((node) => ({
      id: this.registry.mintForLayers(node.el),
      tag: node.el.tagName.toLowerCase(),
      label: node.label,
      // The move op previews as inline `order`, so only an auto-layout parent can honor a
      // reorder — reorderAxisOf is the same predicate the pointer drag and the arrow keys
      // gate on, never a second copy of the rule.
      reorderable: reorderAxisOf(node.el.parentElement) !== null,
      children: this.serialize(node.children, budget, depth + 1),
    }));
  }

  /** Rebuilds + emits the curated layers tree; change-gated so mutation bursts that leave
   * the tree's shape (and labels) identical cost one JSON compare, not a bridge message. */
  private emit = (): void => {
    this.registry.clearLayersScope();
    const budget: LayerBudget = { left: LAYERS_NODE_CAP, truncated: false };
    // Untagged pages get the full-DOM walk; any PROJECT Forge tag keeps the curated one.
    // Re-read per emit (cost: one querySelector) so a framework that mounts its tagged
    // tree after the first emit flips the mode without a restart. Synthesized tags are
    // excluded by hasForgeTags, so T3's own lazy tagging can never collapse the tree.
    const roots = this.serialize(
      buildLayerTree(document.body, !hasForgeTags(), budget, DESIGN_MODE_LAYERS_MAX_DEPTH),
      budget,
    );
    const json = JSON.stringify(roots);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.onLayers?.(roots, budget.truncated);
  };
}
