/**
 * The fork's segmented tabs, styled after its Figma Tabs List (521:5338): a
 * compact rounded track with the selected tab raised. Used by the scheduled
 * trigger picker and the Usage page's metric, period, and breakdown tabs.
 */
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { cn } from "~/lib/utils";

export function SegmentedTabs({ className, ...props }: ToggleGroup.Props) {
  return (
    <ToggleGroup
      {...props}
      data-fork-segmented-tabs
      className={cn(
        "flex w-max items-center overflow-clip rounded-sm bg-muted p-0.5 dark:bg-white/6",
        className,
      )}
    />
  );
}

export function SegmentedTab({
  className,
  ...props
}: Omit<Toggle.Props, "className"> & { readonly className?: string }) {
  return (
    <Toggle
      {...props}
      data-fork-segmented-tab
      className={cn(
        "inline-flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-[calc(var(--radius-sm)-2px)] px-2.5 text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-64 data-pressed:bg-background data-pressed:text-foreground dark:data-pressed:bg-white/16 dark:data-pressed:text-white",
        className,
      )}
    />
  );
}
