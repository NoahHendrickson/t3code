// Imported through the shim's own path rather than the `lucide-react` alias.
// This file is fork-owned, so there is no upstream import site to preserve —
// the alias exists to keep *upstream's* imports untouched, not this one.
// CircleAlert is Phosphor's WarningCircle under its lucide name; the half
// circle is fork-only. Both are the component set's own status marks (Figma
// 364:17299 exports them at 9.75px), drawn at the fill weight.
import {
  AlarmClockIcon,
  CircleAlertIcon,
  CircleHalfIcon,
  PenLineIcon,
} from "./icons/lucide-phosphor";
import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";
import { useForkWorkingMark } from "./forkWorkingMark";

/** The trailing slot of a Sidebar V2 card row's title line, and this module
    owns every status form that can land in it. Every status resolves to one
    mark so the trailing column stays optically aligned no matter which state
    a row is in — the *form* carries the meaning (falling pixels mean the
    agent is running; a static mark means it stopped), and the hue reinforces
    it. Rain while working is the phanttom Ghostty vocabulary this started
    from; the settled marks follow the component set (Figma 364:17299,
    "thread card v3"): a 10px dot for Done (blue — a finished turn you have
    not read) and Idle (muted), one amber half-filled circle for both
    blocked-on-you states, and a filled warning circle for Failed.
    Text labels ("Working", "Approval") are gone — at 282px wide the label
    crowded out the branch name, and the row already says what it is through
    the mark plus the duration readout.

    Form now separates more than rain / dot / clock: Approval and Input are
    one mark — both mean "waiting on you", and the tooltip says which — while
    Done and Idle share the dot and differ by hue (blue vs muted). Screen
    readers get the `role="status"` label SidebarV2 renders alongside the
    mark. */

export type SidebarV2StatusTone = "working" | "done" | "approval" | "input" | "failed";

/** The tones a *dot* can carry. `working` is excluded by construction: a working
    row always draws the rain, so a working dot is unreachable — the type is what
    keeps that true as `topStatus` in SidebarV2 grows new branches. */
export type SidebarV2DotTone = Exclude<SidebarV2StatusTone, "working">;

const TONE_TEXT_CLASS: Record<SidebarV2DotTone, string> = {
  done: "text-sidebar-v2-status-done",
  approval: "text-sidebar-v2-status-approval",
  input: "text-sidebar-v2-status-input",
  failed: "text-sidebar-v2-status-failed",
};

/** Every settled mark draws in the same box: the rain's 14px on the tall
    axis, 12px on the wide one — the Phosphor glyphs pad their 256 grid, so a
    12px icon draws the design's 9.75px circle, and the 10px dots centre in
    the same width — so a card's mark sits on its content edge and a slim
    row's 14px slot centres it. */
const MARK_SLOT_CLASS = "flex h-[14px] w-[12px] shrink-0 items-center justify-center";

// Geometry from PixelSparkleView: a 3x5 grid on a 3.8px pitch with 2.85px cells
// rounded at 28% of their size. Native units land at 10.45×18.05; the SVG
// scales that into the leading 14px status slot (height-bound, aspect kept)
// so the rain reads with the title text instead of hanging below its baseline.
//
// The native view runs four columns; this is three. At 16px the fourth column
// read as density rather than as a separate falling stream, and the mark is
// competing for width with the elapsed time beside it.
const ROWS = 5;
const PITCH = 3.8;
const CELL = 2.85;
/** The status slot's tall axis — the box every settled mark shares. */
const SLOT = 14;

/** Per-column clock, straight off the Swift constants: `speed` and `phase` come
    from its `frac(sin(n) * 43758.5453)` hash, one fall takes `(rows + 3) / speed`
    seconds, and `phase` becomes a negative delay. This is what keeps the columns
    permanently out of step with each other.

    These are the hash's first three outputs (n = 0, 1, 2). Dropping the *last*
    entry rather than one from the middle is what keeps them the values that
    hash actually produces, so the table can still be checked against the Swift
    source. */
