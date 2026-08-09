/**
 * The engine's one observe-then-settle primitive — a MutationObserver whose callback runs
 * once per quiet window instead of once per mutation. Extracted because layersSession.ts
 * and verifySession.ts each need exactly this shape and a hand-copy of an observer +
 * trailing debounce is the drift the vendored lifecycle already paid for once (see
 * lifecycle.ts's opsIdentical note). The change-gating that usually follows (JSON compare
 * before emitting) stays with each session — it gates payloads, not settles.
 */

/** Quiet-window for settle-driven work — HMR re-renders land as bursts (the Forge's own
 * LayersTree REFRESH_DEBOUNCE_MS rationale). One constant, two consumers, no re-typing. */
export const SETTLE_DEBOUNCE_MS = 250;

interface SettleObserverOpts {
  readonly target: () => Node;
  readonly observe: MutationObserverInit;
  /** Fires once per quiet window. */
  readonly onSettle: () => void;
  /** A page that never goes quiet (ticking clock, streaming log, rAF style writer) must
   * not starve the settle forever — after this long of continuous churn the settle fires
   * anyway and the window restarts. Omit for pure-debounce behavior. */
  readonly maxWaitMs?: number;
}

export class SettleObserver {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When the current churn window opened — the max-wait clock. */
  private windowStart: number | null = null;

  constructor(private readonly opts: SettleObserverOpts) {}

  get active(): boolean {
    return this.observer !== null;
  }

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(this.opts.target(), this.opts.observe);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.windowStart = null;
  }

  /** Detaches while the caller mutates the page itself (a measurement pass writing inline
   * styles must not observe its own writes — disconnect also discards queued records, so
   * resume() is race-free). No-op when not started. */
  suspend(): void {
    this.observer?.disconnect();
  }

  resume(): void {
    this.observer?.observe(this.opts.target(), this.opts.observe);
  }

  private schedule = (): void => {
    const now = Date.now();
    this.windowStart ??= now;
    if (this.opts.maxWaitMs !== undefined && now - this.windowStart >= this.opts.maxWaitMs) {
      this.fire();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), SETTLE_DEBOUNCE_MS);
  };

  private fire(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.windowStart = null;
    this.opts.onSettle();
  }
}
