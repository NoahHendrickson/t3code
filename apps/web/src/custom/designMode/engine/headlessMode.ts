/**
 * The headless design-mode orchestrator — the guest half of the native-panel split.
 *
 * Adapted from the vendored DesignMode (vendor/index.ts, itself pruned from the Forge):
 * this keeps everything that must physically live in the page — selection chrome, hover,
 * keyboard verbs, inline-style drafts, structural verbs (delete/move/text/resize), the
 * layout ripple, the pan/zoom artboard, draft persistence — and drops every piece of
 * in-page chrome UI (panel, dock, layers tree, status strip); all controls are native T3
 * chrome. Subsystems with their own lifecycle live in sibling sessions this class only
 * wires: layersSession.ts (tree observer) and canvasSession.ts (artboard + zoom readout).
 * Host hooks (`onSelection` / `onDraftsCount` / `onStateChange` / `onLayers`, plus the
 * sessions' own) forward over the console-message bridge via boot.ts, which also installs
 * the command surface the native T3 panel drives through `window.__T3_DESIGN_MODE__`
 * (protocol.ts `DesignModeGuestHandle`).
 *
 * Vendored why-comments are preserved verbatim where the logic came across unchanged.
 */
import { buildElementSnapshot } from "./snapshot";
import type {
  DesignChangeRequestPayload,
  DesignModeElementSnapshot,
  DesignModeLayerNode,
  DesignModeSizeMode,
  DesignModeWritableKey,
} from "../protocol";
import type { HeadlessOverlay } from "./headlessOverlay";
import { CanvasSession } from "./canvasSession";
import { ElementIdRegistry } from "./idRegistry";
import { LayersSession } from "./layersSession";
import { basename, findSelectableElement, type TaggedElement } from "./vendor/source";
import {
  awaitResolutions,
  isSynthesizedSource,
  markSynthesizedSource,
  resolveAndTag,
  sourceContextTargets,
} from "./nativeSource";
import { applySizeMode } from "./sizeMode";
import { DraftStore } from "./vendor/drafts";
import { isEditable, unionClientRect } from "./vendor/canvas";
import { TextEditMode } from "./vendor/text-edit";
import { MoveDrag } from "./vendor/move-drag";
import { ResizeHandles } from "./vendor/resize";
import {
  buildChangeRequestWithElements,
  cssPath,
  renderStandaloneMarkdown,
} from "./vendor/request";
import { snapshotRects, diffRects } from "./vendor/ripple";
import { resetTokensCache } from "./vendor/tokens";
import {
  saveLifecycle,
  sourceIndex,
  locateBySource,
  type PersistedLifecycle,
} from "./vendor/lifecycle-store";

/** Rapid edits (e.g. dragging a number field) within this window reuse the first snapshot. */
const RIPPLE_DEBOUNCE_MS = 300;

/** Hover dwell before prefetching an untagged element's native source — a moving cursor
 * cancels before any resolver work starts, so pointer traffic costs nothing. */
const HOVER_RESOLVE_DELAY_MS = 75;

/** Send-time grace for in-flight native source resolution. Past this cap the request
 * ships with per-element selector/text fallback instead of blocking the send. */
const SEND_SOURCE_WAIT_MS = 1500;

/** Arrow keys → the direction vocabulary MoveDrag speaks (P3 ratified #2). A lookup, not a
 * switch, so `ARROW_DIRS[e.key]` doubles as the "is this an arrow at all" test. */
