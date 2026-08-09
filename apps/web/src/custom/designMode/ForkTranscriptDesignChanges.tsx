import { PencilRulerIcon } from "lucide-react";

import {
  CHAT_INLINE_CHIP_CLASS_NAME,
  CHAT_INLINE_CHIP_LABEL_CLASS_NAME,
} from "~/components/composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import { summarizeDesignChangeBlock } from "./designChangeTranscript";
import { selectVerifySummaryLineForMessage, useDesignSentPreviews } from "./designSentPreviews";

/**
 * Measured verdicts for one sent message, when any of its records are still live. Its own
 * component so the store subscription exists ONLY under a message that actually carries
 * design blocks — the timeline mounts the parent unconditionally in every user row, and a
 * selector running per store write times every visible row would be paid mostly by rows
 * that could never display it. Verdicts appear while the preview pane (and its panel) is
 * measuring; a user watching the agent from Diff or Terminal gets the line as soon as
 * they look back at the preview and measurement catches up.
 *
 * The line carries counts and verdicts only, beside (never paraphrasing) the agent's own
 * reply: measurement answers "did it work", the reply answers "why not".
 */
function TranscriptVerdictLine({ messageId }: { messageId: string }) {
  const verdictLine = useDesignSentPreviews((state) =>
    selectVerifySummaryLineForMessage(state.byTabId, messageId),
  );
  if (!verdictLine) return null;
  return (
    <span
      className="select-none self-center text-[10px] text-muted-foreground"
      data-fork-design-verdict-line
    >
      {verdictLine}
    </span>
  );
}

/**
 * Sent-message chips for `<design_change_request>` blocks — the transcript twin of the
 * composer's attachment pills. The raw markdown stays in the message payload (the agent
 * consumed it); the transcript shows a compact chip with the full request on hover.
 * Fenced into MessagesTimeline's UserTimelineRow.
 */
export function ForkTranscriptDesignChanges({
  blocks,
  messageId,
}: {
  blocks: readonly string[];
  /** The message's id — the one stable identity of the row, and markSent's correlation
   * key, so the verdict line merges every contributing tab's records for exactly this
   * message and never another thread's (`sentAt` is shared by every contributing tab and
   * only ms-unique — an identity it was never meant to be). */
  messageId: string;
}) {
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
      <TranscriptVerdictLine messageId={messageId} />
    </div>
  );
}
