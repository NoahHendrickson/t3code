/** The per-corner radius glyphs from the t3-fork Figma design (node 180:7739 family) —
 * custom-drawn, no Phosphor equivalent, so they live here instead of the lucide shim.
 * Stroke rides currentColor so the field prefix cell's muted tint applies. */

const CORNER_PATHS = {
  tl: "M4.875 11.375V6.875C4.875 5.77043 5.77043 4.875 6.875 4.875H11.375",
  tr: "M11.375 11.375V6.875C11.375 5.77043 10.4796 4.875 9.375 4.875H4.875",
  bl: "M11.375 11.375L6.875 11.375C5.77043 11.375 4.875 10.4796 4.875 9.375L4.875 4.875",
  br: "M4.875 11.375L9.375 11.375C10.4796 11.375 11.375 10.4796 11.375 9.375L11.375 4.875",
} as const;

export type CornerRadiusCorner = keyof typeof CORNER_PATHS;

export function CornerRadiusIcon({ corner }: { corner: CornerRadiusCorner }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={CORNER_PATHS[corner]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
