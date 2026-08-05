/** The paired-padding glyphs from the t3-fork Figma design (node 180:7288 family) —
 * a frame with two inner bars: vertical bars = left/right padding, horizontal bars =
 * top/bottom. Custom-drawn (no Phosphor equivalent), stroke rides currentColor so the
 * field prefix cell's muted tint applies. */

const FRAME_PATH =
  "M24 7H8C7.44772 7 7 7.44772 7 8V24C7 24.5523 7.44772 25 8 25H24C24.5523 25 25 24.5523 25 24V8C25 7.44772 24.5523 7 24 7Z";

const BAR_PATHS = {
  inline: ["M21 11V21", "M11 11V21"],
  block: ["M21 21L11 21", "M21 11L11 11"],
} as const;

export function PaddingIcon({ axis }: { axis: keyof typeof BAR_PATHS }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {[FRAME_PATH, ...BAR_PATHS[axis]].map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
