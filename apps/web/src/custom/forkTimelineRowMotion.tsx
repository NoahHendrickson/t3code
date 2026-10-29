/**
 * Transcript row motion — see `.fork/customizations.yaml#fork-transcript-row-motion`.
 *
 * Rows appended to the end of a live transcript (a response, the user's sent
 * message, the thinking line) fade in while sliding down a few pixels, and the
 * live activity line slides down to its new slot instead of jumping when a row
 * lands above it. Both run once per change on the compositor (transform/opacity
 * WAAPI), so nothing repaints continuously.
 *
 * The list is virtualized, so "new" cannot mean "just mounted": scrolling back
 * to old rows, or a container being recycled, mounts them again. A row enters
 * only when its id first appears in the data after the synced thread primed,
 * and only past the last row that was already there, which leaves "Load
 * earlier" history and mid-list group expansion still.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import type { MessagesTimelineRow } from "~/components/chat/MessagesTimeline.logic";

// The live activity line: the thinking row, the working row, and a running
// tool group. They reuse their ids across turns and sit at the tail.
function isLiveRow(row: MessagesTimelineRow): boolean {
  return (
    row.kind === "thinking" || row.kind === "working" || (row.kind === "work-live" && row.active)
  );
}
// Settled work rows replace the live line in place, so sliding them in would
// read as a flicker; only content that is genuinely new enters.
const ENTERING_ROW_KINDS: ReadonlySet<MessagesTimelineRow["kind"]> = new Set([
  "message",
  "proposed-plan",
]);

const MOTION_DURATION_MS = 220;
const MOTION_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const ENTER_OFFSET_PX = 6;
// LegendList places a new row at an estimated size and corrects it a frame or
// two later, so the live line can move more than once per insertion.
const INSERTION_WINDOW_MS = 500;
// Streaming adds a row or three per update. A bigger batch is a catch-up
// (reconnect, resync) the user did not watch arrive, so it lands still.
const MAX_ENTERING_ROWS = 6;

interface TimelineRowMotion {
  observe(rows: ReadonlyArray<MessagesTimelineRow>, identity: string, synced: boolean): void;
  takeEntrance(rowId: string): boolean;
  insertedRecently(): boolean;
}

export function createTimelineRowMotion(): TimelineRowMotion {
  let thread: {
    readonly identity: string;
    rows: ReadonlyArray<MessagesTimelineRow>;
    readonly known: Set<string>;
    liveIds: Set<string>;
  } | null = null;
  const entering = new Map<string, number>();
  let insertedAt = Number.NEGATIVE_INFINITY;

  return {
    observe(rows, identity, synced) {
      if (thread?.identity === identity && thread.rows === rows) return;
      // A cached or remembered snapshot shown while the thread syncs is not
      // what the user last saw arrive; prime from the synced rows instead.
      if (!synced || rows.length === 0) {
        if (!synced || thread?.identity !== identity) thread = null;
        return;
      }
      if (thread?.identity !== identity) {
        entering.clear();
        thread = { identity, rows, known: new Set(), liveIds: new Set() };
        for (const row of rows) (isLiveRow(row) ? thread.liveIds : thread.known).add(row.id);
        return;
      }

      // Rows only arrive at the tail, so walk back to the last settled row that
      // was already there and stop: this runs on every streamed update and must
      // not grow with the thread. An expanded live group puts its details row
      // after the live line; start from the live line so that row is skipped.
      let start = rows.length - 1;
      if (start > 0 && !isLiveRow(rows[start]!) && isLiveRow(rows[start - 1]!)) start -= 1;
      const liveIds = new Set<string>();
      const arrived: MessagesTimelineRow[] = [];
      for (let index = start; index >= 0; index -= 1) {
        const row = rows[index]!;
        if (isLiveRow(row)) {
          liveIds.add(row.id);
          if (!thread.liveIds.has(row.id)) arrived.push(row);
          continue;
        }
        if (thread.known.has(row.id)) break;
        thread.known.add(row.id);
        arrived.push(row);
      }
      thread.rows = rows;
      thread.liveIds = liveIds;
      if (arrived.length === 0 || arrived.length > MAX_ENTERING_ROWS) return;

      const now = performance.now();
      insertedAt = now;
      for (const row of arrived) {
        if (isLiveRow(row) || ENTERING_ROW_KINDS.has(row.kind)) entering.set(row.id, now);
      }
    },
    takeEntrance(rowId) {
      const at = entering.get(rowId);
      if (at === undefined) return false;
      entering.delete(rowId);
      // A row that stayed off-screen past its moment arrives still.
      return performance.now() - at < INSERTION_WINDOW_MS;
    },
    insertedRecently() {
      return performance.now() - insertedAt < INSERTION_WINDOW_MS;
    },
  };
}

export function useTimelineRowMotion(
  rows: ReadonlyArray<MessagesTimelineRow>,
  identity: string,
  synced: boolean,
): TimelineRowMotion {
  const [motion] = useState(createTimelineRowMotion);
  // Observed during render, like useStableRows beside it, so a row frame that
  // mounts in the same commit still finds its entrance. Repeat renders of one
  // snapshot return early, so a discarded or doubled render changes nothing.
  motion.observe(rows, identity, synced);
  return motion;
}

/**
 * Where the next slide starts, in px from the container's new `top`, so the
 * live line stays where it is drawn. A running slide (eased `progress` of a
 * `from → 0` translate) continues from its current offset.
 */
