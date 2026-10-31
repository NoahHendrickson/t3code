// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-working-mark`.
 *
 * Both working marks play a baked film: one transform animation per strip,
 * which the compositor runs off the main thread. Per-cell opacity keyframes
 * cost about a CPU core with a handful of working threads on screen, so this
 * pins the film. It also pins the Appearance row that switches between the
 * two marks, since a sync that takes upstream's SettingsPanels compiles clean
 * without it.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { helixAlpha } from "~/custom/SidebarV2StatusIndicator";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

describe("fork guard: working mark film", () => {
  const css = read("src/theme.custom.css");
  const marks = read("src/custom/SidebarV2StatusIndicator.tsx");

  it("steps one transform keyframe instead of animating cells", () => {
    expect(css).toMatch(
      /@keyframes sidebar-v2-film \{[^@]*from \{\s*transform: translateY\(0\);\s*\}\s*to \{\s*transform: translateY\(-100%\);\s*\}\s*\}/u,
    );
    expect(css).not.toMatch(/@keyframes sidebar-v2-(rain|helix)-/u);
    expect(marks).toContain("animate-[sidebar-v2-film_linear_infinite] motion-reduce:animate-none");
    expect(marks).toContain("animationTimingFunction: `steps(${props.frames})`");
    expect(marks).not.toMatch(/<rect\s+key=/u);
  });

  it("loops the helix film every half twist", () => {
    // The film bakes phase 0..π once; a curve that did not repeat every π
    // would jump at the loop seam.
    for (let column = 0; column < 7; column++) {
      for (let step = 0; step < 400; step++) {
        const phase = (step / 400) * 2 * Math.PI;
        expect(helixAlpha(column, phase + Math.PI)).toBeCloseTo(helixAlpha(column, phase), 9);
      }
    }
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
