/**
 * Sidebar stage artwork — see `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Painted from the designer's dev-channel PNG rather than generated. The
 * sidebar header itself is now flat; upstream's Dev-gated call sites — the
 * composer send button and auth screen — still use this artwork.
 *
 * An earlier revision reproduced the pattern as an 8x8 Bayer dither in SVG,
 * which scaled cleanly but was only ever an approximation: it flattened the
 * reference's diagonal ramp to a vertical one, because a horizontal component
 * restarts at every pattern tile and reads as banding.
 *
 * `cover` rather than `repeat`, and that is the whole reason this is a `div`
 * with a background instead of a tiled `<pattern>`: the source ramps
 * diagonally, so repeating it would draw a seam.
 *
 * `image-rendering` is deliberately left at the default. The source is a
 * screenshot rather than a clean export, so `pixelated` would sharpen the
 * resampling artefacts along with the dots.
 */
import devDitherUrl from "./assets/sidebar-stage-dither-dev.png";

export function SidebarStageDitherArt({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden
      className="stage-dither h-full w-full bg-cover bg-no-repeat"
      style={{
        backgroundImage: `url(${devDitherUrl})`,
        // The compact variant is drawn inside a small button rather than across
        // the header, so it takes the lighter top-right corner — the part of
        // the ramp that still reads as the artwork at ~28px wide.
        backgroundPosition: compact ? "right top" : "center",
      }}
    />
  );
}
