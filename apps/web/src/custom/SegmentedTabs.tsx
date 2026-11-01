/**
 * The fork's segmented tabs, styled after its Figma Tabs List (521:5338): a
 * compact rounded track with the selected tab raised. Used by the scheduled
 * trigger picker and the Usage page's metric, period, and breakdown tabs.
 */
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { cn } from "~/lib/utils";

const GLIDE_TIMING: KeyframeAnimationOptions = {
  duration: 240,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
};

const pressedTab = (group: Element) =>
  group.querySelector<HTMLElement>(":scope > [data-fork-segmented-tab][data-pressed]");

// The selected look lives on the tab itself (the glass themes dress it with
// pseudo-elements), so the new tab glides in from the old one's spot while its
// label glides back the same distance and stays put. Under its siblings, so it
// passes beneath their labels.
function glide(group: Element, from: DOMRect) {
  const tab = pressedTab(group);
  const label = tab?.firstElementChild;
  if (!tab || !label) return;
  const to = tab.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  if (Math.abs(dx) < 1) return;
  tab.animate(
    [
      { transform: `translateX(${dx}px)`, zIndex: -1 },
      { transform: "translateX(0)", zIndex: -1 },
    ],
    GLIDE_TIMING,
  );
  label.animate(
    [{ transform: `translateX(${-dx}px)` }, { transform: "translateX(0)" }],
    GLIDE_TIMING,
  );
}

export function SegmentedTabs({ className, onValueChange, ...props }: ToggleGroup.Props) {
  return (
    <ToggleGroup
      {...props}
      onValueChange={(value, details) => {
        const group =
          details.event.target instanceof Element
            ? details.event.target.closest("[data-fork-segmented-tabs]")
            : null;
        const from = group ? pressedTab(group)?.getBoundingClientRect() : undefined;
        onValueChange?.(value, details);
        if (!group || !from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        // The click's update commits before the next frame paints.
        requestAnimationFrame(() => glide(group, from));
      }}
      data-fork-segmented-tabs
      className={cn(
        "isolate flex w-max items-center overflow-clip rounded-sm bg-muted p-0.5 dark:bg-white/6",
        className,
      )}
    />
  );
}

export function SegmentedTab({
  className,
  children,
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
    >
      <span className="inline-flex items-center justify-center">{children}</span>
    </Toggle>
  );
}
