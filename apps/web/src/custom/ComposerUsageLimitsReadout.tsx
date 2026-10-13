/**
 * The selected provider's 5-hour quota as a small bar beside the composer's
 * model — see `.fork/customizations.yaml#fork-composer-usage-limits`. The bar
 * reads the selected instance's own snapshot, so it follows the model picker
 * and adds no traffic. Clicking it opens every provider's limits as the Usage
 * view's compact list: rows split by dividers, no cards.
 */
import { useAtomValue } from "@effect/atom-react";
import type { ServerProviderUsageLimits } from "@t3tools/contracts";
import { formatResetsIn, remainingPercent } from "@t3tools/shared/usageLimits";
import { memo, useState } from "react";

import { UsageLimitsPooled } from "~/components/usage/UsageLimitsPooled";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { environmentPresentations } from "~/state/presentation";
import { usageMeterTone } from "./usageMeterTone";

export const ComposerUsageLimitsReadout = memo(function ComposerUsageLimitsReadout(props: {
  readonly usageLimits: ServerProviderUsageLimits | undefined;
}) {
  // The popover's clock advances on open rather than ticking while it shows.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const session = props.usageLimits?.windows.find((window) => window.kind === "session");
  if (!session) return null;
  const remaining = remainingPercent(session);
  const resetsIn = formatResetsIn(session, Date.now());
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setOpenedAt(Date.now());
      }}
    >
      <PopoverTrigger
        data-fork-composer-usage-limits="true"
        aria-label={`5-hour limit: ${remaining}% left${resetsIn ? `, ${resetsIn}` : ""}. Show usage limits`}
        className="flex h-6 shrink-0 cursor-pointer items-center rounded-[4px] px-1.5 outline-none hover:bg-(--fork-composer-control-hover) focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-(--fork-composer-control-hover)"
      >
        <span className="relative h-1 w-7 overflow-hidden rounded-full bg-muted">
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[background-color]",
              usageMeterTone(remaining),
            )}
            style={{ width: `${remaining}%` }}
          />
        </span>
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" sideOffset={8} width="sm" padding="none">
        <ComposerLimitsMenu now={openedAt} />
      </PopoverPopup>
    </Popover>
  );
});

/** Mounted only while the menu is open, so the composer never subscribes to every environment's providers. */
function ComposerLimitsMenu(props: { readonly now: number }) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  return (
    <div className="max-h-[min(28rem,calc(var(--available-height)-1rem))] overflow-y-auto py-1">
      <UsageLimitsPooled presentations={presentations} now={props.now} compact />
    </div>
  );
}
