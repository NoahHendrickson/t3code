/**
 * Sidebar stage artwork — see `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Painted from a PNG rather than generated. Two of them, chosen by `tone`:
 * green for a release build, orange for a dev build. `dev` is the default so
 * upstream's own Dev-gated call sites — the composer send button and the auth
 * screen — get the dev artwork without having to pass anything.
 *
 * An earlier revision reproduced the pattern as an 8x8 Bayer dither in SVG,
 * which scaled cleanly but was only ever an approximation: it flattened the
 * reference's diagonal ramp to a vertical one, because a horizontal component
 * restarts at every pattern tile and reads as banding.
 *
 * `cover` rather than `repeat`, and that is the whole reason this is a `div`
 * with a background instead of a tiled `<pattern>`: both sources ramp
 * diagonally from dark at the bottom-left to light at the top-right, so any
 * tiling puts a light edge against a dark one and draws a seam at every repeat.
 * Covering crops instead, which costs the extremes of the ramp on a short band
 * but keeps the gradient continuous across the whole header.
 *
 * `image-rendering` is deliberately left at the default. Both sources are
 * screenshots rather than clean exports — the green is only ~30% flat colour,
 * the orange ~76% — so `pixelated` would sharpen the resampling artefacts along
 * with the dots. The green is the weaker of the two at 300x117 and would
 * benefit most from a higher-resolution re-export; that is a file swap, not a
 * code change.
 */
import devDitherUrl from "./assets/sidebar-stage-dither-dev.png";
import releaseDitherUrl from "./assets/sidebar-stage-dither.png";

/** Which build the artwork is standing in for. The two share a ramp direction
    and a cell rhythm, so they read as one family; only the hue separates them,
    which is the whole point — you should be able to tell a dev build from a
    release build across the room without reading anything. */
export type SidebarStageDitherTone = "release" | "dev";

const DITHER_URL: Record<SidebarStageDitherTone, string> = {
  release: releaseDitherUrl,
  dev: devDitherUrl,
};

export function SidebarStageDitherArt({
  compact = false,
  tone = "dev",
}: {
  compact?: boolean;
  tone?: SidebarStageDitherTone;
}) {
  return (
    <div
      aria-hidden
      className="stage-dither h-full w-full bg-cover bg-no-repeat"
      style={{
        backgroundImage: `url(${DITHER_URL[tone]})`,
        // The compact variant is drawn inside a small button rather than across
        // the header, so it takes the lighter top-right corner — the part of
        // the ramp that still reads as the artwork at ~28px wide.
        backgroundPosition: compact ? "right top" : "center",
      }}
    />
  );
}
