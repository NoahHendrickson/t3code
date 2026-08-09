import {
  VERIFY_REPORT_MAX_CHECKS,
  VERIFY_REPORT_MAX_ELEMENTS,
  verdictFor,
  type DesignVerifyCheck,
  type DesignVerifyElementReport,
  type DesignVerifyReport,
} from "../protocol";
import { isSynthesizedSource } from "./nativeSource";
import { SettleObserver } from "./settleGate";
import type { DraftStore } from "./vendor/drafts";
import { LifecycleSession, type SeedRecord, type SentSeed } from "./vendor/lifecycle";
import {
  locateBySourceExact,
  sourceIndex,
  type PersistedLifecycle,
  type PersistedSentElement,
} from "./vendor/lifecycle-store";
import {
  COLLAPSE,
  cssPath,
  measureComputed,
  withTransitionsSuppressed,
  type ElementChange,
} from "./vendor/request";
import type { TaggedElement } from "./vendor/source";
import { basename } from "./vendor/source";

/** A page that never goes quiet (ticking clock, streaming log) must still re-measure —
 * after this much continuous churn the settle fires anyway. */
const VERIFY_MAX_WAIT_MS = 2_000;

/** Keywords whose COMPUTED resolution inverts the intent — `auto` resolves to a px, so an
 * exact-match verdict would judge the wrong thing. Deliberately much narrower than the
 * builder's KEYWORD_PASSTHROUGH: that set also carries enumerated keywords (`center`,
 * `flex`, `solid`, …) which getComputedStyle returns verbatim and which are therefore
 * exactly verifiable — a send made of alignment tweaks must be able to report landed. */
const VERIFY_INTENT_KEYWORDS = new Set([
  "auto",
  "fit-content",
  "min-content",
  "max-content",
  "100%",
]);

/** A report's collapsed property name expanded back to the DraftStore keys it rode in
 * as — through the SAME table the builder collapsed with, so the two directions cannot
 * drift — intersected with what the seed actually sent. Exported pure: commitVerified's
 * credit/prune both hang off this mapping. */
export function expandCollapsedProperty(property: string, draftProps: readonly string[]): string[] {
  const entry = COLLAPSE.find((candidate) => candidate.into === property);
  const candidates = entry ? [property, ...entry.parts] : [property];
  return draftProps.filter((key) => candidates.includes(key));
}

/** Cap on the persisted sent projection — the ledger carries full ElementChange payloads,
 * and saveLifecycle's quota failure is deliberately silent, so an unbounded projection
 * could take the DRAFTS down with it (the part whose loss is unrecoverable). A ledger too
 * big to persist quietly doesn't; verification then reports missing after a reload, which
 * is honest and recoverable. */
const SENT_PERSIST_MAX_CHARS = 262_144;

interface VerifySessionOpts {
  readonly drafts: DraftStore;
  readonly onVerdict: (report: DesignVerifyReport) => void;
  /** The ledger emptied guest-side (every check committed, or the drafts discarded) — the
   * explicit resolution signal, never inferred from an empty display payload. */
  readonly onResolved: () => void;
  /** Ledger or armed-state changed — the caller persists. */
  readonly onStateDirty: () => void;
}

/** One resolved row of a measurement pass: the ledger record, the element it strictly
 * resolved to (null = missing), and the wire-shaped report. commitVerified consumes rows,
 * never re-correlating wire elements back to records by index. */
interface MeasuredRow {
  readonly record: SeedRecord;
  readonly el: TaggedElement | null;
  readonly report: DesignVerifyElementReport;
}

/**
 * Owns sent-change verification end to end: the ledger (the Forge's LifecycleSession +
 * lifecycle-store `sent` slot, dormant in this fork until this feature), the send-time
 * conditions, and the measurement loop. HeadlessDesignMode only calls the seams —
 * recordSend / restore / toPersisted / clear / setVerifying / commitVerified — the
 * canvasSession/layersSession pattern of owning a subsystem outright.
 *
 * The one rule everything here serves: do not read the agent's code, its diff, or its
 * summary — measure the page. Every sent change is a claim about a computed value; with
 * our previews suppressed, the page either produces the asked-for value or it does not.
 * Verification checks outcome, not craft: it can never say the edit was GOOD (a hardcoded
 * value produces the right pixels too — that is the turn diff's question).
 *
 * Suppression means restoring each draft's recorded ORIGINAL into the inline slot (`""`
 * removes) — the exact pre-draft state, not the compare toggle's re-write of it onto a
 * possibly-changed cascade. Properties the send-time origin probe found page-authored
 * inline are not judged at all (unverifiable 'inline'): the draft and the page share one
 * slot there, and no suppression can read the page's own value without guessing.
 *
 * While verifying, a shared SettleObserver re-measures once per quiet window (bounded by
 * a max-wait so a never-quiet page still re-measures), change-gated, so a late HMR or
 * reload corrects a wrong verdict instead of freezing it. The verifying INTENT persists
 * with the ledger — a full reload, the very event this feature waits for, resumes
 * measuring without the host re-asking.
 */