const COLUMNS: ReadonlyArray<{ speed: number; phase: number }> = [
  { speed: 2.5, phase: 0 },
  { speed: 4.504345, phase: 1.961008 },
  { speed: 3.80266, phase: 2.768793 },
];

/** Derived, not declared: a hand-kept count that disagreed with the table would
    silently crop or pad the box while every drop kept rendering. */
const COLS = COLUMNS.length;

export const RAIN_SPAN = ROWS + 3;
const SPAN = RAIN_SPAN;

/** The alpha curve every drop follows: a bright head, an exponential trail
    above it, a sharp falloff below.

    `rainAlpha` is the bare curve — this is what the generated keyframes in
    `theme.custom.css` sample. `dropAlpha` adds Swift's "discard anything under
    0.02" cutoff, which only applies to the still frame: CSS interpolates
    between stops, so clamping the table would put a visible step in the tail
    where the native view just fades out. Exported for
    `__fork_guards__/sidebarV2Rain.test.ts`, which re-derives the table. */
export function rainAlpha(dy: number): number {
  return dy >= 0 ? Math.exp(-dy * 0.8) : Math.exp(dy * 8);
}

export function dropAlpha(dy: number): number {
  const alpha = rainAlpha(dy);
  return alpha >= 0.02 ? alpha : 0;
}

/** Seconds to rewind this row's rain by. Native phanttom drives every tab from
    one shared wall clock, so its working tabs all fall in lockstep; here a
    sidebar full of working threads would read as a single blinking block, so
    each row gets its own offset. Hashing the thread key rather than randomizing
    is what makes the spread deterministic: the same thread always draws the same
    offset, so a re-render cannot reshuffle the row's phase. (A *remount* still
    restarts the CSS delay clock, so a row that scrolls out and back re-phases
    regardless — the hash guarantees rows differ from each other, not that any
    one row is continuous across remount.) Every column moves
    by the same absolute amount, which preserves their relationship to each
    other: the row looks exactly like one that started working moments earlier. */
export function rainOffsetSeconds(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // FNV alone leaves the high bits barely moved between keys that differ only
  // in their last character, which is exactly what sequential thread ids look
  // like — the offsets then land within a second of each other and the rows
  // still read as synchronised. The murmur3 finalizer avalanches them apart.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 0x1_0000_0000) * 32;
}

/** One profile per row, spelled out in full because Tailwind only sees class
    names it can find literally in the source — a template built from the row
    index would never get generated. (The keyframes themselves are safe either
    way: they live in `theme.custom.css`, outside the `@theme` block Tailwind
    prunes, so an unreferenced one survives.) Duration and delay ride in as inline
    styles; keeping the name in a class is what lets `motion-reduce:animate-none`
    still win, since a class rule cannot override an inline `animation-name`. */
export const RAIN_ANIMATION_CLASS = [
  "animate-[sidebar-v2-rain-0_linear_infinite]",
  "animate-[sidebar-v2-rain-1_linear_infinite]",
  "animate-[sidebar-v2-rain-2_linear_infinite]",
  "animate-[sidebar-v2-rain-3_linear_infinite]",
  "animate-[sidebar-v2-rain-4_linear_infinite]",
] as const;

const WIDTH = (COLS - 1) * PITCH + CELL;
const HEIGHT = (ROWS - 1) * PITCH + CELL;
/** Drawn size: fit the 14px rain box on the tall axis, keep the native aspect. */
const DRAW_HEIGHT = SLOT;
const DRAW_WIDTH = (WIDTH / HEIGHT) * SLOT;

/** The grid is fixed and never reorders, so the twenty drops are resolved once
    at module load — position, clock and keyframe per cell. Only the per-row
    time offset is left to compute at render. */
const CELLS = COLUMNS.flatMap((column, col) =>
  Array.from({ length: ROWS }, (_, row) => ({
    id: `${col}:${row}`,
    x: col * PITCH,
    y: row * PITCH,
    row,
    speed: column.speed,
    phase: column.phase,
    duration: SPAN / column.speed,
    animationClass: RAIN_ANIMATION_CLASS[row],
  })),
);