export function slideStartOffset(
  running: { readonly from: number; readonly progress: number } | null,
  delta: number,
): number {
  return (running ? running.from * (1 - running.progress) : 0) - delta;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Stands in for the row's `messages-timeline-row-frame` div. */
export function ForkTimelineRowFrame({
  motion,
  row,
  children,
  ...frameProps
}: {
  motion: TimelineRowMotion;
  row: MessagesTimelineRow;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">) {
  const props = { motion, row, children };
  const rowId = props.row.id;
  const live = isLiveRow(props.row);
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (motion.takeEntrance(rowId) && !prefersReducedMotion()) {
      frame.animate(
        [
          { opacity: 0, transform: `translateY(-${ENTER_OFFSET_PX}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: MOTION_DURATION_MS, easing: MOTION_EASING },
      );
    }
    // LegendList keys its absolutely positioned container by row id (the
    // timeline leaves recycleItems off) and moves it through `style.top`. The
    // slide runs on that container because it paints with `contain: paint`,
    // which would clip a transform on the frame.
    const container = frame.parentElement;
    if (!live || !container) return;
    let lastTop = Number.parseFloat(container.style.top);
    let slide: { animation: Animation; from: number } | null = null;
    const observer = new MutationObserver(() => {
      const top = Number.parseFloat(container.style.top);
      const delta = top - lastTop;
      lastTop = top;
      // Rejects LegendList parking an off-screen container millions of pixels
      // away, and moves too long to read as motion.
      if (!(Math.abs(delta) > 0) || Math.abs(delta) > window.innerHeight) return;
      // Only an insertion starts a slide, but any correction while one runs
      // (LegendList re-measuring the new row) rebases it so the line holds its
      // drawn position. The offset comes off the eased progress, which avoids
      // getComputedStyle forcing a style recalc.
      if (!slide && (delta < 0 || !motion.insertedRecently() || prefersReducedMotion())) return;
      const from = slideStartOffset(
        slide && {
          from: slide.from,
          progress: slide.animation.effect?.getComputedTiming().progress ?? 1,
        },
        delta,
      );
      slide?.animation.cancel();
      const animation = container.animate(
        [{ transform: `translateY(${from}px)` }, { transform: "none" }],
        { duration: MOTION_DURATION_MS, easing: MOTION_EASING },
      );
      slide = { animation, from };
      animation.onfinish = () => {
        slide = null;
      };
    });
    observer.observe(container, { attributes: true, attributeFilter: ["style"] });
    return () => {
      observer.disconnect();
      slide?.animation.cancel();
    };
  }, [motion, rowId, live]);

  return (
    <div ref={frameRef} className="messages-timeline-row-frame" {...frameProps}>
      {props.children}
    </div>
  );
}
