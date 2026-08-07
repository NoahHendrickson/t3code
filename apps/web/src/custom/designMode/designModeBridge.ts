import {
  DESIGN_MODE_GLOBAL,
  DESIGN_MODE_PROTOCOL_VERSION,
  parseDesignChangeRequestPayload,
  type DesignChangeRequestPayload,
  type DesignModeAlignAxis,
  type DesignModeAlignValue,
  type DesignModeCanvasCommand,
  type DesignModeSelectMode,
  type DesignModeSizeMode,
  type DesignModeWritableKey,
} from "./protocol";

/** The subset of Electron's webview element the design-mode host drives. Same shape the
 * upstream automation host declares locally (PreviewAutomationHosts.tsx). */
export interface DesignModeWebview extends Element {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

/** Last webview seen for a tab id, held WEAKLY. Every command below resolves its target
 * through findPreviewWebview, so an uncached lookup means a document-wide querySelectorAll
 * per scrub frame; the element itself changes only when the preview pane remounts. Weak
 * because nothing ever looks up a CLOSED tab: a strong entry would pin one detached webview
 * subtree per tab the session ever opened for the life of the renderer, and no component
 * cleanup reliably covers every writer — an async canvas continuation can re-cache after a
 * cleanup already ran (PR #63 review). A dead ref simply misses and evicts. */
const webviewByTabId = new Map<string, WeakRef<DesignModeWebview>>();

export const findPreviewWebview = (runtimeTabId: string): DesignModeWebview | null => {
  // Revalidated, not trusted: a remounted pane leaves the old element detached, and a tab id
  // could in principle be reused by a different one.
  const cached = webviewByTabId.get(runtimeTabId)?.deref();
  if (cached?.isConnected && cached.getAttribute("data-preview-tab") === runtimeTabId) {
    return cached;
  }
  const found =
    Array.from(document.querySelectorAll<DesignModeWebview>("webview[data-preview-tab]")).find(
      (candidate) => candidate.getAttribute("data-preview-tab") === runtimeTabId,
    ) ?? null;
  if (found) webviewByTabId.set(runtimeTabId, new WeakRef(found));
  else webviewByTabId.delete(runtimeTabId);
  return found;
};

/** Last hover id pushed to each tab's guest, so identical repeats never cross the boundary
 * (see `hoverElement`). Reset by the engine-lifecycle verbs below, since a rebuilt engine
 * starts with no hover outline and no memory of one; the ordinary staleness path is already
 * closed by the rail sending `null` on mouseleave. */
const lastHoverByTabId = new Map<string, number | null>();

/** Builds the executeJavaScript expression for one guest-handle call. Arguments are
 * JSON-encoded — the whole command surface is JSON-serializable by contract
 * (protocol.ts `DesignModeGuestHandle`). */
const handleCall = (member: string, args: readonly unknown[]): string =>
  `globalThis.${DESIGN_MODE_GLOBAL}?.${member}(${args.map((a) => JSON.stringify(a)).join(",")})`;

const fireNow = (runtimeTabId: string, member: string, args: readonly unknown[]): void => {
  const webview = findPreviewWebview(runtimeTabId);
  void webview?.executeJavaScript(handleCall(member, args), false).catch(() => undefined);
};

/** Continuous-gesture coalescing. A label scrub or a held arrow key commits on every
 * pointermove/repeat tick, and each tick used to become its own JSON-serialize +
 * executeJavaScript crossing into the guest. The guest already coalesces repaints to rAF,
 * so within one host frame only the newest value of a gesture can ever be seen — queue at
 * most one pending call per (tab, member, target) and flush on the next animation frame.
 * Order across commands is preserved by flushing the queue synchronously ahead of every
 * non-coalesced command (`fire`) and ahead of `buildSend`: a revert or send issued right
 * after a scrub tick must observe that tick, never overtake it. A pending frame stranded
 * by a hidden window flushes the same way, on whatever command comes next. */
interface PendingCall {
  readonly runtimeTabId: string;
  readonly member: string;
  args: readonly unknown[];
}
/** Keyed by `tab|member|target`; Map iteration is insertion-ordered, which is the flush
 * order — first-seen order across targets, newest args within one. */
const pending = new Map<string, PendingCall>();
let pendingFrame: number | null = null;

const flushPending = (): void => {
  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }
  if (pending.size === 0) return;
  const calls = [...pending.values()];
  pending.clear();
  for (const call of calls) fireNow(call.runtimeTabId, call.member, call.args);
};

const fireCoalesced = (
  runtimeTabId: string,
  member: string,
  target: string,
  args: readonly unknown[],
): void => {
  const key = `${runtimeTabId}|${member}|${target}`;
  const existing = pending.get(key);
  if (existing) existing.args = args;
  else pending.set(key, { runtimeTabId, member, args });
  pendingFrame ??= requestAnimationFrame(() => {
    pendingFrame = null;
    flushPending();
  });
};

const fire = (runtimeTabId: string, member: string, args: readonly unknown[]): void => {
  flushPending();
  fireNow(runtimeTabId, member, args);
};

/**
 * Host → guest command surface. Everything except `buildSend` is fire-and-forget: draft
 * writes are latency-tolerant (the guest coalesces repaints to rAF) and a lost call is
 * self-healing on the next edit. The two scrub-driven writes (`applyDraft`, `setInset`)
 * additionally coalesce host-side to one crossing per animation frame; every other command
 * flushes them first, so observable order is unchanged. `buildSend`'s return value rides
 * the executeJavaScript promise back.
 */
