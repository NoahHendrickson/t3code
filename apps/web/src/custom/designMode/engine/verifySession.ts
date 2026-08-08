import {
  verdictFor,
  type DesignVerifyCheck,
  type DesignVerifyElementReport,
  type DesignVerifyReport,
} from "../protocol";
import type { DraftStore } from "./vendor/drafts";
import type { LifecycleSession } from "./vendor/lifecycle";
import { resolveElement } from "./vendor/lifecycle-store";
import { COLLAPSE, KEYWORD_PASSTHROUGH } from "./vendor/request";
import { basename, type TaggedElement } from "./vendor/source";

/** Quiet-window for re-measurement — the agent's edit lands as an HMR burst or a reload,
 * and a measurement taken mid-burst is noise (same rationale and value as layersSession's
 * LAYERS_DEBOUNCE_MS). */
const VERIFY_SETTLE_MS = 250;

interface VerifySessionOpts {
  readonly drafts: DraftStore;
  readonly lifecycle: LifecycleSession;
  /** The viewport the sent request was drafted at; null when nothing was sent (or the
   * snapshot predates viewport recording). */
  readonly sentViewport: () => { width: number; height: number } | null;
  /** Overlay containment — our own selection chrome mutates constantly and must not
   * count as page activity. */
  readonly ignores: (target: Node | null) => boolean;
  readonly onVerdict: (report: DesignVerifyReport) => void;
}

/**
 * Measures the page against the sent ledger — the delivery-side half the fork deliberately
 * did not vendor from the Forge, rebuilt on T3's own trigger: the host arms this after the
 * turn that carried a send has settled, instead of the Forge's queue/apply polling loop.
 *
 * The one rule everything here serves: do not read the agent's code, its diff, or its
 * summary — measure the page. Every sent change is a claim about a computed value; with
 * our own previews suppressed, the page either produces the asked-for value or it does
 * not. Verification checks outcome, not craft: it can never say the edit was GOOD (a
 * hardcoded value produces the right pixels too — that is the turn diff's question).
 *
 * While armed, a MutationObserver re-measures after every quiet window, change-gated, so
 * a reload that arrives late corrects a wrong verdict instead of freezing it. Suppression
 * is NOT the compare toggle: compare writes the draft's recorded original back, which
 * pins a stale value whenever the page authored its own inline style — verification
 * removes our declaration and reads what the current cascade produces, then restores the
 * exact inline value it found (whatever compare state painted it).
 */
export class VerifySession {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastJson = "";

  constructor(private readonly opts: VerifySessionOpts) {}

