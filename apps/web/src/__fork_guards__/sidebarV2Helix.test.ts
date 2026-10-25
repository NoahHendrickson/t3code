// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-working-mark`.
 *
 * The helix keyframes are a generated table like the rain's, so this re-derives
 * every stop from `helixAlpha` and fails if the committed CSS drifts. It also
 * pins the Appearance row that switches between the two marks, since a sync
 * that takes upstream's SettingsPanels compiles clean without it.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { HELIX_ANIMATION_CLASS, helixAlpha } from "~/custom/SidebarV2StatusIndicator";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

const COLUMNS = 7;
const ROUNDING_TOLERANCE = 5e-4;

interface Stop {
  readonly percent: number;
  readonly opacity: number;
}

function keyframeStops(css: string, column: number): Stop[] {
  const block = new RegExp(String.raw`@keyframes sidebar-v2-helix-${column} \{([\s\S]*?)\n\}`).exec(
    css,
  );
  if (block === null) throw new Error(`no @keyframes sidebar-v2-helix-${column}`);
  return [...(block[1] ?? "").matchAll(/([\d.]+)%\s*\{\s*opacity:\s*([\d.]+);/g)].map((match) => ({
    percent: Number(match[1]),
    opacity: Number(match[2]),
  }));
}

/** A keyframe's progress is one full twist of the strand phase. */
function curve(column: number, percent: number): number {
  return helixAlpha(column, (percent / 100) * 2 * Math.PI);
}

function interpolate(stops: Stop[], percent: number): number {
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (previous === undefined || current === undefined) break;
    if (percent <= current.percent) {
      const t = (percent - previous.percent) / (current.percent - previous.percent);
      return previous.opacity + (current.opacity - previous.opacity) * t;
    }
  }
  return stops.at(-1)?.opacity ?? 0;
}

describe("fork guard: sidebar-v2 helix keyframes", () => {
  const css = read("src/theme.custom.css");

  it("backs every column class with a keyframe", () => {
    expect(HELIX_ANIMATION_CLASS).toHaveLength(COLUMNS);
    for (const className of HELIX_ANIMATION_CLASS) {
      const name = /animate-\[([a-z0-9-]+)_/.exec(className)?.[1];
      expect(name).toBeTruthy();
      expect(css).toContain(`@keyframes ${name} {`);
    }
    expect(css).not.toContain(`@keyframes sidebar-v2-helix-${COLUMNS} {`);
  });

  it("re-derives every stop from helixAlpha", () => {
    const drifted: string[] = [];
    let samples = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const stops = keyframeStops(css, column);
      expect(stops[0]?.percent).toBe(0);
      expect(stops.at(-1)?.percent).toBe(100);
      for (const stop of stops) {
        samples++;
        const expected = curve(column, stop.percent);
        if (Math.abs(expected - stop.opacity) > ROUNDING_TOLERANCE) {
          drifted.push(
            `helix-${column} @ ${stop.percent}%: css ${stop.opacity}, curve ${expected}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
    expect(samples).toBeGreaterThan(150);
  });

  it("tracks the curve once the browser interpolates between stops", () => {
    // The 0.08 cutoff is a hard step the table can only approximate across one
    // 0.25% sample, so the max error is dominated by those edges; the mean is
    // what says the motion is intact.
    let sum = 0;
    let count = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const stops = keyframeStops(css, column);
      for (let step = 0; step <= 4000; step++) {
        const percent = (step / 4000) * 100;
        sum += Math.abs(interpolate(stops, percent) - curve(column, percent));
        count++;
      }
    }
    expect(sum / count).toBeLessThan(0.01);
  });
});

describe("fork guard: working indicator setting", () => {
  const panels = read("src/components/settings/SettingsPanels.tsx");

  it("offers the switch under Appearance and resets it with Restore defaults", () => {
    expect(panels).toContain('title="Working indicator"');
    expect(panels).toContain('["Working indicator"]');
    expect(panels).toContain("setWorkingMark(DEFAULT_FORK_WORKING_MARK)");
  });
});
