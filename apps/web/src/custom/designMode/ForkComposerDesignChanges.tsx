import type { ScopedThreadRef } from "@t3tools/contracts";
import { PencilRulerIcon, X } from "lucide-react";

import type { DraftId } from "~/composerDraftStore";
import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "~/components/composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import {
  type PendingDesignChange,
  useDesignChangeDraftStore,
  useDesignChangeTargetRef,
  useForkPendingDesignChanges,
} from "./designChangeDraftStore";

interface Props {
  /** The composer's own draft target — a DraftId for unstarted threads. Resolved to the
   * ScopedThreadRef the design panel keyed its attachment under. */
  target: ScopedThreadRef | DraftId;
  className?: string;
}

function chipLabel(entry: PendingDesignChange): string {
  const first = entry.elements[0];
  if (entry.elements.length === 1 && first) {
    return first.sourceLabel ? `${first.tag} · ${first.sourceLabel}` : first.tag;
  }
  return `${entry.elementCount} elements`;
}

function chipSummary(entry: PendingDesignChange): string | null {
  const deltas = entry.elements.flatMap((element) => element.deltas);
  const first = deltas[0];
  if (!first) return null;
  return deltas.length > 1 ? `${first} +${deltas.length - 1}` : first;
}

function DesignChangeChip({
  entry,
  onRemove,
}: {
  entry: PendingDesignChange;
  onRemove: () => void;
}) {
  const summary = chipSummary(entry);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}>
            <PencilRulerIcon className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")} />
            <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{chipLabel(entry)}</span>
            {summary ? (
              <span className="select-none truncate text-[10px] font-normal leading-tight text-muted-foreground/85">
                {summary}
              </span>
            ) : null}
            <button
              type="button"
              className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              aria-label="Remove design change"
            >
              <X className="size-3" />
            </button>
          </span>
        }
      />
      <TooltipPopup className="max-w-96 whitespace-pre-wrap font-mono text-[11px]">
        {entry.markdown.slice(0, 600)}
        {entry.markdown.length > 600 ? "…" : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Attachment pills for pending design changes — rendered in the composer's attachment
 * area (fenced into ChatComposer beside the element-context chips). Each pill names the
 * element and compresses the edit ("padding-top 24px → 32px +2"); the full change-request
 * markdown rides the outgoing message via ChatView's fenced send path instead of filling
 * the prompt. See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkComposerDesignChanges({ target, className }: Props) {
  const threadRef = useDesignChangeTargetRef(target);
  const pending = useForkPendingDesignChanges(target);
  if (!threadRef || pending.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-fork-design-changes>
      {pending.map((entry) => (
        <DesignChangeChip
          key={entry.id}
          entry={entry}
          onRemove={() => useDesignChangeDraftStore.getState().remove(threadRef, entry.id)}
        />
      ))}
    </div>
  );
}