export class VerifySession {
  private readonly lifecycle = new LifecycleSession();
  private sentViewport: { width: number; height: number } | null = null;
  /** Host intent — survives stopMeasuring() (design mode off) and, via sentMeta, reload. */
  private verifying = false;
  private lastJson = "";

  private readonly settle = new SettleObserver({
    // documentElement, not body: a CSS-file HMR swaps <style> text in <head>, which is
    // exactly the mutation verification exists to catch. Attribute noise is bounded at
    // the platform level — only style/class changes can move a computed value, so aria/
    // data-state churn from headless-UI primitives never reaches JS. Overlay chrome lives
    // in a shadow root `subtree` does not descend into, so it never feeds back.
    target: () => document.documentElement,
    observe: {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      characterData: true,
    },
    onSettle: () => this.measureAndEmit(),
    maxWaitMs: VERIFY_MAX_WAIT_MS,
  });

  constructor(private readonly opts: VerifySessionOpts) {}

  get empty(): boolean {
    return this.lifecycle.records().length === 0;
  }

  // ── The ledger ─────────────────────────────────────────────────────────────────────

  /** A send happened: record what rode it, at the granularity verification needs — the
   * DraftStore's own keys (targeted commit's language) beside the request's rendered
   * changes, each element addressed source-first with the same bounded-css-path fallback
   * the drafts drain trusts. Latest-only: this send was built from the whole live draft
   * set, so it supersedes outright, and any verification of the previous send is over. */
  recordSend(
    builtElements: ReadonlyMap<TaggedElement, ElementChange>,
    viewport: { width: number; height: number },
  ): void {
    const seeds: SentSeed[] = [...builtElements.entries()].map(([el, change]) => {
      const dcSource = el.dataset?.dcSource ?? null;
      const selector = !dcSource || isSynthesizedSource(el) ? cssPath(el) : undefined;
      return {
        el,
        dcSource,
        index: dcSource ? sourceIndex(el, dcSource) : 0,
        ...(selector ? { selector } : {}),
        draftProps: [...(this.opts.drafts.entries().get(el)?.keys() ?? [])],
        change,
      };
    });
    this.setVerifying(false);
    this.lifecycle.clear();
    this.lifecycle.register(
      `send-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      seeds,
    );
    this.sentViewport = { width: viewport.width, height: viewport.height };
    this.opts.onStateDirty();
  }

  /** Rebuilds the ledger after a full reload. Elements the strict locator can't find yet
   * get detached placeholders and re-resolve per measure; a persisted verifying intent
   * resumes measuring immediately — the reload IS the event it was waiting for. */
  restore(saved: PersistedLifecycle): void {
    this.lifecycle.restoreSent(saved.sent, (pe) => this.locatePersistedSent(pe));
    this.sentViewport = saved.sentMeta?.viewport ?? null;
    if (saved.sentMeta?.verifying && !this.empty) this.setVerifying(true);
  }

  /** The persistence projection, size-capped: the ledger rides sessionStorage beside the
   * drafts, and the drafts must never lose persistence to a ledger too big to save. */
  toPersisted(): Pick<PersistedLifecycle, "sent"> & { sentMeta?: PersistedLifecycle["sentMeta"] } {
    let sent = this.lifecycle.toPersistedSent();
    if (JSON.stringify(sent).length > SENT_PERSIST_MAX_CHARS) sent = [];
    return {
      sent,
      ...(this.sentViewport
        ? {
            sentMeta: {
              viewport: this.sentViewport,
              ...(this.verifying ? { verifying: true } : {}),
            },
          }
        : {}),
    };
  }

  /** The drafts were discarded — the previews the ledger described are gone, which
   * answers the sent question outright. */
  clear(): void {
    const hadEntries = !this.empty;
    this.lifecycle.clear();
    this.sentViewport = null;
    this.setVerifying(false);
    if (hadEntries) {
      this.opts.onResolved();
      this.opts.onStateDirty();
    }
  }

  // ── The measurement loop ───────────────────────────────────────────────────────────

  /** The host-owned switch, symmetric by contract (a one-way door is a bug): on arms and
   * measures now — a page that is already quiet never mutates again — off stops the
   * observer and every bit of the work. Idempotent in both directions. */
  setVerifying(on: boolean): void {
    if (on === this.verifying) {
      if (on) this.measureAndEmit();
      return;
    }
    this.verifying = on && !this.empty;
    if (this.verifying) {
      this.settle.start();
      this.measureAndEmit();
    } else {
      this.settle.stop();
      this.lastJson = "";
    }
    this.opts.onStateDirty();
  }

  /** Design mode turned off — stop the observer but keep the INTENT: re-activation (or a
   * reload restoring `sentMeta.verifying`) resumes without the host re-asking. */
  stopMeasuring(): void {
    this.settle.stop();
  }

  /** Design mode turned back on — resume a suspended verification. */
  resumeMeasuring(): void {
    if (this.verifying && !this.empty) {
      this.settle.start();
      this.measureAndEmit();
    }
  }

  /**
   * Commits every check the CURRENT measurement verifies as applied: the draft comes off
   * WITHOUT restoring the original — the code owns the value now — via the targeted
   * DraftStore.commit built for exactly this caller. Credits only keys the DraftStore
   * actually holds for the strictly-resolved element (commit's own miss is a silent no-op,
   * and a no-op must not prune the ledger or inflate the count). An element left with only
   * structural ops stays — phase 1 has no oracle to clear it, and Keep/Discard remain its
   * exits. An emptied ledger resolves the whole question. Returns committed key count.
   */
  commitVerified(): number {
    const measured = this.measure();
    if (!measured) return 0;
    let committed = 0;
    for (const { record, el, report } of measured.rows) {
      if (!el || report.missing) continue;
      const liveDraft = this.opts.drafts.entries().get(el);
      for (const check of report.checks) {
        if (check.verdict !== "applied") continue;
        const expanded = expandCollapsedProperty(check.property, record.seed.draftProps);
        const liveKeys = expanded.filter((key) => liveDraft?.has(key));
        if (liveKeys.length > 0) {
          this.opts.drafts.commit(el, liveKeys);
          committed += liveKeys.length;
        }
        // The check resolves when nothing of it is left painted — committed just now, or
        // already gone (a per-field revert answered it before we did).
        const stillPainted = expanded.some((key) => this.opts.drafts.entries().get(el)?.has(key));
        if (!stillPainted) {
          record.seed.draftProps = record.seed.draftProps.filter((key) => !expanded.includes(key));
          record.seed.change.changes = record.seed.change.changes.filter(
            (change) => change.property !== check.property,
          );
        }
      }
      if (record.seed.change.changes.length === 0 && !record.seed.change.ops?.length) {
        this.lifecycle.removeSeed(record.seed);
      }
    }
    if (this.empty) {
      this.sentViewport = null;
      this.setVerifying(false);
      this.opts.onResolved();
    } else {
      this.emitRows(this.measure());
    }
    this.opts.onStateDirty();
    return committed;
  }

  private measureAndEmit(): void {
    this.emitRows(this.measure());
  }

  /** Change-gated emit — settles that leave the verdicts identical cost one JSON compare,
   * not a bridge message. */
  private emitRows(measured: ReturnType<VerifySession["measure"]>): void {
    if (!measured) return;
    const report: DesignVerifyReport = {
      viewportChanged: measured.viewportChanged,
      truncated: measured.truncated,
      elements: measured.rows.map((row) => row.report),
    };
    const json = JSON.stringify(report);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.opts.onVerdict(report);
  }

  /**
   * The suppress → measure → restore pass, one forced style recalc for the whole thing.
   * Every css draft on every drafted element is suppressed together — suppressing one
   * property while a parent's drafted `display: flex` stays painted gives wrong readings —
   * by writing each draft's recorded ORIGINAL into the inline slot (`""` removes). The
   * whole window rides withTransitionsSuppressed, which snapshots each element's full
   * inline cssText and restores it wholesale afterwards: exact values, priorities and
   * page-authored longhands all come back untouched, including our own suppression
   * writes. The settle observer is suspended across the pass so it never sees them.
   *
   * Element resolution is strict and happens ONCE per row (reused verbatim by
   * commitVerified): a still-connected seed element, else the exact source index — never
   * the first-match fallback, which would measure (and then commit) against a sibling —
   * else a unique css-path hit. A hit heals the seed in place, the ledger's own idiom.
   */
  private measure(): {
    rows: MeasuredRow[];
    viewportChanged: boolean;
    truncated: boolean;
  } | null {
    const records = this.lifecycle.records();
    if (records.length === 0) return null;
    const truncated =
      records.length > VERIFY_REPORT_MAX_ELEMENTS ||
      records.some(({ seed }) => seed.change.changes.length > VERIFY_REPORT_MAX_CHECKS);
    const bounded = records.slice(0, VERIFY_REPORT_MAX_ELEMENTS);
    const viewportChanged =
      this.sentViewport !== null &&
      (this.sentViewport.width !== window.innerWidth ||
        this.sentViewport.height !== window.innerHeight);

    const resolved = bounded.map((record) => {
      const el = this.resolveSeedStrict(record.seed);
      if (el) record.seed.el = el;
      return { record, el };
    });

    this.settle.suspend();
    const drafted = [...this.opts.drafts.entries().keys()].filter((el) => el.isConnected);
    const touched = new Set<TaggedElement>(drafted);
    for (const { el } of resolved) if (el) touched.add(el);
    try {
      const rows = withTransitionsSuppressed(touched, () => {
        for (const el of drafted) {
          const props = this.opts.drafts.entries().get(el);
          if (!props) continue;
          for (const [prop, draft] of props) {
            if (draft.original !== "") el.style.setProperty(prop, draft.original);
            else el.style.removeProperty(prop);
          }
        }
        return resolved.map(({ record, el }): MeasuredRow => {
          const { seed } = record;
          const sourceLabel = seed.change.source
            ? `${basename(seed.change.source.file)}:${seed.change.source.line}`
            : null;
          if (!el) {
            return {
              record,
              el,
              report: {
                tag: seed.change.tag,
                sourceLabel,
                missing: true,
                checks: [],
                structuralOps: seed.change.ops?.length ?? 0,
              },
            };
          }
          const boundedChanges = seed.change.changes.slice(0, VERIFY_REPORT_MAX_CHECKS);
          const measuredValues = measureComputed(
            el,
            boundedChanges.map((change) => change.property),
          );
          const checks: DesignVerifyCheck[] = boundedChanges.map((change) => ({
            property: change.property,
            expected: change.afterCss,
            ...verdictFor({
              beforeCss: change.beforeCss,
              afterCss: change.afterCss,
              intentShaped:
                change.intent !== undefined ||
                VERIFY_INTENT_KEYWORDS.has(change.afterCss.toLowerCase()),
              inlineAuthored: change.origin?.kind === "inline",
              viewportChanged,
              measured: measuredValues.get(change.property) ?? "",
            }),
          }));
          return {
            record,
            el,
            report: {
              tag: seed.change.tag,
              sourceLabel,
              missing: false,
              checks,
              structuralOps: seed.change.ops?.length ?? 0,
            },
          };
        });
      });
      return { rows, viewportChanged, truncated };
    } finally {
      this.settle.resume();
    }
  }

  /** Strict per-seed resolution: connected element, exact source index, or a UNIQUE
   * css-path match (a pattern that matches twice names neither). Null means missing. */
  private resolveSeedStrict(seed: SentSeed): TaggedElement | null {
    if (seed.el.isConnected) return seed.el;
    if (seed.dcSource) {
      const bySource = locateBySourceExact(seed.dcSource, seed.index);
      if (bySource) return bySource;
    }
    return this.bySelector(seed.selector);
  }

  private locatePersistedSent(pe: PersistedSentElement): TaggedElement | null {
    if (pe.dcSource) {
      const bySource = locateBySourceExact(pe.dcSource, pe.index);
      if (bySource) return bySource;
    }
    return this.bySelector(pe.selector);
  }

  private bySelector(selector: string | undefined): TaggedElement | null {
    if (!selector) return null;
    try {
      const hits = document.querySelectorAll(selector);
      if (hits.length !== 1) return null;
      const candidate = hits[0];
      return candidate instanceof HTMLElement || candidate instanceof SVGElement
        ? (candidate as TaggedElement)
        : null;
    } catch {
      return null; // a malformed persisted selector must not break a measure
    }
  }
}
