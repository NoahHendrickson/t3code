import type { TaggedElement } from "./vendor/source";

/**
 * The ONE id space for every element the host can reference — selection snapshots and
 * layers nodes mint here, and every host command (applyDraft, selectElement,
 * hoverElement) resolves here. Ids are stable per element for the page's lifetime
 * (WeakMap side); the strong references are scoped so detached elements cannot leak:
 * the selection scope is retained to the live selection on every change, and the layers
 * scope is rebuilt on every tree emit.
 */
export class ElementIdRegistry {
  private readonly idOf = new WeakMap<TaggedElement, number>();
  private readonly selectionScope = new Map<number, TaggedElement>();
  private readonly layersScope = new Map<number, TaggedElement>();
  private nextId = 1;

  /** Stable id for `el`, minting on first sight. Holds no strong reference by itself. */
  mint(el: TaggedElement): number {
    let id = this.idOf.get(el);
    if (id === undefined) {
      id = this.nextId++;
      this.idOf.set(el, id);
    }
    return id;
  }

  /** Replaces the selection scope with exactly `els`. */
  retainSelection(els: readonly TaggedElement[]): void {
    this.selectionScope.clear();
    for (const el of els) this.selectionScope.set(this.mint(el), el);
  }

  /** Mints `el` into the layers scope (rebuilt per emit via clearLayersScope). */
  mintForLayers(el: TaggedElement): number {
    const id = this.mint(el);
    this.layersScope.set(id, el);
    return id;
  }

  clearLayersScope(): void {
    this.layersScope.clear();
  }

  /** The element behind a host-supplied id, from either scope; null when unknown or no
   * longer connected (a stale id from before a re-render must no-op, never resurrect). */
  resolve(id: number): TaggedElement | null {
    const el = this.selectionScope.get(id) ?? this.layersScope.get(id);
    return el && el.isConnected ? el : null;
  }
}
