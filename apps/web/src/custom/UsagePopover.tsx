/**
 * Sidebar V2's Usage row overlay — a popover over the current thread instead
 * of the /usage page. See `.fork/customizations.yaml#fork-usage-popover`.
 *
 * Desktop: Positioner sits at z-40 so the model-prices Dialog (z-50) can
 * stack above it; menus and selects stay at z-[130] and still clear the
 * panel. The popup is sized to the remaining viewport to the right of the
 * row, so it covers the thread rather than replacing it. 56rem is the
 * default width: 48rem let the metric and period toggles collide with the
 * environment filter.
 *
 * Below 768px the V2 sidebar is a z-50 Sheet. A z-40 popover portals outside
 * that sheet and is inert underneath it. Narrow viewports use a nested
 * Dialog (also z-50) so Usage stacks above the sheet and the model-prices
 * Dialog can still stack above Usage. The dialog keeps DialogPopup's mobile
 * sheet treatment but sizes itself to the viewport below its 3rem top inset,
 * where the panel's own height would otherwise run past the bottom edge.
 *
 * The dashboard is loaded lazily: the sidebar is in the main chunk, and a
 * static import here would pull the whole /usage route (page, price
 * overrides, provider chart) into every cold load whether or not Usage is
 * ever opened. Nothing mounts until the popup opens.
 *
 * Both shells carry dropdown-glass, so they take the popup frost from
 * theme.custom.css (fork-popup-surface) — the dialog is the one dialog on
 * that recipe. The panel chrome does not paint bg-background, which would
 * cover that frost.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cloneElement, lazy, Suspense, useState, type ReactElement } from "react";

import { Dialog, DialogPopup, DialogTrigger } from "~/components/ui/dialog";
import { Popover, PopoverTrigger } from "~/components/ui/popover";
import { useSidebar } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

const UsagePage = lazy(() =>
  import("~/components/usage/UsagePage").then((module) => ({ default: module.UsagePage })),
);

const USAGE_PANEL_SIZE =
  "flex h-[min(42rem,calc(100dvh-2rem))] w-[min(56rem,var(--available-width,calc(100vw-2rem)))] flex-col overflow-hidden";

export function SidebarV2UsageRow(props: { readonly trigger: ReactElement<{ active?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  const trigger = cloneElement(props.trigger, { active: open });
  const panel = (
    <Suspense fallback={null}>
      <UsagePage chrome="panel" />
    </Suspense>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        <DialogPopup
          aria-label="Usage"
          showCloseButton={false}
          className={cn(
            USAGE_PANEL_SIZE,
            "dropdown-glass max-w-none p-0 text-popover-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] max-sm:h-[calc(100dvh-3rem)] max-sm:w-full dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]",
          )}
          data-testid="usage-popover"
        >
          {panel}
        </DialogPopup>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
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
            className={cn(
              USAGE_PANEL_SIZE,
              "dropdown-glass relative origin-(--transform-origin) rounded-lg text-popover-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] outline-none transition-[scale,opacity] data-starting-style:scale-98 data-starting-style:opacity-0 dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]",
            )}
            data-slot="popover-popup"
            data-testid="usage-popover"
          >
            {panel}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
