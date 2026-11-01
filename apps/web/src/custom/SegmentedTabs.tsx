/**
 * The fork's segmented tabs, styled after its Figma Tabs List (521:5338): a
 * compact rounded track with the selected tab raised. Used by the scheduled
 * trigger picker and the Usage page's metric, period, and breakdown tabs.
 */
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

const GLIDE_TIMING: KeyframeAnimationOptions = {
  duration: 240,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
};

interface Glide {
  readonly tab: HTMLElement;
  readonly animations: readonly [Animation, Animation];
}

const pressedTab = (group: Element) =>
  group.querySelector<HTMLElement>(":scope > [data-fork-segmented-tab][data-pressed]");

// The selected look lives on the tab itself (the glass themes dress it with
// pseudo-elements), so the new tab glides in from the old one's spot while its
// label glides back the same distance and stays put. z-index stays out of the
// keyframes so the transform runs on the compositor.
function glide(tab: HTMLElement, from: DOMRect): Glide | null {
  const label = tab.firstElementChild;
  const to = tab.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  if (!label || Math.abs(dx) < 1) return null;
  // Beneath its siblings, so it passes under their labels.
  tab.style.zIndex = "-1";
  const slide = tab.animate(
    [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
    GLIDE_TIMING,
  );
  const counter = label.animate(
    [{ transform: `translateX(${-dx}px)` }, { transform: "translateX(0)" }],
    GLIDE_TIMING,
  );
  return { tab, animations: [slide, counter] };
}

function settle(glide: Glide) {
  for (const animation of glide.animations) animation.cancel();
  glide.tab.style.removeProperty("z-index");
}

export function SegmentedTabs({ className, ...props }: ToggleGroup.Props) {
  const group = useRef<HTMLDivElement>(null);
  const shownTab = useRef<HTMLElement | null>(null);
  const running = useRef<Glide | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- animates the DOM when the pressed tab moves, reading both positions in one layout before paint
  useLayoutEffect(() => {
    const previous = shownTab.current;
    const next = group.current && pressedTab(group.current);
    shownTab.current = next;
    if (!previous?.isConnected || !next || previous === next) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Mid-glide, this is where the pill visibly is.
    const from = previous.getBoundingClientRect();
    // A glide still moving would sit over the new tab and take its clicks.
    if (running.current) settle(running.current);
    const started = glide(next, from);
    running.current = started;
    if (!started) return;
    void started.animations[0].finished.then(
      () => running.current === started && settle(started),
      () => {},
    );
  });

  return (
    <ToggleGroup
      {...props}
      ref={group}
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
