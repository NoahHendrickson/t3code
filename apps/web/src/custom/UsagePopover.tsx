/**
 * Sidebar V2's Usage row — a popover over the current thread instead of the
 * /usage page. See `.fork/customizations.yaml#fork-usage-popover`.
 *
 * Positioner sits at z-40 so the model-prices Dialog (z-50) can stack above
 * it; menus and selects stay at z-[130] and still clear the panel. The popup
 * is sized to the remaining viewport to the right of the row, so it covers
 * the thread rather than replacing it. 56rem is the default width: 48rem
 * let the metric and period toggles collide with the environment filter.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useState } from "react";

import { UsagePage } from "~/components/usage/UsagePage";
import { Popover, PopoverTrigger } from "~/components/ui/popover";
import { SidebarMenuButton } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import { ChartDonutIcon } from "./icons/lucide-phosphor";

export function SidebarV2UsageRow(props: { readonly className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SidebarMenuButton
            size="sm"
            type="button"
            className={cn(props.className, open && "bg-sidebar-row-hover text-sidebar-foreground")}
            isActive={open}
            aria-label="Usage"
            data-testid="sidebar-v2-usage"
          />
        }
      >
        <ChartDonutIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Usage</span>
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="right"
          align="start"
          sideOffset={8}
          className="z-40 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)"
          data-slot="popover-positioner"
        >
          <PopoverPrimitive.Popup
            aria-label="Usage"
            className="dropdown-glass relative flex h-[min(42rem,var(--available-height))] w-[min(56rem,var(--available-width))] origin-(--transform-origin) flex-col overflow-hidden rounded-lg text-popover-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] outline-none transition-[scale,opacity] data-starting-style:scale-98 data-starting-style:opacity-0 dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]"
            data-slot="popover-popup"
            data-testid="usage-popover"
          >
            <UsagePage chrome="panel" />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
