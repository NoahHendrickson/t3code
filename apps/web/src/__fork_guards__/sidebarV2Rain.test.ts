// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * The rain keyframes carry a "GENERATED, do not hand-edit" banner, but there is
 * no generator script to re-run — a ~560-line table nobody can regenerate is a
 * table nobody can verify. This file closes that: it re-derives every stop from
 * the Swift constants transcribed in `SidebarV2StatusIndicator` and fails if the
 * committed CSS has drifted from them.
 *
 * That makes the banner true in the only sense that matters. Editing the CSS by
 * hand goes red here; changing the motion means changing the constants and
 * regenerating, which this test then re-checks against.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";
import {
  RAIN_ANIMATION_CLASS,
  RAIN_SPAN,
  dropAlpha,
  rainAlpha,
  rainOffsetSeconds,
} from "~/custom/SidebarV2StatusIndicator";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

const ROWS = 5;
/** Opacity is written to three decimals, so a faithful stop is within half a
    unit in the last place. Anything looser would let a real drift through. */
const ROUNDING_TOLERANCE = 5e-4;

interface Stop {
  readonly percent: number;
  readonly opacity: number;
}

/** Pull one row's stops out of the committed stylesheet. */
function keyframeStops(css: string, row: number): Stop[] {
  const block = new RegExp(String.raw`@keyframes sidebar-v2-rain-${row} \{([\s\S]*?)\n\}`).exec(
    css,
  );
  if (block === null) throw new Error(`no @keyframes sidebar-v2-rain-${row}`);
  return [...(block[1] ?? "").matchAll(/([\d.]+)%\s*\{\s*opacity:\s*([\d.]+);/g)].map((match) => ({
    percent: Number(match[1]),
    opacity: Number(match[2]),
  }));
}

/** Where this row's drop head sits at a given point in the loop. The whole
    decomposition rests on this: one clock per column advances `head` linearly
    across the span, so a fixed row only ever sees `head - row`. */
function headOffset(percent: number, row: number): number {
  return (percent / 100) * RAIN_SPAN - 1.5 - row;
}

describe("fork guard: sidebar-v2 rain keyframes", () => {
  const css = read("src/theme.custom.css");

  it("declares one keyframe per grid row", () => {
    for (let row = 0; row < ROWS; row++) {
      expect(css).toContain(`@keyframes sidebar-v2-rain-${row} {`);
    }
    // A sixth would mean the grid grew without the component following.
    expect(css).not.toContain(`@keyframes sidebar-v2-rain-${ROWS} {`);
  });

  it("keeps every class the component names backed by a keyframe", () => {
    expect(RAIN_ANIMATION_CLASS).toHaveLength(ROWS);
    for (const className of RAIN_ANIMATION_CLASS) {
      // `\w` would match the `_` separating name from timing, so spell the
      // keyframe-name charset out instead.
      const name = /animate-\[([a-z0-9-]+)_/.exec(className)?.[1];
      expect(name).toBeTruthy();
      expect(css).toContain(`@keyframes ${name} {`);
    }
  });

  it("re-derives every stop from the Swift alpha curve", () => {
    const drifted: string[] = [];
    let samples = 0;
    for (let row = 0; row < ROWS; row++) {
      for (const stop of keyframeStops(css, row)) {
        samples++;
        const expected = rainAlpha(headOffset(stop.percent, row));
        if (Math.abs(expected - stop.opacity) > ROUNDING_TOLERANCE) {
          drifted.push(
            `rain-${row} @ ${stop.percent}%: css ${stop.opacity}, curve ${expected.toFixed(6)}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
    // Guards against the regex silently matching nothing and passing vacuously.
    expect(samples).toBeGreaterThan(150);
  });

  it("peaks exactly where the drop head crosses each row", () => {
    for (let row = 0; row < ROWS; row++) {
      const stops = keyframeStops(css, row);
      const peak = stops.find((stop) => stop.opacity === 1);
      expect(peak, `rain-${row} has no full-opacity stop`).toBeTruthy();
      // head = p*SPAN - 1.5 - row = 0  →  p = (row + 1.5) / SPAN
      expect(peak?.percent).toBeCloseTo(((row + 1.5) / RAIN_SPAN) * 100, 1);
    }
  });

  it("runs a full loop, monotonically, from 0% to 100%", () => {
    for (let row = 0; row < ROWS; row++) {
      const stops = keyframeStops(css, row);
      expect(stops[0]?.percent).toBe(0);
      expect(stops.at(-1)?.percent).toBe(100);
      const percents = stops.map((stop) => stop.percent);
      expect(percents).toEqual([...percents].sort((a, b) => a - b));
      expect(new Set(percents).size).toBe(percents.length);
    }
  });

  it("samples the curve unclamped, unlike the still frame", () => {
    // dropAlpha applies Swift's 0.02 cutoff; the table must not, or CSS would
    // interpolate into a visible step where the tail should just fade out.
    // If this ever flips, the tail of every column gains a hard edge.
    const tail = keyframeStops(css, 0).filter((stop) => stop.opacity > 0 && stop.opacity < 0.02);
    expect(tail.length).toBeGreaterThan(0);
    expect(dropAlpha(4.9)).toBe(0);
    expect(rainAlpha(4.9)).toBeGreaterThan(0);
  });

  it("keeps the keyframes out of the @theme block Tailwind prunes", () => {
    // Tailwind v4 drops `@keyframes` declared inside `@theme` unless it finds a
    // generated `animation` declaration naming them. Living in the fork's own
    // stylesheet takes that failure mode off the table entirely — and keeps the
    // 560-line table out of index.css, the second-highest-churn file in the repo.
    expect(read("src/index.css")).not.toContain("sidebar-v2-rain");
  });
});

describe("fork guard: sidebar-v2 rain phase offsets", () => {
  it("is deterministic per thread key", () => {
    expect(rainOffsetSeconds("thread-abc")).toBe(rainOffsetSeconds("thread-abc"));
  });

  it("stays inside one loop's worth of rewind", () => {
    for (const seed of ["", "a", "thread-1", "🙂", "x".repeat(200)]) {
      const offset = rainOffsetSeconds(seed);
      expect(Number.isFinite(offset)).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(32);
    }
  });

  it("avalanches sequential ids apart", () => {
    // The reason the murmur3 finalizer is there: plain FNV leaves keys that
    // differ only in the last character within a second of each other, and the
    // rows then read as one synchronised block. Sequential ids are exactly the
    // shape real thread keys take.
    const offsets = Array.from({ length: 12 }, (_, index) => rainOffsetSeconds(`thread-${index}`));
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        expect(Math.abs((offsets[i] ?? 0) - (offsets[j] ?? 0))).toBeGreaterThan(0.25);
      }
    }
  });
});
