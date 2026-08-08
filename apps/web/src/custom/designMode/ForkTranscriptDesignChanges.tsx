import { PencilRulerIcon } from "lucide-react";

import {
  CHAT_INLINE_CHIP_CLASS_NAME,
  CHAT_INLINE_CHIP_LABEL_CLASS_NAME,
} from "~/components/composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import { summarizeDesignChangeBlock } from "./designChangeTranscript";
import { useDesignSentPreviews, verifySummaryLine } from "./designSentPreviews";
import { summarizeVerifyReport } from "./protocol";

/**
 * Sent-message chips for `<design_change_request>` blocks — the transcript twin of the
 * composer's attachment pills. The raw markdown stays in the message payload (the agent
 * consumed it); the transcript shows a compact chip with the full request on hover.
 * Fenced into MessagesTimeline's UserTimelineRow.
 */
export function ForkTranscriptDesignChanges({
  blocks,
  messageCreatedAt,
}: {
  blocks: readonly string[];
  /** The message's client-minted createdAt — the same timestamp markSent recorded, which
   * is what ties a live verification record back to the message whose send it measures. */
  messageCreatedAt?: string;
}) {
  // Measured verdicts for THIS message's send, when its record is still live: after a
  // send, nobody is looking at the design panel — they are watching the agent work here.
  // The line carries counts and verdicts only, beside (never paraphrasing) the agent's own
  // reply: measurement answers "did it work", the reply answers "why not". Null once the
  // record is resolved or was never this message's — the chip quietly shows no verdict.
  const verdictLine = useDesignSentPreviews((state) => {
    if (!messageCreatedAt) return null;
    for (const record of Object.values(state.byTabId)) {
      if (
        record.sentAt === messageCreatedAt &&
        record.report &&
        record.report.elements.length > 0
      ) {
        return verifySummaryLine(summarizeVerifyReport(record.report));
      }
    }
    return null;
  });
  if (blocks.length === 0) return null;
  // Content-derived keys (occurrence-counted for identical blocks) — the list is static
  // per message, so content is the stable identity.
  const seen = new Map<string, number>();
  const entries = blocks.map((block) => {
    const occurrence = (seen.get(block) ?? 0) + 1;
    seen.set(block, occurrence);
    return { block, key: `${occurrence}:${block.length}:${block.slice(0, 32)}` };
  });
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-fork-transcript-design-changes>
      {entries.map(({ block, key }) => {
        const summary = summarizeDesignChangeBlock(block);
        const label =
          summary.elementCount === 1 && summary.firstLabel
            ? summary.firstLabel
            : `${summary.elementCount} elements`;
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <span className={cn(CHAT_INLINE_CHIP_CLASS_NAME)}>
                  <PencilRulerIcon className="size-3.5 shrink-0 opacity-85" />
                  <span className="select-none text-[10px] font-normal text-muted-foreground">
                    Design change
                  </span>
                  <span className={CHAT_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
                </span>
              }
            />
            <TooltipPopup className="max-w-96 whitespace-pre-wrap font-mono text-[11px]">
              {block.slice(0, 600)}
              {block.length > 600 ? "…" : ""}
            </TooltipPopup>
          </Tooltip>
        );
      })}
      {verdictLine ? (
        <span
          className="select-none self-center text-[10px] text-muted-foreground"
          data-fork-design-verdict-line
        >
          {verdictLine}
        </span>
      ) : null}
    </div>
  );
}
