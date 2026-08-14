import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useRef } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useThreadSession } from "~/state/entities";
import { environmentThreadDetails } from "~/state/threads";

import { designModeBridge } from "../designModeBridge";
import {
  VERIFY_REASON_LABELS,
  VERIFY_VERDICT_LABELS,
  isMeasuredContradiction,
  selectSentPreview,
  shouldOfferPreviewResolution,
  useDesignSentPreviews,
  verifySummaryLine,
} from "../designSentPreviews";
import { designUndoHistory } from "../designUndoHistory";
import { summarizeVerifyReport, type DesignVerifyElementReport } from "../protocol";

/** One disclosure row, precomputed outside JSX (content-derived key, occurrence-counted
 * for identical rows — the transcript chip's idiom). */
interface ResolutionRow {
  readonly key: string;
  readonly element: DesignVerifyElementReport;
}

function occurrenceKeyed(elements: readonly DesignVerifyElementReport[]): ResolutionRow[] {
  const seen = new Map<string, number>();
  return elements.map((element) => {
    const base = `${element.tag}|${element.sourceLabel ?? ""}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { key: `${base}#${occurrence}`, element };
  });
}

/**
 * Resolving previews that have already been sent — the design panel footer's block.
 *
 * A sent request leaves its drafts painted over whatever the agent then changed, and the
 * inline styles win — so the page stops being evidence of anything until they come off.
 * Once the turn that carried the send settles, this component turns the guest's verifier
 * on: the page is measured with the previews suppressed and every sent property gets a
 * verdict, re-measured per page settle so a late reload corrects a wrong verdict. The
 * copy renders MEASUREMENTS in the one shared vocabulary (VERIFY_VERDICT_LABELS), never
 * the agent's account.
 *
 * The block renders exactly one of three modes, chosen in that order:
 *
 * - `contradiction` — isMeasuredContradiction: the page provably does not render what was
 *   asked. The verdict report, with its selective and destructive resolutions.
 * - `peek` — the drafts are suppressed and the page is showing what the code renders.
 * - `invitation` — the default: `View live changes`.
 *
 * WAITING (no measurement yet) deliberately renders as `invitation` rather than a mode of
 * its own. The invitation is true before any reading arrives — the turn is over and the
 * previews are still on top — so a fourth state would only add copy that hedges. That
 * choice is what makes the report path's `summary` non-null by construction, which is why
 * this reads the measurement as one `measured` object rather than two nullable locals.
 *
 * Leading with the invitation rather than the report is the point: for the overwhelmingly
 * common outcome — the ask landed, or was never measurable in the first place — a report
 * full of hedged verdicts reads as an alarm about work that is fine, which is the exact
 * opposite of this feature's job. Seeing the real page is better evidence than any verdict
 * line anyway.
 *
 * Looking is a peek, not a resolution: it drives the panel's compare mode, which suppresses
 * the drafts without destroying them, so a request the agent missed can still be re-sent
 * from the drafts the user already made. While the block offers, LEAVING compare is the
 * answer to the question by whatever route it happens — this block's own button, the
 * footer's Before/After, or the mutation gate's leave-compare rule when the user starts
 * editing again — so the invitation can never reappear over a page already looked at. That
 * rule lives in one effect below rather than on each button, because two of those three
 * routes are not this component's to intercept.
 *
 * The verification switch is symmetric and effect-owned: mounted-and-offering turns it
 * on, and the cleanup — unmount, resolution, thread switch — turns it off, so the guest
 * never keeps measuring for a question nobody is looking at. A page reload while offering
 * re-arms guest-side from the persisted ledger; a turn that ran while this was unmounted
 * gets measured on remount.
 *
 * A child component rather than panel state on purpose: its subscriptions — the thread's
 * session and projected latest turn — churn hardest exactly while a turn runs, and here
 * they re-render this one footer block instead of the whole panel. Mounted below the
 * panel's `!tab.enabled` bail, so with design mode off nothing subscribes at all.
 */