export const designModeBridge = {
  setActive(runtimeTabId: string, on: boolean): void {
    lastHoverByTabId.delete(runtimeTabId);
    fire(runtimeTabId, "setActive", [on]);
  },
  applyDraft(
    runtimeTabId: string,
    ids: readonly number[],
    property: DesignModeWritableKey,
    value: string,
  ): void {
    fireCoalesced(runtimeTabId, "applyDraft", `${property} ${ids.join()}`, [ids, property, value]);
  },
  setSizeMode(
    runtimeTabId: string,
    ids: readonly number[],
    axis: "width" | "height",
    mode: DesignModeSizeMode,
  ): void {
    fire(runtimeTabId, "setSizeMode", [ids, axis, mode]);
  },
  setAbsolute(runtimeTabId: string, ids: readonly number[], on: boolean): void {
    fire(runtimeTabId, "setAbsolute", [ids, on]);
  },
  setInset(runtimeTabId: string, ids: readonly number[], axis: "x" | "y", px: number): void {
    fireCoalesced(runtimeTabId, "setInset", `${axis} ${ids.join()}`, [ids, axis, px]);
  },
  alignSelection(
    runtimeTabId: string,
    ids: readonly number[],
    axis: DesignModeAlignAxis,
    value: DesignModeAlignValue,
  ): void {
    fire(runtimeTabId, "alignSelection", [ids, axis, value]);
  },
  setAspectLock(runtimeTabId: string, ids: readonly number[], on: boolean): void {
    fire(runtimeTabId, "setAspectLock", [ids, on]);
  },
  revertDraft(runtimeTabId: string, ids: readonly number[], properties: readonly string[]): void {
    fire(runtimeTabId, "revertDraft", [ids, properties]);
  },
  discardAll(runtimeTabId: string): void {
    fire(runtimeTabId, "discardAll", []);
  },
  compareAll(runtimeTabId: string, on: boolean): void {
    fire(runtimeTabId, "compareAll", [on]);
  },
  /** Resolves to the parsed payload, null when there is nothing to send (the guest's own
   * "every draft is a no-op" answer, or no reachable webview/handle), or "stale-engine"
   * when the guest returned a payload the current parser rejects — a live engine older
   * than the host (dev HMR while the tool stayed on). boot()'s version check only runs at
   * the next injection, never on this path, so the caller must surface the skew instead
   * of reporting an empty send (PR #63 review). */
  async buildSend(
    runtimeTabId: string,
  ): Promise<DesignChangeRequestPayload | "stale-engine" | null> {
    flushPending();
    const webview = findPreviewWebview(runtimeTabId);
    if (!webview) return null;
    const result = await webview
      .executeJavaScript(handleCall("buildSend", []), false)
      .catch(() => null);
    if (result == null) return null;
    return parseDesignChangeRequestPayload(result) ?? "stale-engine";
  },
  /** Whether a live guest engine speaking THIS host's protocol version is installed on the
   * page — the remount reconcile's probe (ForkPreviewDesignMode). Cheap enough to ask on
   * every attach: one property read across the boundary, no bundle transfer. Null covers both
   * "no engine" and an unreadable answer; the caller re-injects either way, which is
   * idempotent by boot()'s contract. */
  async engineVersion(runtimeTabId: string): Promise<number | null> {
    const webview = findPreviewWebview(runtimeTabId);
    if (!webview) return null;
    const result = await webview
      .executeJavaScript(`globalThis.${DESIGN_MODE_GLOBAL}?.version ?? null`, false)
      .catch(() => null);
    return typeof result === "number" ? result : null;
  },
  /** True when the engine on the page is one this host can drive without re-injecting. */
  async engineIsCurrent(runtimeTabId: string): Promise<boolean> {
    return (await this.engineVersion(runtimeTabId)) === DESIGN_MODE_PROTOCOL_VERSION;
  },
  selectElement(runtimeTabId: string, id: number, mode: DesignModeSelectMode = "replace"): void {
    fire(runtimeTabId, "selectElement", [id, mode]);
  },
  /** Deduped against the last hover sent for this tab. `mouseover` bubbles, so the layers
   * rail's delegated handler fires two to four times per row crossed (row → caret → glyph →
   * label) and every one of those used to be its own executeJavaScript crossing plus a
   * getBoundingClientRect in the guest — a pointer sweep down the rail cost a hundred round
   * trips to paint one outline. Hover is idempotent, so repeats carry no information. */
  hoverElement(runtimeTabId: string, id: number | null): void {
    if (lastHoverByTabId.get(runtimeTabId) === id) return;
    lastHoverByTabId.set(runtimeTabId, id);
    fire(runtimeTabId, "hoverElement", [id]);
  },
  reorderElement(runtimeTabId: string, id: number, beforeId: number | null): void {
    fire(runtimeTabId, "reorderElement", [id, beforeId]);
  },
  setCanvas(runtimeTabId: string, on: boolean): void {
    fire(runtimeTabId, "setCanvas", [on]);
  },
  canvasCommand(runtimeTabId: string, action: DesignModeCanvasCommand): void {
    fire(runtimeTabId, "canvasCommand", [action]);
  },
  destroy(runtimeTabId: string): void {
    lastHoverByTabId.delete(runtimeTabId);
    fire(runtimeTabId, "destroy", []);
  },
  /** Drops this tab's host-side bridge memo. The tab is gone (its webview closed), so the
   * hover memo has nothing left to describe — see desktopTabLifetime's fenced cleanup. */
  forgetTab(runtimeTabId: string): void {
    lastHoverByTabId.delete(runtimeTabId);
    webviewByTabId.delete(runtimeTabId);
  },
};
