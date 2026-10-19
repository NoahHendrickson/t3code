/**
 * The back arrow a run thread shows when it was opened from Automations —
 * see `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`.
 *
 * Run threads are off the sidebar, so without this the only way back from a
 * run you opened is the Automations row and a second trip through the list.
 * The run table marks its navigation in history state rather than the URL, so
 * the arrow belongs to that one history entry: it returns to whichever list
 * opened the thread (a task's Run history or All runs), survives a reload, and
 * never shows when the same thread is reached any other way.
 */
import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

declare module "@tanstack/react-router" {
  interface HistoryState {
    forkOpenedFromAutomations?: boolean;
  }
}

/** Pass as `state` when Automations opens a run's thread. */
export const OPENED_FROM_AUTOMATIONS_STATE = { forkOpenedFromAutomations: true } as const;

export function AutomationRunBackButton() {
  const router = useRouter();
  const openedFromAutomations = useLocation({
    select: (location) => location.state.forkOpenedFromAutomations === true,
  });
  if (!openedFromAutomations) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Back to Automations"
            data-testid="automation-run-back"
            onClick={() => router.history.back()}
          />
        }
      >
        <ArrowLeftIcon />
      </TooltipTrigger>
      <TooltipPopup side="bottom">Back to Automations</TooltipPopup>
    </Tooltip>
  );
}
