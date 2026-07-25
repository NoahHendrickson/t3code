import { AlarmClockIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";

/** The right-hand slot of a Sidebar V2 card row. Every status resolves to one
    16px-tall mark so the column stays optically aligned no matter which state
    a row is in — the *form* carries the meaning (a moving cluster means the
    agent is running; a static dot means it stopped and wants something), and
    the hue only reinforces it. Text labels ("Working", "Approval") are gone:
    at 282px wide the label crowded out the branch name, and the row already
    says what it is through color plus the duration readout. */
export type SidebarV2StatusTone = "working" | "done" | "approval" | "input" | "failed";

const TONE_COLOR_CLASS: Record<SidebarV2StatusTone, string> = {
  working: "bg-sidebar-v2-status-working",
  done: "bg-sidebar-v2-status-done",
  approval: "bg-sidebar-v2-status-approval",
  input: "bg-sidebar-v2-status-input",
  failed: "bg-sidebar-v2-status-failed",
};

/** Eight 2px cells scattered across an 8x14 box, transcribed from the design.
    `live` cells take the working hue; the rest are dimmed row-foreground, so
    the cluster re-tints itself for light mode instead of needing a second
    hard-coded palette. Offsets are absolute px because the arrangement is
    deliberately irregular — a grid would read as a spinner, and the point is
    that it reads as scattered activity. */
const DITHER_CELLS: ReadonlyArray<{
  left: number;
  top: number;
  live: boolean;
  alpha?: number;
}> = [
  { left: 0, top: 1, live: false, alpha: 0.36 },
  { left: 0, top: 5, live: true },
  { left: 3, top: 4, live: false, alpha: 0.12 },
  { left: 3, top: 8, live: false, alpha: 0.3 },
  { left: 3, top: 12, live: true },
  { left: 6, top: 0, live: false, alpha: 0.12 },
  { left: 6, top: 4, live: false, alpha: 0.3 },
  { left: 6, top: 8, live: true },
];

export function SidebarV2WorkingDither() {
  return (
    <span aria-hidden className="relative block h-[14px] w-[8px] shrink-0">
      {DITHER_CELLS.map((cell) => (
        <span
          key={`${cell.left}-${cell.top}`}
          className={cn(
            "absolute size-[2px] animate-sidebar-v2-dither motion-reduce:animate-none",
            cell.live ? TONE_COLOR_CLASS.working : "bg-current",
          )}
          style={
            {
              left: `${cell.left}px`,
              top: `${cell.top}px`,
              // Resting value for motion-reduce (and the pre-animation frame);
              // --dither-alpha feeds the keyframe so each cell shimmers within
              // its own band rather than every cell flashing to full white.
              opacity: cell.alpha ?? 1,
              "--dither-alpha": `${cell.alpha ?? 1}`,
              // Staggering by position rather than array index makes the
              // shimmer travel up the cluster instead of firing in list order.
              animationDelay: `${(cell.top / 14) * 1.6}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** The blocked/settled counterpart to the dither: one 8px dot centered in the
    same 16px box the provider icons use, so the trailing edge of every row
    lines up whether the mark is a dot, a clock, or the cluster. */
export function SidebarV2StatusDot({ tone }: { tone: SidebarV2StatusTone }) {
  return (
    <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
      <span className={cn("size-2 rounded-full", TONE_COLOR_CLASS[tone])} />
    </span>
  );
}

/** Woke keeps a glyph rather than a dot: it is a *modifier* on an otherwise
    settled row, not one of the five statuses, and an amber dot would be
    indistinguishable from Approval — the one state it must never be confused
    with, since Approval is blocking and Woke is not. */
export function SidebarV2WokeMark() {
  return (
    <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
      <AlarmClockIcon className="size-3.5 text-sidebar-v2-status-approval" />
    </span>
  );
}
