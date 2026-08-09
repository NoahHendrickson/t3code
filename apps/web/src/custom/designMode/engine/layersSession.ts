import { DESIGN_MODE_LAYERS_MAX_DEPTH, type DesignModeLayerNode } from "../protocol";
import type { ElementIdRegistry } from "./idRegistry";
import { hasForgeTags } from "./nativeSource";
import { SettleObserver } from "./settleGate";
import { buildLayerTree, type LayerBudget, type LayerNode } from "./vendor/layers";
import { reorderAxisOf } from "./vendor/move-drag";

/** Node cap for one layers message — a deep page must not turn every mutation into a
 * multi-hundred-KB console line. Enforced inside the WALK (buildLayerTree's budget), so
 * an untagged page's full-DOM walk also allocates and labels at most this many nodes per
 * rebuild instead of building the whole tree first (PR #54 review). The host renders a
 * truncation note. */
const LAYERS_NODE_CAP = 400;

/** What every node under one DOM parent shares. Computed once per parent per emit: a
 * `getComputedStyle` per CHILD to ask the same question about the same parent is exactly the
 * churn a 400-node rebuild every 250ms can't afford (PR #57 review). */
interface ParentFacts {
  /** Identifies the DOM parent within this emit — see DesignModeLayerNode.siblingGroup. */
  readonly group: number;
  /** Its children can be reordered (auto-layout container). */
  readonly reorderable: boolean;
}

const DETACHED: ParentFacts = { group: -1, reorderable: false };

/**
 * Sibling rows in the order the CANVAS paints them — but ONLY when the `order` in play is
 * our own move preview.
 *
 * A move draft previews as inline `order` and never touches the DOM, so a straight DOM walk
 * leaves a just-dragged row exactly where it was: the gesture reads as a no-op on the very
 * surface that started it. Reading INLINE order rather than computed is what keeps the two
 * halves of reordering honest (PR #57 review): the vendored preview writes inline `order` on
 * every sibling, while an app's own `order` arrives through a stylesheet — and `reorderById`
 * computes its indices in DOM order, which only stays coherent while nothing but our preview
 * is permuting the group. So an app that authors `order` keeps its rail in DOM order (as it
 * was before this feature) instead of getting a rail whose drops land one slot off.
 *
 * Reading `style.order` is also free where `getComputedStyle` in a sort comparator was not.
 * Array#sort is stable, so equal orders keep DOM order.
 */
function visualOrder(
  nodes: LayerNode[],
  parent: Element | null,
  reorderable: boolean,
): LayerNode[] {
  if (nodes.length < 2 || !parent || !reorderable) return nodes;
  if (!nodes.every((node) => node.el.parentElement === parent)) return nodes;
  const inlineOrder = (node: LayerNode): string =>
    node.el instanceof HTMLElement || node.el instanceof SVGElement ? node.el.style.order : "";
  if (!nodes.some((node) => inlineOrder(node) !== "")) return nodes;
  const decorated = nodes.map((node) => ({
    node,
    order: Number.parseInt(inlineOrder(node), 10) || 0,
  }));
  decorated.sort((a, b) => a.order - b.order);
  return decorated.map((entry) => entry.node);
}

/**
 * Owns the layers subsystem end to end: the body MutationObserver (exists only between
 * start() and stop() — zero idle overhead), the debounced rebuild, serialization with
 * its node cap, the change gate, and the layers scope of the shared id registry.
 * HeadlessDesignMode only wires the `onLayers` hook and the select/hover commands.
 */
export class LayersSession {
  onLayers?: (roots: DesignModeLayerNode[], truncated: boolean) => void;

  /** Settle-driven rebuilds via the engine's shared observe-then-settle primitive
   * (settleGate.ts) — same debounce the verifier uses, one home for the idiom. */
  private readonly settle = new SettleObserver({
    // The observer can never feed back on itself — the overlay hangs off documentElement,
    // outside the observed body subtree. characterData is included so our own inline text
    // edits relabel their rows. Known cost: a page whose text genuinely changes on a
    // timer (ticking clock, streaming log) defeats the change gate — the tree really is
    // different — so it rebuilds+emits once per debounce window while the mode is on.
    // If that ever surfaces in a perf audit, the lever is dropping characterData and
    // accepting stale labels until a structural mutation.
    target: () => document.body,
    observe: { childList: true, subtree: true, characterData: true },
    onSettle: () => this.emit(),
  });
  private lastJson = "";
  /** Per-emit memo — cleared at the top of every emit, never held across one. */
  private parents = new Map<Element, ParentFacts>();

  constructor(private readonly registry: ElementIdRegistry) {}

  start(): void {
    this.settle.start();
    this.emit();
  }

  stop(): void {
    this.settle.stop();
    this.registry.clearLayersScope();
    this.parents.clear();
    this.lastJson = "";
  }

  private factsFor(parent: Element | null): ParentFacts {
    if (!parent) return DETACHED;
    const known = this.parents.get(parent);
    if (known) return known;
    const facts: ParentFacts = {
      group: this.parents.size,
      reorderable: reorderAxisOf(parent) !== null,
    };
    this.parents.set(parent, facts);
    return facts;
  }

  /** Mints host ids for the already budget/depth-capped tree, retaining a defensive protocol
   * depth check. The host parser rejects a whole layers message one node past the bound, so a
   * page nesting deeper than this used to make the rail vanish rather than truncate. */
  private serialize(nodes: LayerNode[], budget: LayerBudget, depth = 0): DesignModeLayerNode[] {
    if (depth > DESIGN_MODE_LAYERS_MAX_DEPTH) {
      if (nodes.length > 0) budget.truncated = true;
      return [];
    }
    // The curated walk hoists tagged descendants through untagged wrappers, so a "sibling
    // group" in the tree can span several DOM parents — hence facts per node, from one memo.
    const parent = nodes[0]?.el.parentElement ?? null;
    const shared = this.factsFor(parent);
    return visualOrder(nodes, parent, shared.reorderable).map((node) => {
      const facts =
        node.el.parentElement === parent ? shared : this.factsFor(node.el.parentElement);
      return {
        id: this.registry.mintForLayers(node.el),
        tag: node.el.tagName.toLowerCase(),
        label: node.label,
        reorderable: facts.reorderable,
        siblingGroup: facts.group,
        children: this.serialize(node.children, budget, depth + 1),
      };
    });
  }

  /** Rebuilds + emits the curated layers tree; change-gated so mutation bursts that leave
   * the tree's shape (and labels) identical cost one JSON compare, not a bridge message. */
  private emit = (): void => {
    this.registry.clearLayersScope();
    this.parents.clear();
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