export function SentPreviewResolution({
  runtimeTabId,
  threadRef,
  draftCount,
  comparing,
  onSetComparing,
  onDiscard,
}: {
  runtimeTabId: string;
  threadRef: ScopedThreadRef;
  draftCount: number;
  /** Panel-owned compare state: true means the drafts are suppressed and the page is
   * showing what the code actually renders. */
  comparing: boolean;
  onSetComparing: (next: boolean) => void;
  onDiscard: () => void;
}) {
  const record = useDesignSentPreviews((state) => selectSentPreview(state.byTabId, runtimeTabId));
  const session = useThreadSession(threadRef);
  const latestTurn = useAtomValue(environmentThreadDetails.latestTurnAtom(threadRef));
  const threadKey = scopedThreadKey(threadRef);

  const offer = shouldOfferPreviewResolution({
    record,
    threadKey,
    latestTurn,
    session,
    draftCount,
  });

  useEffect(() => {
    if (!offer) return;
    designModeBridge.setVerifying(runtimeTabId, true);
    return () => designModeBridge.setVerifying(runtimeTabId, false);
  }, [offer, runtimeTabId]);

  /**
   * THE peek exit, for every route out of compare. Once the user has looked at the live
   * page, coming back is the answer — so the record is forgotten no matter which control
   * did it: this block's Show previews, the footer's Before/After, or the mutation gate
   * leaving compare because the user started editing again. Without this the invitation
   * reappeared over a page the user had already inspected.
   *
   * Tracked with a ref rather than derived state because the transition (not the value) is
   * the event, and it must not fire for a block that never entered the peek at all. Reset
   * whenever the block stops offering, so a later send starts clean.
   */
  const peeked = useRef(false);
  useEffect(() => {
    if (!offer) {
      peeked.current = false;
      return;
    }
    if (comparing) {
      peeked.current = true;
      return;
    }
    if (!peeked.current) return;
    peeked.current = false;
    useDesignSentPreviews.getState().forget(runtimeTabId);
  }, [offer, comparing, runtimeTabId]);

  /** Suppress the drafts so the page shows what the code renders. Deliberately does NOT
   * resolve the record: this is the peek, and the answer comes after looking. */
  const onViewLive = useCallback(() => {
    onSetComparing(true);
  }, [onSetComparing]);

  /** Back to the drafts. Leaving compare is itself the answer (see the peek-exit effect),
   * so this does not forget the record a second time. */
  const onRestorePreviews = useCallback(() => {
    onSetComparing(false);
  }, [onSetComparing]);

  /** The report's "I'll keep them" exit. Restores the page first: a late contradiction can
   * arrive mid-peek and swap this block from peek to report, and answering "keep previews"
   * while the previews are still suppressed would leave the page contradicting the button
   * that was just pressed. */
  const onKeep = useCallback(() => {
    onSetComparing(false);
    useDesignSentPreviews.getState().forget(runtimeTabId);
  }, [onSetComparing, runtimeTabId]);

  const onDropVerified = useCallback(() => {
    // Commit is a mutation the undo history cannot reverse — same clear-first rule as
    // every other unrecorded verb (designUndoHistory's own contract).
    designUndoHistory.clear(runtimeTabId);
    void designModeBridge.commitVerified(runtimeTabId).then((committed) => {
      // The guest re-measured at commit time by design; the page can have changed between
      // render and click, and a silent nothing-happened is worse than saying so.
      if (committed === null || committed === 0) {
        toastManager.add({
          type: "info",
          title: "Nothing dropped",
          description: "The page changed since the last check — the report has been refreshed.",
        });
      }
    });
  }, [runtimeTabId]);

  if (!offer) return null;

  /** The measurement, or null while nothing has been read yet — one object so the report
   * path cannot end up with a summary the compiler thinks might be missing. */
  const report = record?.report ?? null;
  const measured =
    report && report.elements.length > 0
      ? { report, summary: summarizeVerifyReport(report) }
      : null;

  if (measured === null || !isMeasuredContradiction(measured.summary)) {
    /** Only the landed count survives into the invitation: the selective drop stays
     * reachable for a mixed report (applied beside unverifiable) instead of leaving the
     * user a choice between restoring everything and discarding everything. */
    const landed = measured?.summary.applied ?? 0;
    return (
      <Alert variant="success" className="rounded-md px-2.5 py-2" data-fork-design-resolve-previews>
        <AlertTitle className="text-[11px] leading-relaxed">
          {comparing
            ? "Showing the live page — your previews are hidden."
            : "The agent finished this turn."}
        </AlertTitle>
        {comparing ? (
          /* The peek's exits. The discard's blast radius is stated beside the button that
             has it, on this path as on every other — a user who kept editing after the
             send must read it. */
          <AlertDescription className="gap-1.5 text-[11px] leading-relaxed">
            <p>Discarding clears every edit on this tab — including any made after the send.</p>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="secondary" size="xs" onClick={onRestorePreviews} type="button">
                Show previews
              </Button>
              {landed > 0 ? (
                <Button variant="ghost" size="xs" onClick={onDropVerified} type="button">
                  Drop {VERIFY_VERDICT_LABELS.applied} previews ({landed})
                </Button>
              ) : null}
              <Button variant="ghost" size="xs" onClick={onDiscard} type="button">
                Discard previews
              </Button>
            </div>
          </AlertDescription>
        ) : (
          <AlertAction>
            <Button variant="secondary" size="xs" onClick={onViewLive} type="button">
              View live changes
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  }

  /* Contradiction: the measurement exists by construction (isMeasuredContradiction is
     false for null), and its line is non-empty because at least one verdict is counted. */
  const { report: measuredReport, summary } = measured;
  const rows = occurrenceKeyed(measuredReport.elements);

  return (
    <div
      className="space-y-1.5 rounded-md bg-[var(--fork-design-field)] px-2.5 py-2"
      data-fork-design-resolve-previews
    >
      {/* Counts and verdicts only — measurements of the page, never a paraphrase of
          the agent's reply (the two must read as separate kinds of evidence). */}
      <p className="text-[11px] leading-relaxed text-foreground">
        {verifySummaryLine(summary)}
        {measuredReport.viewportChanged
          ? ` — ${VERIFY_REASON_LABELS.viewport}, so differing values can't be judged`
          : ""}
        {measuredReport.truncated ? " (report truncated)" : ""}
      </p>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Each change</summary>
        <ul className="mt-1 space-y-0.5">
          {rows.map(({ key, element }) => (
            <li key={key}>
              <span className="font-mono">
                {element.tag}
                {element.sourceLabel ? ` · ${element.sourceLabel}` : ""}
              </span>
              {element.missing ? (
                <span> — {VERIFY_VERDICT_LABELS.missing}</span>
              ) : (
                <ul className="ml-3">
                  {element.checks.map((check) => (
                    <li key={check.property}>
                      {check.property}: {VERIFY_VERDICT_LABELS[check.verdict]}
                      {check.verdict === "diverged" && check.actual !== null
                        ? ` (asked ${check.expected}, page shows ${check.actual})`
                        : ""}
                      {check.verdict === "unverifiable" && check.reason
                        ? ` (${VERIFY_REASON_LABELS[check.reason]})`
                        : ""}
                    </li>
                  ))}
                  {element.structuralOps > 0 ? (
                    <li>
                      {element.structuralOps === 1
                        ? "1 structural change"
                        : `${element.structuralOps} structural changes`}
                      : {VERIFY_VERDICT_LABELS.unverifiable}
                    </li>
                  ) : null}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </details>
      {/* The blast radius is stated on EVERY path — a user who kept editing after the send
          must read it beside counts that describe only the sent changes. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Discarding clears every edit on this tab — including any made after the send.
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {/* Disabled rather than unmounted at zero: the report re-emits per page settle,
            and a button popping into a flex row slides the destructive one under an
            in-flight click. */}
        <Button
          variant="secondary"
          size="xs"
          onClick={onDropVerified}
          disabled={summary.applied === 0}
          type="button"
        >
          Drop {VERIFY_VERDICT_LABELS.applied} previews
          {summary.applied > 0 ? ` (${summary.applied})` : ""}
        </Button>
        <Button variant="ghost" size="xs" onClick={onDiscard} type="button">
          Discard all edits
        </Button>
        <Button variant="ghost" size="xs" onClick={onKeep} type="button">
          Keep previews
        </Button>
      </div>
    </div>
  );
}