const ARROW_DIRS: Record<string, "left" | "right" | "up" | "down" | undefined> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export class HeadlessDesignMode {
  active = false;
  /** Ordered set of currently selected elements — VisBug-style multi-select (B6). */
  selection: TaggedElement[] = [];
  /** Host hooks — boot.ts forwards these over the console-message bridge. */
  onSelection?: (elements: DesignModeElementSnapshot[]) => void;
  onDraftsCount?: (count: number) => void;
  onStateChange?: (active: boolean) => void;
  onLayers?: (roots: DesignModeLayerNode[], truncated: boolean) => void;

  private moveRaf = 0;
  private reflowRaf = 0;
  private rippleRaf = 0;
  private lastMove: MouseEvent | null = null;
  private textEdit: TextEditMode;
  /** Idle-zero: constructed here, but no listener exists until their start() in setActive. */
  private moveDrag: MoveDrag;
  private handles: ResizeHandles;
  readonly drafts: DraftStore;

  /** The one id space selection snapshots and layers nodes share — every host command
   * resolves here, so tree, panel, and outlines can never disagree about an id. */
  private readonly registry = new ElementIdRegistry();
  /** The layers subsystem (observer, debounce, cap, change gate) — see layersSession.ts. */
  private readonly layers = new LayersSession(this.registry);

  /** Emit-on-change guard for the drafts count — drafts.onChange fires per scrub tick, and
   * each console.log line crosses the webview boundary; the count itself changes rarely. */
  private lastSentCount = -1;

  // Layout-ripple state: idle-zero — only populated during the post-edit window.
  // A rapid burst of edits (e.g. dragging a number field) reuses each element's FIRST
  // snapshot in the burst until RIPPLE_DEBOUNCE_MS of quiet, so ripples reflect
  // drag-start -> drag-end, not per-tick noise. Keyed BY EDITED ELEMENT because a
  // multi-select commit loop calls handleBeforeEdit once per selected element per
  // tick. Snapshots are cleared by a quiet-window TIMER (reset on every edit), not by
  // the rAF that runs the diff.
  private rippleSnapshots: Map<TaggedElement, Map<TaggedElement, DOMRect>> | null = null;
  private lastEditAt = 0;
  private rippleQuietTimer: ReturnType<typeof setTimeout> | null = null;

  /** Drafts/selection from a restored session whose elements haven't rendered yet — boot
   * runs before the framework mounts, so restoreLifecycle retries these on a short timer
   * until the DOM catches up (bounded). */
  private pendingRestore: {
    drafts: PersistedLifecycle["drafts"];
    selection: PersistedLifecycle["selection"];
  } | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  /** R2 F-C: debounces persist() off drafts.onChange, which otherwise fires on EVERY scrub
   * tick — querySelectorAll + JSON.stringify + a synchronous sessionStorage.setItem per
   * drag frame. */
  private draftSyncTimer: ReturnType<typeof setTimeout> | null = null;
  /** Elements added to the selection BY the restore drain (R2 F-B) — the moment the user
   * makes their OWN selection, pending restore items are dropped as resolved-obsolete
   * instead of stomping what the user just chose. */
  private restoredSelection = new WeakSet<TaggedElement>();

  /** The canvas subsystem (vendored pan/zoom artboard, command dispatch, debounced
   * settled emit, change gate) — see canvasSession.ts. Public: boot.ts wires its host
   * hook and the setCanvas/canvasCommand handle verbs straight to it. Constructed
   * BEFORE the gesture modules so their scale() hooks can reference it. */
  readonly canvas: CanvasSession;

  constructor(private overlay: HeadlessOverlay) {
    this.canvas = new CanvasSession({
      hostContains: (t) => this.overlay.containsDeep(t),
      // Per pan/zoom tick: chrome re-measures through the same rAF coalescer
      // scroll/resize use.
      onReflow: () => this.onReflow(),
      selectionRect: () => unionClientRect(this.selection.filter((el) => el.isConnected)),
    });
    this.drafts = new DraftStore();
    this.textEdit = new TextEditMode(this.drafts, {
      select: (el) => this.select(el),
      isSoleSelection: (el) => this.selection.length === 1 && this.selection[0] === el,
      beforeEdit: (el) => this.handleBeforeEdit(el),
      edited: () => this.handleEdited(),
      hideHover: () => this.overlay.hideOutline(),
    });
    // scale() reads the live canvas transform (1 while the artboard is off); the
    // preview's own zoom happens at the Electron compositor, outside the guest's CSS
    // coordinate space.
    this.moveDrag = new MoveDrag({
      drafts: this.drafts,
      scale: () => this.canvas.scale(),
      blocked: () => this.textEdit.active,
      overlayContains: (t) => this.overlay.containsDeep(t),
      onSelect: (el) => this.select(el),
      onEdited: () => this.handleEdited(),
    });
    this.handles = new ResizeHandles({
      drafts: this.drafts,
      scale: () => this.canvas.scale(),
      onEdited: () => this.handleEdited(),
    });
    this.overlay.attach(this.moveDrag.root);
    this.overlay.attach(this.handles.root);
    this.drafts.onChange = () => {
      this.emitDraftsCount();
      if (this.draftSyncTimer) clearTimeout(this.draftSyncTimer);
      this.draftSyncTimer = setTimeout(() => this.flushDraftSync(), RIPPLE_DEBOUNCE_MS);
    };
    this.layers.onLayers = (roots, truncated) => this.onLayers?.(roots, truncated);
  }

  private emitDraftsCount(): void {
    const count = this.drafts.changeCount();
    if (count === this.lastSentCount) return;
    this.lastSentCount = count;
    this.onDraftsCount?.(count);
  }

  /** Cancels the pending debounced draft-sync timer (if any) and runs
   * healStructural()+persist() immediately (R2 F-C). */
  private flushDraftSync(): void {
    if (this.draftSyncTimer) {
      clearTimeout(this.draftSyncTimer);
      this.draftSyncTimer = null;
    }
    // Structural drafts are keyed by node reference — re-bind (or prune) any whose node an
    // HMR remount replaced before projecting state to sessionStorage (PR #44 review).
    this.drafts.healStructural();
    this.persist();
    // Edits change the selection's COMPUTED values, and a fresh snapshot is how the
    // panel finds out — the same rule discardAll already follows. Without this, a draft
    // that changes what the panel renders structurally (display: flex reveals the whole
    // auto-layout group) stayed invisible until a reselect. Riding the debounce keeps
    // scrub bursts at zero extra bridge traffic.
    if (this.active && this.selection.length > 0) this.emitSelection();
  }

  // ── Host commands (driven by the native panel through the guest handle) ──────────────

  /** Applies one CSS draft to every listed selection id — the native panel's edit path.
   * Ripple bookkeeping mirrors the in-page panel's before/after hooks so scrub bursts
   * keep their drag-start baselines. */
  applyDraft(idList: readonly number[], property: DesignModeWritableKey, value: string): void {
    const els = idList
      .map((id) => this.registry.resolve(id))
      .filter((el): el is TaggedElement => el !== null);
    if (els.length === 0) return;
    for (const el of els) this.handleBeforeEdit(el);
    for (const el of els) this.drafts.apply(el, property, value);
    this.handleEdited();
  }

  /** Applies a Figma sizing mode (fixed/hug/fill) to one axis — the mode's coordinated
   * multi-property write lives in engine/sizeMode.ts. Discrete (a menu pick, never a
   * scrub tick), so the fresh snapshot goes out immediately, like discardAll. */
  setSizeMode(idList: readonly number[], axis: "width" | "height", mode: DesignModeSizeMode): void {
    const els = idList
      .map((id) => this.registry.resolve(id))
      .filter((el): el is TaggedElement => el !== null);
    if (els.length === 0) return;
    for (const el of els) this.handleBeforeEdit(el);
    for (const el of els) applySizeMode(el, axis, mode, this.drafts);
    this.handleEdited();
    this.emitSelection();
  }

  /** The one discard-everything verb. Re-emits the selection afterwards: computed values
   * changed under the panel, and a fresh snapshot is how it finds out. */
  discardAll(): void {
    this.drafts.discardAll();
    this.remeasure();
    this.emitSelection();
  }

  compareAll(on: boolean): void {
    this.drafts.compareAll(on);
  }

  /** The send seam. Builds the standalone change-request markdown (guardrails included —
   * the payload lands in a T3 thread with no other delivery wrapper) plus the compact
   * per-element summaries the composer's attachment pill renders. Returns null when
   * every draft is a no-op. Drafts stay applied as previews; the user discards them once
   * the agent's edit lands and the page hot-reloads. */
  async buildSend(): Promise<DesignChangeRequestPayload | null> {
    this.flushDraftSync();
    // Native-source grace: kick (or join) resolution for every still-untagged drafted
    // element, plus the parent/sibling context the structural asks name, and give the
    // batch a bounded wait. A send moments after a fast click usually still gets its
    // file:line:col; past the cap each unresolved element ships selector/text context.
    await awaitResolutions(
      [...sourceContextTargets(this.drafts.draftedElements())],
      SEND_SOURCE_WAIT_MS,
    );
    const { request } = buildChangeRequestWithElements(this.drafts);
    if (request.elements.length === 0) return null;
    const opLabels: Record<string, string> = {
      delete: "Delete element",
      text: "Edit text",
      move: "Reorder",
      absolute: "Absolute position",
    };
    const elements = request.elements.map((el) => ({
      tag: el.tag,
      sourceLabel: el.source ? `${basename(el.source.file)}:${el.source.line}` : null,
      deltas: [
        ...el.changes.map((c) => `${c.property} ${c.beforeCss} → ${c.afterCss}`),
        ...(el.ops ?? []).map((op) => opLabels[op.kind] ?? op.kind),
      ],
    }));
    return {
      markdown: renderStandaloneMarkdown(request),
      elementCount: request.elements.length,
      elements,
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────────────

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.overlay.setActive(on);
    if (on) {
      // Tokens are memoized module-globally — reset on every activation so a theme edit
      // made while design mode was off is picked up (request builder reads them at send).
      resetTokensCache();
      document.addEventListener("mousemove", this.onMove, true);
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("dblclick", this.onDblClick, true);
      document.addEventListener("keydown", this.onKey, true);
      document.addEventListener("pointerdown", this.onPointerDown, true);
      document.addEventListener("scroll", this.onReflow, { capture: true, passive: true });
      window.addEventListener("resize", this.onReflow, { passive: true });
      this.moveDrag.start();
      this.handles.start();
      this.layers.start();
      // Re-enter the artboard if this session had canvas on (CanvasMode's own pref).
      this.canvas.resume();
      this.persist();
    } else {
      this.textEdit.finish(); // commit any in-progress inline text edit before the listeners go
      // Undo every canvas page mutation but keep the preference — the next activation
      // resumes the same view.
      this.canvas.suspend();
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("dblclick", this.onDblClick, true);
      document.removeEventListener("keydown", this.onKey, true);
      document.removeEventListener("pointerdown", this.onPointerDown, true);
      document.removeEventListener("scroll", this.onReflow, true);
      window.removeEventListener("resize", this.onReflow);
      this.moveDrag.stop();
      this.handles.stop();
      this.layers.stop();
      this.clearNoDrop();
      if (this.moveRaf) cancelAnimationFrame(this.moveRaf);
      if (this.reflowRaf) cancelAnimationFrame(this.reflowRaf);
      if (this.rippleRaf) cancelAnimationFrame(this.rippleRaf);
      this.moveRaf = 0;
      this.reflowRaf = 0;
      this.rippleRaf = 0;
      this.clearRippleState();
      this.lastMove = null;
      if (this.hoverResolveTimer) clearTimeout(this.hoverResolveTimer);
      this.hoverResolveTimer = null;
      this.hoverResolveTarget = null;
      this.setSelection([]);
      // A session the user turned off must not keep restoring in the background.
      if (this.restoreTimer) clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
      this.pendingRestore = null;
      this.drafts.compareAll(false); // previews survive exit — never leave the page stranded on "before"
      // A deactivate mid-debounce-window must not leave sessionStorage stale — flush (R2 F-C).
      this.flushDraftSync();
      this.persist();
    }
    this.onStateChange?.(this.active);
  }

  /** Rebuilds the session from a persisted lifecycle after a full page reload: re-activates,
   * re-applies draft previews, and re-selects. The boot pass IS the first drain (R2 F-B). */
  restoreLifecycle(saved: PersistedLifecycle): void {
    if (!saved.designModeOn) return;
    this.setActive(true);
    this.pendingRestore = { drafts: saved.drafts, selection: saved.selection };
    const { done } = this.drainPendingRestore();
    if (!done) this.scheduleRestoreRetry();
    this.persist();
  }

  /** Single per-item drain used by BOTH the boot pass and every retry tick (R2 F-B).
   * drafts: apply located items, keep unresolved ones pending. selection: located items
   * are added only while the current selection is still restore-owned — a user's own
   * selection is never overwritten by a late-appearing restore element. */
  private drainPendingRestore(): { done: boolean } {
    const pending = this.pendingRestore;
    if (!pending) return { done: true };

    const remainingDrafts: PersistedLifecycle["drafts"] = [];
    for (const d of pending.drafts) {
      const el = this.locatePersisted(d);
      if (!el) {
        remainingDrafts.push(d);
        continue;
      }
      for (const [prop, value] of d.props) this.drafts.apply(el, prop, value);
    }
    pending.drafts = remainingDrafts;

    const restoreOwnsSelection =
      this.selection.length === 0 || this.selection.every((el) => this.restoredSelection.has(el));
    const remainingSelection: PersistedLifecycle["selection"] = [];
    if (restoreOwnsSelection) {
      const additions: TaggedElement[] = [];
      for (const sel of pending.selection) {
        const el = this.locatePersisted(sel);
        if (el) additions.push(el);
        else remainingSelection.push(sel);
      }
      if (additions.length > 0) {
        for (const el of additions) this.restoredSelection.add(el);
        this.setSelection([...this.selection, ...additions]);
      }
    }
    pending.selection = remainingSelection;

    const done = pending.drafts.length === 0 && pending.selection.length === 0;
    if (done) this.pendingRestore = null;
    return { done };
  }

  /** Bounded retry (300ms × 40 ≈ 12s) — an app that never renders the tagged element
   * (e.g. it was deleted by the agent) must not leak a timer or a zombie pendingRestore. */
  private scheduleRestoreRetry(attempt = 0): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      if (!this.pendingRestore) return;
      const { done } = this.drainPendingRestore();
      if (!done && attempt + 1 < 40) {
        this.scheduleRestoreRetry(attempt + 1);
        return;
      }
      this.pendingRestore = null;
      this.persist();
    }, 300);
  }

  /** Source-first, selector-fallback locate for restored entries. A Forge tag re-renders
   * after a reload; a T3-synthesized one does not — its entry carries a css path instead,
   * and a selector hit re-earns its synthesized tag so every downstream consumer sees the
   * canonical address again. The selector is trusted only when it matches exactly one
   * element: cssPath is depth-capped and unanchored — a pattern, not an address — and
   * restoring onto the wrong element would silently draft (and stamp a synthesized
   * source on) some other node. A missed restore is recoverable; a wrong one isn't. */
  private locatePersisted(entry: {
    dcSource: string;
    index: number;
    selector?: string;
  }): TaggedElement | null {
    if (entry.dcSource) {
      const bySource = locateBySource(entry.dcSource, entry.index);
      if (bySource) return bySource;
    }
    if (!entry.selector) return null;
    let candidate: Element | null = null;
    try {
      const hits = document.querySelectorAll(entry.selector);
      if (hits.length !== 1) return null;
      candidate = hits[0] ?? null;
    } catch {
      return null; // a malformed persisted selector must not break the drain
    }
    if (!(candidate instanceof HTMLElement || candidate instanceof SVGElement)) return null;
    if (entry.dcSource && !candidate.dataset.dcSource) {
      markSynthesizedSource(candidate, entry.dcSource);
    }
    return candidate;
  }

  /** The persisted address of one live element: (dcSource, index-among-matches) so list
   * items sharing one source location survive a reload individually, plus a css-path
   * selector whenever the tag is synthesized or absent (see locatePersisted). Null when
   * the element is unaddressable either way — preview-only, not persisted. */
  private persistedAddress(
    el: TaggedElement,
  ): { dcSource: string; index: number; selector?: string } | null {
    const dcSource = el.dataset?.dcSource ?? "";
    const selector = !dcSource || isSynthesizedSource(el) ? cssPath(el) : undefined;
    if (!dcSource && !selector) return null;
    return {
      dcSource,
      index: dcSource ? sourceIndex(el, dcSource) : 0,
      ...(selector ? { selector } : {}),
    };
  }

  /** Serializes the full lifecycle to sessionStorage. Called only from state-change hooks
   * while the tool is in use. */
  private persist(): void {
    const persistKey = (e: { dcSource: string; index: number; selector?: string }): string =>
      e.dcSource ? `${e.dcSource}#${e.index}` : `sel:${e.selector ?? ""}`;
    const drafts: PersistedLifecycle["drafts"] = [];
    const liveKeys = new Set<string>();
    for (const [el, props] of this.drafts.entries()) {
      const address = this.persistedAddress(el as TaggedElement);
      if (!address) continue;
      liveKeys.add(persistKey(address));
      drafts.push({
        ...address,
        props: [...props.entries()].map(([p, d]) => [p, d.value] as [string, string]),
      });
    }
    // Merge in still-unresolved restore work so a reload mid-retry-window doesn't lose it.
    if (this.pendingRestore) {
      for (const d of this.pendingRestore.drafts) {
        if (!liveKeys.has(persistKey(d))) drafts.push(d);
      }
    }
    const selection =
      this.selection.length === 0 && this.pendingRestore && this.pendingRestore.selection.length > 0
        ? this.pendingRestore.selection
        : this.selection.flatMap((el) => {
            const address = this.persistedAddress(el);
            return address ? [address] : [];
          });
    saveLifecycle({
      v: 1,
      designModeOn: this.active,
      selection,
      drafts,
      sent: [],
    });
  }

  // ── Selection ────────────────────────────────────────────────────────────────────────

  /** Replaces the selection with just `el` (plain click / programmatic single-select). */
  select(el: TaggedElement): void {
    this.setSelection([el]);
  }

  deselect(): void {
    this.setSelection([]);
  }

  /** Shift+click: toggles `el`'s membership in the selection. */
  private toggleSelection(el: TaggedElement): void {
    const idx = this.selection.indexOf(el);
    const next = idx === -1 ? [...this.selection, el] : this.selection.filter((s) => s !== el);
    this.setSelection(next);
  }

  // ── Native source resolution (untagged elements) ─────────────────────────────────────

  private hoverResolveTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverResolveTarget: TaggedElement | null = null;

  /** Dwell prefetch: an untagged element hovered for HOVER_RESOLVE_DELAY_MS warms its
   * source lookup so the click that follows usually finds the label already resolved.
   * Same-target moves are free; leaving the element cancels the pending timer. */
  private scheduleHoverResolve(el: TaggedElement | null): void {
    if (el === this.hoverResolveTarget) return;
    if (this.hoverResolveTimer) clearTimeout(this.hoverResolveTimer);
    this.hoverResolveTimer = null;
    this.hoverResolveTarget = el;
    if (!el || el.dataset?.dcSource) return;
    this.hoverResolveTimer = setTimeout(() => {
      this.hoverResolveTimer = null;
      if (this.active && this.hoverResolveTarget === el) void resolveAndTag(el);
    }, HOVER_RESOLVE_DELAY_MS);
  }

  /** Selection promotes resolution to the front: the selected elements themselves plus
   * the parent and adjacent siblings the structural asks (move/absolute) name. A selected
   * element gaining its source re-emits the snapshot (panel label) and upgrades the
   * persisted address; context elements resolve silently. */
  private promoteSourceResolution(els: readonly TaggedElement[]): void {
    for (const target of sourceContextTargets(els)) {
      if (target.dataset?.dcSource) continue;
      void resolveAndTag(target).then((tagged) => {
        if (!tagged || !this.active || !this.selection.includes(target)) return;
        this.emitSelection();
        this.persist();
      });
    }
  }

  private setSelection(next: TaggedElement[]): void {
    // wasSingle: read BEFORE the assignment — a single→single hop is the one case the
    // outline tweens (multi-select and first-selection always snap).
    const wasSingle = this.selection.length === 1;
    this.selection = next;
    this.clearRippleState();
    // Tombstones get no outline: a display:none element measures 0×0-at-origin, so an
    // outline "hugging" it is a lie. The panel still shows it, so Discard stays reachable.
    const outlined = this.outlinable(next);
    if (next.length === 0) {
      this.overlay.hideSelectOutline();
      this.overlay.hideSelectOutlines();
    } else if (next.length === 1) {
      this.overlay.hideSelectOutlines();
      if (outlined.length === 1)
        this.overlay.showSelectOutline(next[0].getBoundingClientRect(), wasSingle);
      else this.overlay.hideSelectOutline();
    } else {
      this.overlay.hideSelectOutline();
      this.overlay.showSelectOutlines(outlined.map((el) => el.getBoundingClientRect()));
    }
    this.placeHandles();
    this.emitSelection();
    this.persist();
    this.promoteSourceResolution(next);
  }

  /** Mints/reuses ids for the live selection, prunes the registry to it, and pushes
   * fresh snapshots to the host — the native panel's whole world view. */
  private emitSelection(): void {
    this.registry.retainSelection(this.selection);
    const snapshots = this.selection.map((el) =>
      buildElementSnapshot(el, this.registry.mint(el), this.drafts),
    );
    this.onSelection?.(snapshots);
  }

  /** Layers-row click — same selection funnel as a canvas click. */
  selectById(id: number): void {
    const el = this.registry.resolve(id);
    if (el) this.select(el);
  }

  /** Layers-row hover — drives the same hover outline the pointer does, including the
   * pointer path's rule that selected elements get no hover outline over their
   * selection chrome. */
  hoverById(id: number | null): void {
    const el = id === null ? null : this.registry.resolve(id);
    if (el && !this.selection.includes(el)) this.overlay.showOutline(el.getBoundingClientRect());
    else this.overlay.hideOutline();
  }

  /** Resize chrome follows the SELECT outline exactly — same rect, same rules. */
  private placeHandles(): void {
    const outlined = this.outlinable(this.selection);
    if (this.selection.length === 1 && outlined.length === 1) {
      this.handles.place(outlined[0].getBoundingClientRect(), outlined[0]);
    } else {
      this.handles.place(null);
    }
  }

  /** Clears all layout-ripple debounce state, including the pending quiet-window timer. */
  private clearRippleState(): void {
    if (this.rippleQuietTimer) clearTimeout(this.rippleQuietTimer);
    this.rippleQuietTimer = null;
    this.rippleSnapshots = null;
    this.lastEditAt = 0;
  }

  private remeasure(): void {
    const outlined = this.outlinable(this.selection);
    if (this.selection.length === 1) {
      if (outlined.length === 1)
        this.overlay.showSelectOutline(outlined[0].getBoundingClientRect());
      else this.overlay.hideSelectOutline();
    } else if (this.selection.length > 1) {
      this.overlay.showSelectOutlines(outlined.map((el) => el.getBoundingClientRect()));
    }
    // Handles track the same rect on every repaint — without this they'd stay pinned where
    // the element USED to be, and a drag would then resize from a stale anchor.
    this.placeHandles();
  }

  /** The selection minus its tombstones — every outline painter goes through this. */
  private outlinable(els: TaggedElement[]): TaggedElement[] {
    return els.filter((el) => this.drafts.structuralOf(el)?.kind !== "delete");
  }

  // ── Edit hooks (ripple) ──────────────────────────────────────────────────────────────

  /** Pre-hook, called immediately before drafts.apply() for every edit. */
  private handleBeforeEdit(el: TaggedElement): void {
    const now = Date.now();
    if (!this.rippleSnapshots || now - this.lastEditAt > RIPPLE_DEBOUNCE_MS) {
      this.rippleSnapshots = new Map();
    }
    // Reuse this element's in-flight snapshot while edits keep arriving within the
    // debounce window (a scrub/drag burst) — only the first edit of a burst measures.
    if (!this.rippleSnapshots.has(el)) {
      this.rippleSnapshots.set(el, snapshotRects(el));
    }
    this.lastEditAt = now;
    if (this.rippleQuietTimer) clearTimeout(this.rippleQuietTimer);
    this.rippleQuietTimer = setTimeout(() => {
      this.rippleQuietTimer = null;
      this.rippleSnapshots = null;
      this.lastEditAt = 0;
    }, RIPPLE_DEBOUNCE_MS);
  }

  /** Post-hook, called after drafts.apply() for every edit. */
  private handleEdited(): void {
    this.remeasure();
    if (this.rippleRaf) cancelAnimationFrame(this.rippleRaf);
    this.rippleRaf = requestAnimationFrame(() => {
      this.rippleRaf = 0;
      const snapshots = this.rippleSnapshots;
      if (!snapshots) return;
      const changed = new Set<TaggedElement>();
      for (const snapshot of snapshots.values()) {
        for (const moved of diffRects(snapshot)) changed.add(moved);
      }
      // Selected elements are being EDITED, not rippled.
      for (const sel of this.selection) changed.delete(sel);
      // Tombstoned elements never ripple: display:none measures 0×0-at-origin.
      for (const el of Array.from(changed)) {
        if (this.drafts.structuralOf(el)?.kind === "delete") changed.delete(el);
      }
      if (changed.size > 0)
        this.overlay.showRipples([...changed].map((moved) => moved.getBoundingClientRect()));
    });
  }

  // ── Page event handlers ──────────────────────────────────────────────────────────────

  private onMove = (e: MouseEvent): void => {
    if (this.textEdit.active) return; // hover chrome is noise while the user is typing in the page
    // Mid-drag the insertion indicator IS the feedback — a hover outline competes with it.
    if (this.moveDrag.isDragging()) return;
    this.lastMove = e;
    if (this.moveRaf) return;
    this.moveRaf = requestAnimationFrame(() => {
      this.moveRaf = 0;
      const ev = this.lastMove;
      if (!this.active || !ev || this.overlay.contains(ev.target)) return;
      const el = findSelectableElement(ev.target as Element);
      if (el && !this.selection.includes(el)) this.overlay.showOutline(el.getBoundingClientRect());
      else this.overlay.hideOutline();
      this.scheduleHoverResolve(el);
    });
  };

  private onClick = (e: MouseEvent): void => {
    if (this.overlay.contains(e.target)) return;
    // Mid-edit click policy (caret shield / commit-and-fall-through) lives in TextEditMode.
    if (this.textEdit.handleClick(e) === "shielded") return;
    e.preventDefault();
    e.stopPropagation();
    const el = findSelectableElement(e.target as Element);
    if (el && e.shiftKey) this.toggleSelection(el);
    else if (el) this.select(el);
    else this.deselect();
  };

  /** Double-click on a text-leaf element enters inline text edit (Figma behavior). */
  private onDblClick = (e: MouseEvent): void => {
    if (this.overlay.contains(e.target)) return;
    const el = this.textEdit.candidate(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    this.textEdit.begin(el);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (this.overlay.contains(e.target)) return;
    if (this.textEdit.handleKey(e)) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      // Del in an input must never nuke the selection. Carve-out: when the focused control
      // IS in the selection, the intent is deleting the element itself (PR #44 review).
      const target = e.target as Node | null;
      const deletingEditable = target !== null && this.selection.includes(target as TaggedElement);
      if (isEditable(e.target) && !deletingEditable) return;
      if (this.selection.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.deleteElements([...this.selection]);
      return;
    }
    const dir = ARROW_DIRS[e.key];
    if (dir) {
      // Arrows in an input must move the caret, never the page's elements.
      if (isEditable(e.target)) return;
      if (this.selection.length !== 1) return; // single-element structural ops in P3
      if (this.nudge(this.selection[0], dir, e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (this.selection.length > 0) this.deselect();
    else this.setActive(false);
  };

  /** THE arrow-key arbitration (ratified #2): out-of-flow nudges inset by 1px (Shift 10px);
   * an auto-layout child reorders ±1 along its parent's MAIN axis. Both branches live in
   * MoveDrag so keyboard and pointer can never disagree. */
  private nudge(el: TaggedElement, dir: "left" | "right" | "up" | "down", big: boolean): boolean {
    const step = big ? 10 : 1;
    const dx = dir === "left" ? -step : dir === "right" ? step : 0;
    const dy = dir === "up" ? -step : dir === "down" ? step : 0;
    // Free-drag routing first: an absolutely-positioned flex child is out of flow, so its
    // arrows must move it, not reshuffle siblings it no longer sits among.
    if (this.moveDrag.nudge(el, dx, dy)) return true;
    return this.moveDrag.reorderStep(el, dir);
  }

  /** The no-drop affordance for ratified #1 — written as an inline style on <html>, since
   * the overlay's shadow stylesheet cannot style the page's own <html>. */
  private savedPageCursor: string | null = null;

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.textEdit.active) return;
    if (this.overlay.containsDeep(e.composedPath()[0] ?? e.target)) return;
    const el = findSelectableElement(e.target as Element);
    if (!el || this.drafts.structuralOf(el)?.kind === "delete") return;
    // The gate IS MoveDrag's own plan, not a copy of its conditions (PR #46 review).
    if (this.moveDrag.wouldDrag(el)) return; // a real drag target — MoveDrag has it
    if (this.savedPageCursor === null) this.savedPageCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "not-allowed";
    window.addEventListener("pointerup", this.clearNoDrop, { once: true });
    window.addEventListener("pointercancel", this.clearNoDrop, { once: true });
  };

  /** Idempotent AND inert when nothing is armed — setActive(false) calls this unconditionally. */
  private clearNoDrop = (): void => {
    if (this.savedPageCursor === null) return;
    document.documentElement.style.cursor = this.savedPageCursor;
    this.savedPageCursor = null;
    window.removeEventListener("pointerup", this.clearNoDrop);
    window.removeEventListener("pointercancel", this.clearNoDrop);
  };

  /** The one delete routine. Deselect FIRST: a selection outline hugging a display:none
   * tombstone is a lie. Two-phase: every ripple baseline BEFORE any display:none write. */
  private deleteElements(els: TaggedElement[]): void {
    const fresh = els.filter((el) => this.drafts.structuralOf(el)?.kind !== "delete");
    if (fresh.length === 0) return;
    this.deselect();
    for (const el of fresh) this.handleBeforeEdit(el); // ripple baseline
    for (const el of fresh) this.drafts.applyDelete(el);
    this.handleEdited();
  }

  private onReflow = (): void => {
    if (this.reflowRaf) return;
    this.reflowRaf = requestAnimationFrame(() => {
      this.reflowRaf = 0;
      if (!this.active) return;
      this.remeasure();
      // hover position is stale after scroll/resize — hide; next mousemove redraws
      this.overlay.hideOutline();
      this.lastMove = null;
    });
  };
}
