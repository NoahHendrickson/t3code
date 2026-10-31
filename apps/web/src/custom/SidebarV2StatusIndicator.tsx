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
// rounded at 28% of their size. Native units land at 10.45×18.05; the mark
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

const RAIN_SPAN = ROWS + 3;

/** The alpha curve every drop follows: a bright head, an exponential trail
    above it, a sharp falloff below. Every frame of the rain film samples it. */
function rainAlpha(dy: number): number {
  return dy >= 0 ? Math.exp(-dy * 0.8) : Math.exp(dy * 8);
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

const WIDTH = (COLS - 1) * PITCH + CELL;
const HEIGHT = (ROWS - 1) * PITCH + CELL;
/** Drawn width: fit the 14px rain box on the tall axis, keep the native aspect. */
const DRAW_WIDTH = (WIDTH / HEIGHT) * SLOT;

/** Reduce Motion gets a still frame rather than nothing at all, matching the
    native view, which renders a `t = 0.6` snapshot instead of hiding the
    indicator. */
const STILL_SECONDS = 0.6;

interface FilmCell {
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
}

/** One loop of a mark baked into an SVG mask, frame under frame. `cell` holds
    the shared cell's rect attributes; `frame(index)` places the lit cells of
    that frame in frame-local units. Opacities are sampled at each frame's midpoint, so a
    stepped frame is never more than half a frame early or late. Stretched
    (`preserveAspectRatio="none"`) because layout rounds the strip to 1/64px,
    and an aspect-kept fit would drift the deeper frames off the clip. */
function bakeFilm(
  width: number,
  frameHeight: number,
  frames: number,
  cell: string,
  frame: (index: number) => Iterable<FilmCell>,
): string {
  let body = "";
  for (let index = 0; index < frames; index++) {
    for (const { x, y, opacity } of frame(index)) {
      if (opacity < 0.002) continue;
      body += `<use href='#c' x='${x.toFixed(3)}' y='${(index * frameHeight + y).toFixed(3)}' opacity='${opacity.toFixed(3)}'/>`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${frameHeight * frames}' preserveAspectRatio='none'><defs><rect id='c' ${cell}/></defs>${body}</svg>`;
  // A blob URL rather than a data URI: every strip names the film in its
  // inline style, and a data URI would copy the whole SVG into each one.
  return `url("${URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))}")`;
}

/** One strip of a working mark: the baked film, coloured by the status token
    through the mask, stepped by a single compositor transform animation.
    `startSeconds` is how far into its `period` the strip is at time zero. The
    keyframe name stays in a class so `motion-reduce:animate-none` can still
    win (a class cannot override an inline `animation-name`); the inline
    transform is the still frame left once it does. */
function FilmStrip(props: {
  readonly film: string;
  readonly frames: number;
  readonly frameHeight: number;
  readonly period: number;
  readonly startSeconds: number;
  readonly maskSize?: string;
  readonly maskPosition?: string;
}) {
  const start = ((props.startSeconds % props.period) + props.period) % props.period;
  const still =
    Math.floor(
      ((((props.startSeconds + STILL_SECONDS) % props.period) + props.period) % props.period) *
        (props.frames / props.period),
    ) % props.frames;
  return (
    <span
      className="absolute inset-x-0 top-0 bg-sidebar-v2-status-working animate-[sidebar-v2-film_linear_infinite] motion-reduce:animate-none"
      style={{
        height: props.frameHeight * props.frames,
        maskImage: props.film,
        maskSize: props.maskSize ?? "100% 100%",
        maskPosition: props.maskPosition,
        maskRepeat: "no-repeat",
        transform: `translateY(${-still * props.frameHeight}px)`,
        animationDuration: `${props.period.toFixed(4)}s`,
        animationTimingFunction: `steps(${props.frames})`,
        animationDelay: `${(-start).toFixed(4)}s`,
      }}
    />
  );
}

/** Per loop of each column's fall: ~37 fps on the slowest column, ~68 on the
    fastest. */
const RAIN_FRAMES = 120;

/** Every column runs the same five-row fall at its own speed, so one film of a
    single column serves all three, each strip masked at its column's x. */
let rainFilm: string | undefined;
function getRainFilm(): string {
  rainFilm ??= bakeFilm(
    CELL,
    HEIGHT,
    RAIN_FRAMES,
    `width='${CELL}' height='${CELL}' rx='${(CELL * 0.28).toFixed(3)}'`,
    (index) =>
      Array.from({ length: ROWS }, (_, row) => ({
        x: 0,
        y: row * PITCH,
        opacity: rainAlpha(((index + 0.5) / RAIN_FRAMES) * RAIN_SPAN - 1.5 - row),
      })),
  );
  return rainFilm;
}

/** Cells baked into a mask rather than positioned elements on purpose. A
    2.85px box on a 3.8px pitch never lands on a device-pixel boundary, and
    browsers snap element backgrounds to whole pixels — so the cells would
    paint at visibly different widths depending on each one's subpixel offset.
    The SVG keeps the fractional geometry and antialiases it, which is what the
    native Canvas does too, so every drop stays exactly square. */
function SidebarV2WorkingRain({ seed }: { seed: string }) {
  const offset = rainOffsetSeconds(seed);
  const film = getRainFilm();
  return (
    <span
      aria-hidden
      className="relative block h-[14px] shrink-0 overflow-hidden"
      style={{ width: DRAW_WIDTH }}
    >
      {COLUMNS.map((column, col) => (
        <FilmStrip
          key={column.phase}
          film={film}
          frames={RAIN_FRAMES}
          frameHeight={SLOT}
          period={RAIN_SPAN / column.speed}
          startSeconds={column.phase / column.speed + offset}
          maskSize={`${(CELL / WIDTH) * 100}% 100%`}
          // Percentages align the mask's own n% point with the strip's, which
          // for cells on a uniform pitch puts column `col` at col / (COLS - 1).
          maskPosition={`${(col / (COLS - 1)) * 100}% 0`}
        />
      ))}
    </span>
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
/** One film loop. The curve repeats every half twist (π, not 2π): moving the
    phase by π swaps the two strands along with their depth weights, which
    leaves the `max` in `helixAlpha` unchanged. */
const HELIX_LOOP = Math.PI / HELIX_SPEED;
/** ~61 fps over the loop. */
const HELIX_FRAMES = 60;

/** The drawn opacity of a cell in `column` at strand phase `phase`. Each strand
    lights the cells nearest it with an exponential falloff, dimmed while it is
    on the far side of the twist; cells under 0.08 are not drawn at all, and lit
    ones sit on a 10% floor — the chip's `cellN`. Every row runs the same curve,
    only phase-shifted. */
export function helixAlpha(column: number, phase: number): number {
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  const alpha = Math.max(
    Math.exp(-Math.abs(column - (3 + 2.45 * sin)) * 2.4) * (0.4 + 0.6 * (0.5 + 0.5 * cos)),
    Math.exp(-Math.abs(column - (3 - 2.45 * sin)) * 2.4) * (0.4 + 0.6 * (0.5 - 0.5 * cos)),
  );
  return alpha > 0.08 ? 0.1 + 0.9 * alpha : 0;
}

let helixFilm: string | undefined;
function getHelixFilm(): string {
  helixFilm ??= bakeFilm(
    HELIX_BOX,
    HELIX_BOX,
    HELIX_FRAMES,
    `width='${HELIX_CELL.toFixed(3)}' height='${HELIX_CELL.toFixed(3)}'`,
    (index) =>
      Array.from({ length: HELIX_GRID * HELIX_GRID }, (_, cell) => {
        const column = cell % HELIX_GRID;
        const row = Math.floor(cell / HELIX_GRID);
        return {
          x: column * (HELIX_CELL + HELIX_GAP),
          y: row * (HELIX_CELL + HELIX_GAP),
          opacity: helixAlpha(
            column,
            ((index + 0.5) / HELIX_FRAMES) * Math.PI - row * HELIX_ROW_LAG,
          ),
        };
      }),
  );
  return helixFilm;
}

/** A baked film rather than the chip's per-frame canvas, so a working row
    costs no requestAnimationFrame loop — seeded by the rain's per-thread
    offset. */
function SidebarV2WorkingHelix({ seed }: { seed: string }) {
  return (
    <span aria-hidden className="relative block size-3 shrink-0 overflow-hidden">
      <FilmStrip
        film={getHelixFilm()}
        frames={HELIX_FRAMES}
        frameHeight={HELIX_SIZE}
        period={HELIX_LOOP}
        startSeconds={rainOffsetSeconds(seed)}
      />
    </span>
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
    <span aria-hidden data-fork-idle-mark="" className={MARK_SLOT_CLASS}>
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
      <PenLineIcon data-fork-draft-pencil="" className="size-2.5 text-muted-foreground/70" />
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
