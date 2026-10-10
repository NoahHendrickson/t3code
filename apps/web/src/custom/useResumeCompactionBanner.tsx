import { ChevronsDownUpIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { shouldOfferResumeCompaction } from "~/components/chat/ContextWindowMeter.logic";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { formatContextWindowTokens } from "~/lib/contextWindow";

/**
 * The "Resume with less context" notice card the fork keeps in place of
 * upstream's compact-on-send button (#16631): a stale, large Claude thread
 * offers Compact in the banner stack, and the send button stays the plain
 * send (so dictation keeps its slot). Dismissing ("Keep full history") hides
 * it for that thread and context snapshot for the session.
 */
export function useResumeCompactionBanner(input: {
  readonly threadId: string | null;
  readonly contextWindow: { readonly usedTokens: number; readonly updatedAt: string } | null;
  readonly dismissed: boolean;
  readonly hidden: boolean;
  readonly provider: string | null | undefined;
  readonly nowMinute: string;
  readonly compactDisabledReason: string | null;
  readonly onCompact: () => void;
}): ComposerBannerStackItem | null {
  const { threadId, contextWindow, dismissed, hidden, provider, nowMinute } = input;
  const { compactDisabledReason, onCompact } = input;
  // Session-scoped dismissals, one key per (thread, snapshot). A set rather
  // than a single slot so dismissing the banner on one thread does not
  // resurface it on another thread dismissed earlier.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const key = threadId && contextWindow ? `${threadId}:${contextWindow.updatedAt}` : null;

  return useMemo(() => {
    if (
      key === null ||
      contextWindow === null ||
      dismissedKeys.has(key) ||
      dismissed ||
      hidden ||
      !shouldOfferResumeCompaction({
        provider,
        usedTokens: contextWindow.usedTokens,
        updatedAt: contextWindow.updatedAt,
        now: `${nowMinute}:00.000Z`,
      })
    ) {
      return null;
    }

    const compactDisabled = compactDisabledReason !== null;
    const compactAction = (
      <Button
        size="xs"
        variant="default"
        data-fork-composer-notice-action="primary"
        disabled={compactDisabled}
        onClick={() => {
          if (!compactDisabled) onCompact();
        }}
      >
        Compact
      </Button>
    );
    return {
      id: `resume-compaction:${key}`,
      variant: "info",
      noticeCard: true,
      icon: <ChevronsDownUpIcon />,
      title: "Resume with less context",
      description: `${formatContextWindowTokens(contextWindow.usedTokens)} tokens from an older session.`,
      actions: compactDisabled ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex">{compactAction}</span>} />
          <TooltipPopup side="top">{compactDisabledReason}</TooltipPopup>
        </Tooltip>
      ) : (
        compactAction
      ),
      dismissLabel: "Keep full history",
      onDismiss: () => setDismissedKeys((keys) => new Set(keys).add(key)),
    } satisfies ComposerBannerStackItem;
  }, [
    compactDisabledReason,
    contextWindow,
    dismissed,
    dismissedKeys,
    hidden,
    key,
    nowMinute,
    onCompact,
    provider,
  ]);
}
