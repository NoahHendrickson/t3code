import { ChevronsDownUpIcon } from "lucide-react";
import { useMemo, useSyncExternalStore, type RefObject } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { shouldOfferResumeCompaction } from "~/components/chat/ContextWindowMeter.logic";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { formatContextWindowTokens } from "~/lib/contextWindow";

// Session-scoped dismissals, one key per (thread, snapshot). They live at module
// scope, not in hook state, because ChatView remounts per route (a draft and a
// server thread are separate instances) and a dismissal must outlive that.
const dismissedKeys = new Set<string>();
const dismissListeners = new Set<() => void>();

function subscribeToDismissals(listener: () => void) {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
}

function dismissResumeCompaction(key: string) {
  dismissedKeys.add(key);
  for (const listener of dismissListeners) listener();
}

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
  readonly composerRef: RefObject<{ readonly compactContext: () => void } | null>;
}): ComposerBannerStackItem | null {
  const { threadId, contextWindow, dismissed, hidden, provider, nowMinute } = input;
  const { compactDisabledReason, composerRef } = input;
  const key = threadId && contextWindow ? `${threadId}:${contextWindow.updatedAt}` : null;
  const keyDismissed = useSyncExternalStore(
    subscribeToDismissals,
    () => key !== null && dismissedKeys.has(key),
  );

  return useMemo(() => {
    if (
      key === null ||
      contextWindow === null ||
      keyDismissed ||
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
          if (!compactDisabled) composerRef.current?.compactContext();
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
      onDismiss: () => dismissResumeCompaction(key),
    } satisfies ComposerBannerStackItem;
  }, [
    compactDisabledReason,
    composerRef,
    contextWindow,
    dismissed,
    hidden,
    key,
    keyDismissed,
    nowMinute,
    provider,
  ]);
}