  /** Arms live verification: one measurement immediately (a page that is already quiet
   * never mutates again), then one per settle. Idempotent while armed. */
  arm(): void {
    if (!this.observer) {
      // documentElement, not body: a CSS-file HMR swaps <style> text in <head>, and that
      // is exactly the mutation a verification exists to catch. Our own chrome (the
      // overlay host, also outside body) is filtered per record instead.
      this.observer = new MutationObserver(this.schedule);
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    this.measureAndEmit();
  }

  disarm(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastJson = "";
  }

  get armed(): boolean {
    return this.observer !== null;
  }

  /**
   * Commits every check the current measurement verifies as applied: the draft comes off
   * WITHOUT restoring the original — the code owns the value now — via the targeted
   * DraftStore.commit the Forge built for exactly this caller. Committed properties are
   * pruned from the ledger (mutating the shared seed, the ledger's own healing idiom), an
   * element left with nothing sent leaves it, and an emptied ledger disarms. Returns the
   * number of committed draft properties.
   *
   * Measures fresh at call time — the last emitted report is a display artifact, and the
   * page may have changed since the user read it.
   */
  commitVerified(): number {
    const report = this.measure();
    if (!report) return 0;
    let committed = 0;
    const records = this.opts.lifecycle.records();
    for (const [elementIndex, elementReport] of report.elements.entries()) {
      const record = records[elementIndex];
      if (!record || elementReport.missing) continue;
      const el = resolveElement(record.seed.el, record.seed.dcSource, record.seed.index);
      if (!el) continue;
      const appliedProperties = new Set(
        elementReport.checks
          .filter((check) => check.verdict === "applied")
          .map((check) => check.property),
      );
      if (appliedProperties.size === 0) continue;
      // Report properties are the request's collapsed names; commit targets the
      // DraftStore's own keys — expand through the same table the builder collapsed with.
      const draftKeys = record.seed.draftProps.filter((key) =>
        [...appliedProperties].some((property) => {
          if (property === key) return true;
          const entry = COLLAPSE.find((candidate) => candidate.into === property);
          return entry ? entry.parts.includes(key) : false;
        }),
      );
      if (draftKeys.length === 0) continue;
      this.opts.drafts.commit(el, draftKeys);
      committed += draftKeys.length;
      record.seed.draftProps = record.seed.draftProps.filter((key) => !draftKeys.includes(key));
      record.seed.change.changes = record.seed.change.changes.filter(
        (change) => !appliedProperties.has(change.property),
      );
      if (record.seed.change.changes.length === 0 && !record.seed.change.ops?.length) {
        this.opts.lifecycle.removeSeed(record.seed);
      }
    }
    if (this.opts.lifecycle.records().length === 0) this.disarm();
    this.measureAndEmit();
    return committed;
  }

  /** One quiet window after the last un-ignored mutation, then re-measure. */
  private schedule = (mutations: MutationRecord[]): void => {
    if (mutations.every((mutation) => this.opts.ignores(mutation.target))) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.measureAndEmit();
    }, VERIFY_SETTLE_MS);
  };

  /** Change-gated emit — settles that leave the verdicts identical cost one JSON compare,
   * not a bridge message. Runs even when disarmed mid-window? No: disarm clears the timer,
   * and commitVerified's own final emit is the one deliberate post-disarm report. */
  measureAndEmit(): void {
    const report = this.measure() ?? { requestId: "", viewportChanged: false, elements: [] };
    const json = JSON.stringify(report);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.opts.onVerdict(report);
  }

  /** The suppress → measure → restore pass. One pass over EVERY css draft on EVERY drafted
   * element — suppressing one property while a parent's drafted `display: flex` stays
   * painted gives wrong readings — so the whole thing costs one forced style recalc.
   * Structural previews stay painted (phase 1 has no oracle for them; their css side
   * effects are the page's real state either way). Null when the ledger is empty. */
  private measure(): DesignVerifyReport | null {
    this.opts.lifecycle.healPlaceholders();
    const records = this.opts.lifecycle.records();
    if (records.length === 0) return null;
    const requestId = this.opts.lifecycle.pendingIds()[0] ?? "";
    const sentViewport = this.opts.sentViewport();
    const viewportChanged =
      sentViewport !== null &&
      (sentViewport.width !== window.innerWidth || sentViewport.height !== window.innerHeight);

    // The observer must not see our own suppress/restore writes — disconnecting also
    // discards any queued records for them (spec'd), so reconnect after is race-free.
    const wasArmed = this.observer !== null;
    this.observer?.disconnect();
    const suppressed: Array<{
      el: TaggedElement;
      prop: string;
      value: string;
      priority: string;
    }> = [];
    const transitions: Array<{ el: TaggedElement; value: string }> = [];
    try {
      if (!viewportChanged) {
        for (const [el, props] of this.opts.drafts.entries()) {
          if (!el.isConnected) continue;
          // Transitions off across the window, as the request builder does — a
          // mid-transition read must not be mistaken for a difference.
          transitions.push({ el, value: el.style.getPropertyValue("transition") });
          el.style.setProperty("transition", "none");
          for (const prop of props.keys()) {
            suppressed.push({
              el,
              prop,
              // The exact painted inline value, NOT the draft's recorded value: while
              // comparing, the inline slot holds the original, and restore must put back
              // precisely what was there.
              value: el.style.getPropertyValue(prop),
              priority: el.style.getPropertyPriority(prop),
            });
            el.style.removeProperty(prop);
          }
        }
      }

      const elements: DesignVerifyElementReport[] = records.map(({ seed }) => {
        const el = resolveElement(seed.el, seed.dcSource, seed.index);
        const sourceLabel = seed.change.source
          ? `${basename(seed.change.source.file)}:${seed.change.source.line}`
          : null;
        if (!el) {
          return {
            tag: seed.change.tag,
            sourceLabel,
            missing: true,
            checks: [],
            structuralOps: seed.change.ops?.length ?? 0,
          };
        }
        const computed = viewportChanged ? null : getComputedStyle(el);
        const checks: DesignVerifyCheck[] = seed.change.changes.map((change) => {
          const intentShaped =
            change.intent !== undefined || KEYWORD_PASSTHROUGH.has(change.afterCss.toLowerCase());
          // The sent property may be a collapsed shorthand (padding-inline); Chromium
          // serializes those from the longhands, uniform values matching the sent form
          // exactly and mixed ones reading as an honest multi-value `diverged` actual.
          const measured = computed?.getPropertyValue(change.property) ?? "";
          return {
            property: change.property,
            expected: change.afterCss,
            ...verdictFor({
              beforeCss: change.beforeCss,
              afterCss: change.afterCss,
              intentShaped,
              viewportChanged,
              measured,
            }),
          };
        });
        return {
          tag: seed.change.tag,
          sourceLabel,
          missing: false,
          checks,
          structuralOps: seed.change.ops?.length ?? 0,
        };
      });

      return { requestId, viewportChanged, elements };
    } finally {
      for (const { el, prop, value, priority } of suppressed) {
        if (value !== "") el.style.setProperty(prop, value, priority);
      }
      for (const { el, value } of transitions) {
        if (value !== "") el.style.setProperty("transition", value);
        else el.style.removeProperty("transition");
      }
      if (wasArmed && this.observer) {
        // disconnect() above cleared the subscription; re-observe with the same options.
        this.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      }
    }
  }
}
