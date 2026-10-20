import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
/* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
import { cn } from "~/lib/utils";
/* fork:end fork-touch-affordances */

interface PanelTabCloseButtonProps {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}

export function PanelTabCloseButton({
  children,
  label,
  onClick,
  tooltip,
}: PanelTabCloseButtonProps) {
  const button = (
    <button
      type="button"
      className={cn(
        "cursor-pointer group/close relative flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted",
        /* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances
           With no hovering pointer the icon never becomes the X, so on an
           inactive tab it stops closing the tab, and the active tab (its row
           stamped data-active-tab) shows the X it closes with. */
        "[@media(any-hover:none)]:group-data-[active-tab=false]/tab:pointer-events-none",
        /* fork:end fork-touch-affordances */
      )}
      aria-label={label}
      onClick={onClick}
    >
      <span
        className={cn(
          "relative flex size-3 items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden",
          /* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
          "[@media(any-hover:none)]:group-data-[active-tab=true]/tab:hidden",
          /* fork:end fork-touch-affordances */
        )}
      >
        {children}
      </span>
      <X
        className={cn(
          "hidden size-3 group-hover/tab:block group-focus-visible/close:block",
          /* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
          "[@media(any-hover:none)]:group-data-[active-tab=true]/tab:block",
          /* fork:end fork-touch-affordances */
        )}
      />
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
