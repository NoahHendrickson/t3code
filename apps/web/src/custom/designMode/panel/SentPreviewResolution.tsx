import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useThreadSession } from "~/state/entities";
import { environmentThreadDetails } from "~/state/threads";

import { designModeBridge } from "../designModeBridge";
import {
  VERIFY_REASON_LABELS,
  VERIFY_VERDICT_LABELS,
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
 * the agent's account; an engine too old to measure keeps the unmeasured copy.
 *
 * The verification switch is symmetric and effect-owned: mounted-and-offering turns it
 * on, and the cleanup — unmount, Keep, resolution, thread switch — turns it off, so the
 * guest never keeps measuring for a question nobody is looking at. A page reload while
 * offering re-arms guest-side from the persisted ledger; a turn that ran while this was
 * unmounted gets measured on remount.
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
  onDiscard,
}: {
  runtimeTabId: string;
  threadRef: ScopedThreadRef;
  draftCount: number;
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

  const onKeep = useCallback(() => {
    useDesignSentPreviews.getState().forget(runtimeTabId);
  }, [runtimeTabId]);

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

  const report = record?.report ?? null;
  const summary = report && report.elements.length > 0 ? summarizeVerifyReport(report) : null;
  const summaryLine = summary ? verifySummaryLine(summary) : "";
  const rows = report ? occurrenceKeyed(report.elements) : [];

  return (
    <div
      className="space-y-1.5 rounded-md bg-[var(--fork-design-field)] px-2.5 py-2"
      data-fork-design-resolve-previews
    >
      {summary && summaryLine !== "" ? (
        <>
          {/* Counts and verdicts only — measurements of the page, never a paraphrase of
              the agent's reply (the two must read as separate kinds of evidence). */}
          <p className="text-[11px] leading-relaxed text-foreground">
            {summaryLine}
            {report?.viewportChanged
              ? ` — ${VERIFY_REASON_LABELS.viewport}, so differing values can't be judged`
              : ""}
            {report?.truncated ? " (report truncated)" : ""}
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
        </>
      ) : (
        /* No measurement yet (or an engine too old to measure): say only what is true —
           the previews are still on top. */
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Edits from a sent request are still previewed on top of the page, hiding whatever the
          agent changed underneath.
        </p>
      )}
      {/* The blast radius is stated on EVERY path — a user who kept editing after the send
          must read it beside counts that describe only the sent changes. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Discarding clears every edit on this tab — including any made after the send.
      </p>
      <div className="flex items-center gap-1">
        {summary ? (
          /* Disabled rather than unmounted at zero: the report re-emits per page settle,
             and a button popping into a flex row slides the destructive one under an
             in-flight click. */
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
        ) : null}
        <Button
          variant={summary ? "ghost" : "secondary"}
          size="xs"
          onClick={onDiscard}
          type="button"
        >
          Discard all edits
        </Button>
        <Button variant="ghost" size="xs" onClick={onKeep} type="button">
          Keep previews
        </Button>
      </div>
    </div>
  );
}