/** Drawn as SVG rather than positioned elements on purpose. A 2.85px box on a
    3.8px pitch never lands on a device-pixel boundary, and browsers snap
    element backgrounds to whole pixels — so the twenty cells would paint at
    visibly different widths depending on each one's subpixel offset. SVG keeps
    the fractional geometry and antialiases it, which is what the native Canvas
    does too, so every drop stays exactly square. */
function SidebarV2WorkingRain({ seed }: { seed: string }) {
  const offset = rainOffsetSeconds(seed);
  return (
    <svg
      aria-hidden
      className="block h-[14px] w-auto shrink-0 overflow-hidden"
      width={DRAW_WIDTH}
      height={DRAW_HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {CELLS.map((cell) => (
        <rect
          key={cell.id}
          x={cell.x}
          y={cell.y}
          width={CELL}
          height={CELL}
          rx={CELL * 0.28}
          className={cn(
            "fill-sidebar-v2-status-working",
            // The keyframe drives opacity while it runs; the inline value is
            // what remains once motion-reduce cancels the animation.
            cell.animationClass,
            "motion-reduce:animate-none",
          )}
          style={
            {
              // Reduce Motion gets a still frame rather than nothing at all,
              // matching the native view — which renders a `t = 0.6` snapshot
              // instead of hiding the indicator. Taken at this row's own offset
              // so the frozen rows differ from each other too.
              opacity: dropAlpha(
                (((0.6 + offset) * cell.speed + cell.phase) % SPAN) - 1.5 - cell.row,
              ),
              animationDuration: `${cell.duration.toFixed(4)}s`,
              animationDelay: `${(-cell.phase / cell.speed - offset).toFixed(4)}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

// DNA helix, from the "Sequencing" thinking chip: a 7x7 grid in a 56-unit box
// with a 2-unit gap, square cells. Two strands cross each row as sin/cos of one
// phase, and each row trails the one above it by a fixed phase step, so the
// strands twist down the grid.
//
// Drawn at 12px rather than the chip's 16/24 because the card's status box is
// 12px wide and clips; every other working slot is 14px and centres it.
const HELIX_GRID = 7;
const HELIX_BOX = 56;
const HELIX_GAP = 2;
const HELIX_CELL = (HELIX_BOX - (HELIX_GRID - 1) * HELIX_GAP) / HELIX_GRID;
const HELIX_SIZE = 12;

/** Radians per second, and the phase each row trails the one above it by. */
const HELIX_SPEED = 3.2;
const HELIX_ROW_LAG = 0.785;
/** One keyframe loop. The curve repeats every half twist (π, not 2π): moving
    the phase by π swaps the two strands along with their depth weights, which
    leaves the `max` in `helixAlpha` unchanged. */
const HELIX_LOOP = Math.PI / HELIX_SPEED;

/** The drawn opacity of a cell in `column` at strand phase `phase`. Each strand
    lights the cells nearest it with an exponential falloff, dimmed while it is
    on the far side of the twist; cells under 0.08 are not drawn at all, and lit
    ones sit on a 10% floor — the chip's `cellN`. Every row runs the same curve,
    only phase-shifted, so this one function is what the generated
    `sidebar-v2-helix-*` keyframes in `theme.custom.css` sample and
    `__fork_guards__/sidebarV2Helix.test.ts` re-derives. */
export function helixAlpha(column: number, phase: number): number {
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  const alpha = Math.max(
    Math.exp(-Math.abs(column - (3 + 2.45 * sin)) * 2.4) * (0.4 + 0.6 * (0.5 + 0.5 * cos)),
    Math.exp(-Math.abs(column - (3 - 2.45 * sin)) * 2.4) * (0.4 + 0.6 * (0.5 - 0.5 * cos)),
  );
  return alpha > 0.08 ? 0.1 + 0.9 * alpha : 0;
}

/** Profiles for columns 0–3 only, spelled out for Tailwind like the rain's.
    The grid is mirror-symmetric in time — column `6 - c` at phase φ is column
    `c` at -φ — so columns 4–6 play the 2/1/0 profiles in reverse, which with
    the same delay is exactly the negated phase. */
export const HELIX_ANIMATION_CLASS = [
  "animate-[sidebar-v2-helix-0_linear_infinite]",
  "animate-[sidebar-v2-helix-1_linear_infinite]",
  "animate-[sidebar-v2-helix-2_linear_infinite]",
  "animate-[sidebar-v2-helix-3_linear_infinite]",
] as const;

/** Which profile a column plays, and whether backwards. */
export function helixColumnProfile(column: number): { index: number; reverse: boolean } {
  return column <= 3 ? { index: column, reverse: false } : { index: 6 - column, reverse: true };
}

const HELIX_CELLS = Array.from({ length: HELIX_GRID * HELIX_GRID }, (_, index) => {
  const column = index % HELIX_GRID;
  const row = Math.floor(index / HELIX_GRID);
  const profile = helixColumnProfile(column);
  return {
    id: `${column}:${row}`,
    column,
    row,
    x: column * (HELIX_CELL + HELIX_GAP),
    y: row * (HELIX_CELL + HELIX_GAP),
    lagSeconds: (row * HELIX_ROW_LAG) / HELIX_SPEED,
    animationClass: HELIX_ANIMATION_CLASS[profile.index],
    reverse: profile.reverse,
  };
});

/** CSS keyframes rather than the chip's per-frame canvas, so a working row
    costs no requestAnimationFrame loop — the same SVG opacity contract as the
    rain, seeded by the same per-thread offset. */
function SidebarV2WorkingHelix({ seed }: { seed: string }) {
  const offset = rainOffsetSeconds(seed);
  return (
    <svg
      aria-hidden
      className="block size-3 shrink-0"
      width={HELIX_SIZE}
      height={HELIX_SIZE}
      viewBox={`0 0 ${HELIX_BOX} ${HELIX_BOX}`}
    >
      {HELIX_CELLS.map((cell) => (
        <rect
          key={cell.id}
          x={cell.x}
          y={cell.y}
          width={HELIX_CELL}
          height={HELIX_CELL}
          className={cn(
            "fill-sidebar-v2-status-working",
            cell.animationClass,
            "motion-reduce:animate-none",
          )}
          style={
            {
              // Reduce Motion gets the chip's still frame (t = 0.6), taken at
              // this row's own offset so frozen rows differ from each other.
              opacity: helixAlpha(
                cell.column,
                (0.6 + offset) * HELIX_SPEED - cell.row * HELIX_ROW_LAG,
              ),
              animationDuration: `${HELIX_LOOP.toFixed(4)}s`,
              animationDirection: cell.reverse ? "reverse" : undefined,
              // Wrapped to (-loop, 0]: a positive delay would show the
              // still-frame opacity until the animation started.
              animationDelay: `${(
                ((((cell.lagSeconds - offset) % HELIX_LOOP) + HELIX_LOOP) % HELIX_LOOP) -
                HELIX_LOOP
              ).toFixed(4)}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

/** The working mark every surface draws — sidebar rows, the chat working row,
    the composer pill — in the form picked under Settings → Appearance. */
export function SidebarV2WorkingMark({ seed }: { seed: string }) {
  const [mark] = useForkWorkingMark();
  return mark === "helix" ? (
    <SidebarV2WorkingHelix seed={seed} />
  ) : (
    <SidebarV2WorkingRain seed={seed} />
  );
}

/** The settled counterpart to the rain. Done is the design's 10px dot; the
    two blocked-on-you states draw Phosphor's half-filled circle — the
    component set's own glyph, the left half hollow — and Failed the filled
    warning circle, so a colour-blind reader still tells "waiting on you"
    from "finished" and "broke" by form. The glyphs are 12px because Phosphor
    inks a circle on ~81% of its grid: that is the design's 9.75px, and the
    same visual weight as the 10px dot beside it. */
function SidebarV2StatusDot({ tone }: { tone: SidebarV2DotTone }) {
  return (
    <span aria-hidden className={cn(MARK_SLOT_CLASS, TONE_TEXT_CLASS[tone])}>
      {tone === "approval" || tone === "input" ? (
        <CircleHalfIcon className="size-3" />
      ) : tone === "failed" ? (
        <CircleAlertIcon weight="fill" className="size-3" />
      ) : (
        <span className="size-2.5 rounded-full bg-current" />
      )}
    </span>
  );
}

/** Idle — a thread with nothing pending. The same 10px circle as Done, but
    hollow and on the muted channel, per Noey (2026-09-09): "nothing here"
    reads from both the empty form and the hue, and the slot still holds a
    mark in every state instead of switching between a mark and a string. */
export function SidebarV2IdleMark() {
  return (
    <span aria-hidden className={MARK_SLOT_CLASS}>
      <span className="size-2.5 rounded-full border border-muted-foreground" />
    </span>
  );
}

/** Woke keeps a glyph rather than a dot: it is a *modifier* on an otherwise
    settled row, not one of the five statuses, and an amber dot would be
    indistinguishable from Approval — the one state it must never be confused
    with, since Approval is blocking and Woke is not. */
function SidebarV2WokeMark() {
  return (
    <span aria-hidden className={MARK_SLOT_CLASS}>
      <AlarmClockIcon className="size-2.5 text-sidebar-v2-status-approval" />
    </span>
  );
}

/** Draft — a thread that exists only client-side until its first send. A pencil
    says "unsent, still being written", which no hue in the settled palette can.
    Muted like the idle dot, since a draft is waiting on the user and not on
    the agent. */
/** @public — part of the status-mark set the draft-rows guard asserts on. */
export function SidebarV2DraftMark() {
  return (
    <span aria-hidden className={MARK_SLOT_CLASS}>
      <PenLineIcon className="size-2.5 text-muted-foreground/70" />
    </span>
  );
}

/** Monitoring — background watch work that is still alive but not actively
    turning. Same 10px dot in the same box as the other marks so the trailing
    column stays aligned; the slow white opacity breath (50% → 20%) is the
    signal, not a hue or a text label. Keyframes in `theme.custom.css` are
    duty-cycled and stepped so the compositor is not woken every vsync. */
export function SidebarV2MonitoringMark() {
  return (
    <span aria-hidden className={MARK_SLOT_CLASS}>
      <span data-fork-monitoring-pulse className="size-2.5 rounded-full" />
    </span>
  );
}

export type SidebarV2TopStatusMark =
  | { readonly label: string; readonly mark: "working"; readonly tone?: "working" }
  | { readonly label: string; readonly mark: "monitoring" }
  | { readonly label: string; readonly mark: "woke"; readonly tone?: SidebarV2DotTone }
  | { readonly label: string; readonly mark: "dot"; readonly tone: SidebarV2DotTone };

/** One mark renderer for card and slim rows so monitoring is never a second path. */
export function SidebarV2StatusMark(props: {
  readonly status: SidebarV2TopStatusMark | null;
  readonly seed: string;
  /** Card rows draw the idle dot; slim leaves the slot empty. Unpromoted
      drafts use the pencil as their idle glyph. */
  readonly idle?: "dot" | "empty" | "draft";
}) {
  const status = props.status;
  if (status === null) {
    if (props.idle === "draft") {
      return (
        <>
          <span className="sr-only">Draft</span>
          <SidebarV2DraftMark />
        </>
      );
    }
    if (props.idle === "dot") {
      return (
        <>
          <span className="sr-only">Idle</span>
          <SidebarV2IdleMark />
        </>
      );
    }
    return null;
  }
  return (
    <>
      <span role="status" className="sr-only">
        {status.label}
      </span>
      {status.mark === "working" ? (
        <SidebarV2WorkingMark seed={props.seed} />
      ) : status.mark === "monitoring" ? (
        <SidebarV2MonitoringMark />
      ) : status.mark === "woke" ? (
        <SidebarV2WokeMark />
      ) : (
        <SidebarV2StatusDot tone={status.tone} />
      )}
    </>
  );
}
