// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-working-mark`.
 *
 * The helix keyframes are a generated table, and this file holds the
 * generator: it rebuilds every block from `helixAlpha` and fails, printing the
 * expected CSS, if the committed table drifts. It also pins the Appearance row
 * that switches between the two marks, since a sync that takes upstream's
 * SettingsPanels compiles clean without it.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";
import {
  HELIX_ANIMATION_CLASS,
  helixAlpha,
  helixColumnProfile,
} from "~/custom/SidebarV2StatusIndicator";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

const COLUMNS = 7;
const PROFILES = 4;

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

/** A keyframe's progress is half a twist of the strand phase. */
function curve(column: number, percent: number): number {
  return helixAlpha(column, (percent / 100) * Math.PI);
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

/** The generator for the committed table: sample the curve every 0.25%, round
    to three decimals, then keep only the stops linear interpolation needs to
    stay within 0.01 opacity (Douglas–Peucker). Changing the helix means
    changing `helixAlpha`, running this file, and pasting the blocks it prints. */
function generateKeyframes(profile: number): string {
  const step = 0.25;
  const tolerance = 0.01;
  const points = Array.from({ length: 100 / step + 1 }, (_, index) => ({
    percent: index * step,
    opacity: Math.round(curve(profile, index * step) * 1000) / 1000,
  }));
  const keep = new Set([0, points.length - 1]);
  const thin = (from: number, to: number): void => {
    const start = points[from];
    const end = points[to];
    if (start === undefined || end === undefined) return;
    let worst = -1;
    let error = tolerance;
    for (let index = from + 1; index < to; index++) {
      const point = points[index];
      if (point === undefined) continue;
      const t = (point.percent - start.percent) / (end.percent - start.percent);
      const distance = Math.abs(start.opacity + (end.opacity - start.opacity) * t - point.opacity);
      if (distance > error) {
        error = distance;
        worst = index;
      }
    }
    if (worst < 0) return;
    keep.add(worst);
    thin(from, worst);
    thin(worst, to);
  };
  thin(0, points.length - 1);
  const stops = [...keep]
    .toSorted((a, b) => a - b)
    .map((index) => points[index])
    .filter((point) => point !== undefined)
    .map((point) => `  ${point.percent}% {\n    opacity: ${point.opacity};\n  }`);
  return `@keyframes sidebar-v2-helix-${profile} {\n${stops.join("\n")}\n}`;
}

describe("fork guard: sidebar-v2 helix keyframes", () => {
  const css = read("src/theme.custom.css");

  it("backs every profile class with a keyframe", () => {
    expect(HELIX_ANIMATION_CLASS).toHaveLength(PROFILES);
    for (const className of HELIX_ANIMATION_CLASS) {
      const name = /animate-\[([a-z0-9-]+)_/.exec(className)?.[1];
      expect(name).toBeTruthy();
      expect(css).toContain(`@keyframes ${name} {`);
    }
    expect(css).not.toContain(`@keyframes sidebar-v2-helix-${PROFILES} {`);
  });

  it("commits exactly what the generator produces", () => {
    for (let profile = 0; profile < PROFILES; profile++) {
      expect(css, `sidebar-v2-helix-${profile} drifted; paste the expected block`).toContain(
        generateKeyframes(profile),
      );
    }
  });

  it("draws every column's full twist from the stored half-twist profiles", () => {
    // End to end over a whole 2π twist: each column plays its mapped profile,
    // backwards for 4–6, looping every π. This is what pins both shortcuts —
    // the π period and the column mirror — against the reference curve. The
    // 0.08 cutoff is a hard step the table can only approximate across one
    // 0.25% sample, so the mean, not the max, says the motion is intact.
    let sum = 0;
    let count = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const { index, reverse } = helixColumnProfile(column);
      const stops = keyframeStops(css, index);
      for (let step = 0; step <= 8000; step++) {
        const phase = (step / 8000) * 2 * Math.PI;
        const progress = ((phase / Math.PI) * 100) % 100;
        const shown = interpolate(stops, reverse ? 100 - progress : progress);
        sum += Math.abs(shown - helixAlpha(column, phase));
        count++;
      }
    }
    expect(sum / count).toBeLessThan(0.01);
  });
});

describe("fork guard: working indicator setting", () => {
  const panels = read("src/components/settings/SettingsPanels.tsx");
  const appearance = read("src/components/settings/AppearanceSettingsPanel.tsx");

  it("offers the switch under Appearance and resets it with Restore defaults", () => {
    expect(appearance).toContain('title="Working indicator"');
    expect(panels).toContain('["Working indicator"]');
    expect(panels).toContain("setWorkingMark(DEFAULT_FORK_WORKING_MARK)");
  });
});
