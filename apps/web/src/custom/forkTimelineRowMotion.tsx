/**
 * Transcript row motion — see `.fork/customizations.yaml#fork-transcript-row-motion`.
 *
 * Rows appended to the end of a live transcript (a response, the user's sent
 * message, the thinking line) fade in while sliding down a few pixels, and the
 * trailing live activity line slides down to its new slot instead of jumping
 * when a row lands above it. Both run once per change on the compositor
 * (transform/opacity WAAPI), so nothing repaints continuously.
 *
 * The list is virtualized, so "new" cannot mean "just mounted": scrolling back
 * to old rows, or a container being recycled, mounts them again. A row enters
 * only when its id first appears in the data after the thread was primed, and
 * only past the last row that was already there, which leaves "Load earlier"
 * history and mid-list group expansion still.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { MessagesTimelineRow } from "~/components/chat/MessagesTimeline.logic";

// Trailing rows that move when a row is inserted above them. Mirrors
// LIVE_ACTIVITY_ROW_ID and the working row id in MessagesTimeline.logic.ts.
const TRAILING_LIVE_ROW_IDS: ReadonlySet<string> = new Set([
  "live-activity-row",
  "working-indicator-row",
]);
// Settled work rows replace the live line in place, so sliding them in would
// read as a flicker; only content that is genuinely new enters.
const ENTERING_ROW_KINDS: ReadonlySet<MessagesTimelineRow["kind"]> = new Set([
  "message",
  "thinking",
  "working",
  "proposed-plan",
]);

const MOTION_DURATION_MS = 220;
const MOTION_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const ENTER_OFFSET_PX = 6;
// LegendList places a new row at an estimated size and corrects it a frame or
// two later, so the live line can move more than once per insertion.
const INSERTION_WINDOW_MS = 500;

interface TimelineRowMotion {
  observe(rows: ReadonlyArray<MessagesTimelineRow>, identity: string | null): void;
  takeEntrance(rowId: string): boolean;
  insertedRecently(): boolean;
}

export function createTimelineRowMotion(): TimelineRowMotion {
  let identity: string | null | undefined;
  let primed = false;
  let known = new Set<string>();
  const entering = new Map<string, number>();
  const seenLiveRowIds = new Set<string>();
  let insertedAt = Number.NEGATIVE_INFINITY;

  return {
    observe(rows, nextIdentity) {
      if (nextIdentity !== identity) {
        identity = nextIdentity;
        primed = false;
        entering.clear();
      }
      // The first non-empty snapshot is the thread loading, not rows arriving.
      if (!primed) {
        if (rows.length === 0) return;
        primed = true;
        known = new Set(rows.map((row) => row.id));
        return;
      }
      // Rows only arrive at the tail, so walk back to the last settled row that
      // was already there and stop: this runs on every streamed update and
      // must not grow with the thread.
      const now = performance.now();
      seenLiveRowIds.clear();
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index]!;
        const isLiveRow = TRAILING_LIVE_ROW_IDS.has(row.id);
        if (isLiveRow) seenLiveRowIds.add(row.id);
        if (known.has(row.id)) {
          if (isLiveRow) continue;
          break;
        }
        known.add(row.id);
        insertedAt = now;
        if (isLiveRow || ENTERING_ROW_KINDS.has(row.kind)) entering.set(row.id, now);
      }
      // The live rows reuse their ids every turn; forget one once it leaves the
      // tail so the next turn's line enters too. A row behind the stop can only
      // reach the tail again if everything after it vanishes.
      for (const id of TRAILING_LIVE_ROW_IDS) {
        if (!seenLiveRowIds.has(id)) known.delete(id);
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
  identity: string | null,
): TimelineRowMotion {
  const [motion] = useState(createTimelineRowMotion);
  // Rows reach their containers a commit after the list renders, so this has
  // run by the time a new row's own layout effect asks about its entrance.
  useLayoutEffect(() => {
    motion.observe(rows, identity);
  }, [motion, rows, identity]);
  return motion;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Stands in for the row's `messages-timeline-row-frame` div. */
export function ForkTimelineRowFrame(props: {
  motion: TimelineRowMotion;
  rowId: string;
  children: ReactNode;
}) {
  const { motion, rowId } = props;
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
    // LegendList keys its absolutely positioned container by row id and moves
    // it through `style.top`. The slide runs on that container because it
    // paints with `contain: paint`, which would clip a transform on the frame.
    const container = frame.parentElement;
    if (!TRAILING_LIVE_ROW_IDS.has(rowId) || !container) return;
    let lastTop = Number.parseFloat(container.style.top);
    let slide: { animation: Animation; from: number } | null = null;
    const observer = new MutationObserver(() => {
      const top = Number.parseFloat(container.style.top);
      const delta = top - lastTop;
      lastTop = top;
      // Off-screen parking and re-entry swing `top` by millions of pixels.
      if (!(delta > 0) || delta > window.innerHeight) return;
      if (!motion.insertedRecently() || prefersReducedMotion()) return;
      // Continue from where a running slide is drawn. Reading the offset off
      // the eased progress avoids getComputedStyle forcing a style recalc.
      const progress = slide?.animation.effect?.getComputedTiming().progress ?? 1;
      const from = (slide ? slide.from * (1 - progress) : 0) - delta;
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
  }, [motion, rowId]);

  return (
    <div ref={frameRef} className="messages-timeline-row-frame">
      {props.children}
    </div>
  );
}
