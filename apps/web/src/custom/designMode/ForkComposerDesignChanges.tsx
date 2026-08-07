import type { ScopedThreadRef } from "@t3tools/contracts";
import { PaintbrushIcon, X } from "lucide-react";

import type { DraftId } from "~/composerDraftStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import {
  type PendingDesignChange,
  useDesignChangeDraftStore,
  useDesignChangeTargetRef,
  useForkPendingDesignChanges,
} from "./designChangeDraftStore";
import { countUnresolvedDesignElements } from "./protocol";

interface Props {
  /** The composer's own draft target — a DraftId for unstarted threads. Resolved to the
   * ScopedThreadRef the design panel keyed its attachment under. */
  target: ScopedThreadRef | DraftId;
  className?: string;
}

/** The t3-fork Figma chip palette (node 157:4660): translucent color fills cycling per
 * chip so simultaneous changes read apart at a glance. The blue and purple are the
 * design's own; green and orange extend the family with the same value pattern. Static
 * class strings so Tailwind's scanner sees them. */
const CHIP_FILLS = [
  "bg-[rgba(81,139,255,0.5)]",
  "bg-[rgba(223,81,255,0.5)]",
  "bg-[rgba(81,255,139,0.5)]",
  "bg-[rgba(255,161,81,0.5)]",
] as const;

/** Stable fill per chip — keyed off the entry id, not the render index, so removing one
 * chip never recolors its neighbors. */
function chipFill(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CHIP_FILLS[hash % CHIP_FILLS.length]!;
}

function chipLabel(entry: PendingDesignChange): string {
  const first = entry.elements[0];
  if (entry.elements.length === 1 && first) return first.tag;
  return `${entry.elementCount} elements`;
}

function chipSource(entry: PendingDesignChange): string | null {
  const first = entry.elements[0];
  return entry.elements.length === 1 && first ? first.sourceLabel : null;
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
  const source = chipSource(entry);
  const summary = chipSummary(entry);
  const unresolved = countUnresolvedDesignElements(entry);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex h-8 max-w-full items-center gap-2 overflow-hidden rounded-full py-2 pl-1 pr-1.5 text-sm text-foreground",
              chipFill(entry.id),
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-black/16">
              <PaintbrushIcon className="size-4" />
            </span>
            <span className="shrink-0">{chipLabel(entry)}</span>
            {source ? <span className="shrink-0">{source}</span> : null}
            {/* min-w-0 lets the summary actually give way in a narrow column — without it
                flex refuses to shrink below the text's own width and everything after
                this span (the unresolved note, the remove button) is pushed out of the
                clipped pill instead of the summary ellipsizing. */}
            {summary ? <span className="min-w-0 truncate">{summary}</span> : null}
            {unresolved > 0 ? (
              <span className="shrink-0 text-[11px] font-medium opacity-80">
                {entry.elements.length === 1 ? "no source" : `${unresolved} without source`}
              </span>
            ) : null}
            <button
              type="button"
              className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/16"
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
        {unresolved > 0
          ? `${unresolved === entry.elements.length ? (unresolved === 1 ? "This element has" : "These elements have") : `${unresolved} of ${entry.elements.length} elements have`} no source location — the request carries selector and text context instead.\n\n`
          : ""}
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
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-fork-design-changes>
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
