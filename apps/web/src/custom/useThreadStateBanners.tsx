import { AlarmClockIcon } from "lucide-react";
import { useMemo } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { Button } from "~/components/ui/button";

/**
 * The settled / snoozed notice card and the woke notice the fork keeps above
 * the composer, in place of upstream's timeline-footer status line (#16782).
 * A woken thread announces itself here, not just in the sidebar pill;
 * dismissing marks the wake as seen, and sending a message clears it.
 */
export function useThreadStateBanners(input: {
  readonly threadId: string | null;
  readonly settled: boolean;
  readonly snoozed: boolean;
  readonly wokeVisible: boolean;
  readonly canOperateThread: boolean;
  readonly isUnsnoozing: boolean;
  readonly isUnsettling: boolean;
  readonly onUnsnooze: () => unknown;
  readonly onUnsettle: () => unknown;
  readonly onAcknowledgeWoke: () => void;
}): {
  readonly woke: ComposerBannerStackItem | null;
  readonly parked: ComposerBannerStackItem | null;
} {
  const { threadId, settled, snoozed, wokeVisible, canOperateThread } = input;
  const { isUnsnoozing, isUnsettling, onUnsnooze, onUnsettle, onAcknowledgeWoke } = input;
  const threadKey = threadId ?? "unknown";

  const woke = useMemo<ComposerBannerStackItem | null>(
    () =>
      wokeVisible
        ? {
            id: `thread-woke:${threadKey}`,
            variant: "info",
            icon: <AlarmClockIcon />,
            title: "Thread woke from snooze",
            description: "Send a message to continue",
            dismissLabel: "Dismiss Woke notification",
            onDismiss: onAcknowledgeWoke,
          }
        : null,
    [onAcknowledgeWoke, threadKey, wokeVisible],
  );

  const parked = useMemo<ComposerBannerStackItem | null>(() => {
    if (!snoozed && !settled) return null;
    return {
      id: `thread-${snoozed ? "snoozed" : "settled"}:${threadKey}`,
      variant: "info",
      noticeCard: true,
      icon: snoozed ? <AlarmClockIcon /> : undefined,
      title: `This thread is ${snoozed ? "snoozed" : "settled"}`,
      description: snoozed
        ? "Send a message to wake"
        : "Sending a message moves it back to Active in the sidebar.",
      actions: (
        <Button
          size="xs"
          variant="default"
          data-fork-composer-notice-action="primary"
          disabled={!canOperateThread || (snoozed ? isUnsnoozing : isUnsettling)}
          onClick={() => void (snoozed ? onUnsnooze() : onUnsettle())}
        >
          {snoozed
            ? isUnsnoozing
              ? "Waking..."
              : "Wake now"
            : isUnsettling
              ? "Unsettling..."
              : "Unsettle"}
        </Button>
      ),
    };
  }, [
    canOperateThread,
    isUnsettling,
    isUnsnoozing,
    onUnsettle,
    onUnsnooze,
    settled,
    snoozed,
    threadKey,
  ]);

  return { woke, parked };
}
