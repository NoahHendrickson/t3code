/**
 * Sidebar pixel mark — see `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * The 23-cell "flower" from Figma t3-fork 364:11245, transcribed rect for
 * rect from the designer's export. Inline rather than an <img> so a palette
 * can recolour it: each of the eight colour runs (four arms, each with a
 * main and a light cell group) fills from a `--fork-brand-mark-*` variable
 * with the design's default baked in as the fallback, and Westworld
 * (theme.custom.palettes.css) restates the eight for Figma 412:31179's
 * blues. The outline stays literal black in every palette.
 *
 * Kept as plain integer rects on the 23-unit grid with crispEdges, for the
 * reason the guard spells out: a bitmap cannot land 23 cells on a 16px slot
 * without smearing every cell.
 */
export function SidebarBrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} shapeRendering="crispEdges" viewBox="0 0 23 23">
      <g fill="#000000">
        <rect height="1" width="1" x="11" y="0" />
        <rect height="1" width="3" x="10" y="1" />
        <rect height="1" width="1" x="9" y="2" />
        <rect height="1" width="1" x="11" y="2" />
        <rect height="1" width="1" x="13" y="2" />
        <rect height="1" width="1" x="8" y="3" />
        <rect height="1" width="1" x="11" y="3" />
        <rect height="1" width="1" x="14" y="3" />
        <rect height="1" width="1" x="7" y="4" />
        <rect height="1" width="1" x="11" y="4" />
        <rect height="1" width="1" x="15" y="4" />
        <rect height="1" width="1" x="7" y="5" />
        <rect height="1" width="1" x="9" y="5" />
        <rect height="1" width="1" x="11" y="5" />
        <rect height="1" width="1" x="13" y="5" />
        <rect height="1" width="1" x="15" y="5" />
        <rect height="1" width="1" x="7" y="6" />
        <rect height="1" width="3" x="10" y="6" />
        <rect height="1" width="1" x="15" y="6" />
        <rect height="1" width="6" x="4" y="7" />
        <rect height="1" width="1" x="11" y="7" />
        <rect height="1" width="4" x="15" y="7" />
        <rect height="1" width="1" x="3" y="8" />
        <rect height="1" width="2" x="10" y="8" />
        <rect height="1" width="1" x="13" y="8" />
        <rect height="1" width="1" x="15" y="8" />
        <rect height="1" width="1" x="19" y="8" />
        <rect height="1" width="1" x="2" y="9" />
        <rect height="1" width="1" x="5" y="9" />
        <rect height="1" width="1" x="8" y="9" />
        <rect height="1" width="1" x="11" y="9" />
        <rect height="1" width="1" x="15" y="9" />
        <rect height="1" width="1" x="17" y="9" />
        <rect height="1" width="1" x="20" y="9" />
        <rect height="1" width="1" x="1" y="10" />
        <rect height="1" width="1" x="6" y="10" />
        <rect height="1" width="1" x="12" y="10" />
        <rect height="1" width="1" x="14" y="10" />
        <rect height="1" width="1" x="16" y="10" />
        <rect height="1" width="1" x="21" y="10" />
        <rect height="1" width="23" x="0" y="11" />
        <rect height="1" width="1" x="1" y="12" />
        <rect height="1" width="1" x="6" y="12" />
        <rect height="1" width="1" x="9" y="12" />
        <rect height="1" width="1" x="12" y="12" />
        <rect height="1" width="1" x="16" y="12" />
        <rect height="1" width="1" x="21" y="12" />
        <rect height="1" width="1" x="2" y="13" />
        <rect height="1" width="1" x="5" y="13" />
        <rect height="1" width="1" x="8" y="13" />
        <rect height="1" width="1" x="11" y="13" />
        <rect height="1" width="1" x="14" y="13" />
        <rect height="1" width="1" x="17" y="13" />
        <rect height="1" width="1" x="20" y="13" />
        <rect height="1" width="1" x="3" y="14" />
        <rect height="1" width="3" x="10" y="14" />
        <rect height="1" width="1" x="19" y="14" />
        <rect height="1" width="6" x="4" y="15" />
        <rect height="1" width="1" x="11" y="15" />
        <rect height="1" width="6" x="13" y="15" />
        <rect height="1" width="1" x="7" y="16" />
        <rect height="1" width="3" x="10" y="16" />
        <rect height="1" width="1" x="15" y="16" />
        <rect height="1" width="1" x="7" y="17" />
        <rect height="1" width="1" x="9" y="17" />
        <rect height="1" width="1" x="11" y="17" />
        <rect height="1" width="1" x="13" y="17" />
        <rect height="1" width="1" x="15" y="17" />
        <rect height="1" width="1" x="7" y="18" />
        <rect height="1" width="1" x="11" y="18" />
        <rect height="1" width="1" x="15" y="18" />
        <rect height="1" width="1" x="8" y="19" />
        <rect height="1" width="1" x="11" y="19" />
        <rect height="1" width="1" x="14" y="19" />
        <rect height="1" width="1" x="9" y="20" />
        <rect height="1" width="1" x="11" y="20" />
        <rect height="1" width="1" x="13" y="20" />
        <rect height="1" width="3" x="10" y="21" />
        <rect height="1" width="1" x="11" y="22" />
      </g>
      <g fill="var(--fork-brand-mark-left, #008755)">
        <rect height="1" width="3" x="7" y="8" />
        <rect height="1" width="1" x="4" y="9" />
        <rect height="1" width="2" x="6" y="9" />
        <rect height="1" width="2" x="9" y="9" />
        <rect height="1" width="3" x="3" y="10" />
        <rect height="1" width="5" x="7" y="10" />
        <rect height="1" width="4" x="2" y="12" />
        <rect height="1" width="2" x="7" y="12" />
        <rect height="1" width="2" x="10" y="12" />
        <rect height="1" width="2" x="3" y="13" />
        <rect height="1" width="2" x="6" y="13" />
        <rect height="1" width="2" x="9" y="13" />
        <rect height="1" width="6" x="4" y="14" />
      </g>
      <g fill="var(--fork-brand-mark-left-light, #08b776)">
        <rect height="1" width="3" x="4" y="8" />
        <rect height="1" width="1" x="3" y="9" />
        <rect height="1" width="1" x="2" y="10" />
      </g>
      <g fill="var(--fork-brand-mark-top, #26b846)">
        <rect height="1" width="1" x="10" y="2" />
        <rect height="1" width="2" x="9" y="3" />
        <rect height="1" width="1" x="12" y="3" />
        <rect height="1" width="3" x="8" y="4" />
        <rect height="1" width="2" x="12" y="4" />
        <rect height="1" width="1" x="8" y="5" />
        <rect height="1" width="1" x="10" y="5" />
        <rect height="1" width="1" x="12" y="5" />
        <rect height="1" width="2" x="8" y="6" />
        <rect height="1" width="1" x="13" y="6" />
        <rect height="1" width="1" x="10" y="7" />
        <rect height="1" width="3" x="12" y="7" />
        <rect height="1" width="1" x="12" y="8" />
        <rect height="1" width="1" x="14" y="8" />
        <rect height="1" width="3" x="12" y="9" />
        <rect height="1" width="1" x="13" y="10" />
      </g>
      <g fill="var(--fork-brand-mark-top-light, #3aed62)">
        <rect height="1" width="1" x="12" y="2" />
        <rect height="1" width="1" x="13" y="3" />
        <rect height="1" width="1" x="14" y="4" />
        <rect height="1" width="1" x="14" y="5" />
        <rect height="1" width="1" x="14" y="6" />
      </g>
      <g fill="var(--fork-brand-mark-right, #f95b1c)">
        <rect height="1" width="3" x="16" y="8" />
        <rect height="1" width="1" x="16" y="9" />
        <rect height="1" width="2" x="18" y="9" />
        <rect height="1" width="1" x="15" y="10" />
        <rect height="1" width="4" x="17" y="10" />
        <rect height="1" width="3" x="13" y="12" />
        <rect height="1" width="3" x="17" y="12" />
        <rect height="1" width="2" x="12" y="13" />
        <rect height="1" width="2" x="15" y="13" />
        <rect height="1" width="1" x="18" y="13" />
        <rect height="1" width="3" x="13" y="14" />
      </g>
      <g fill="var(--fork-brand-mark-bottom, #fcb01a)">
        <rect height="1" width="1" x="10" y="15" />
        <rect height="1" width="1" x="12" y="15" />
        <rect height="1" width="1" x="9" y="16" />
        <rect height="1" width="2" x="13" y="16" />
        <rect height="1" width="1" x="10" y="17" />
        <rect height="1" width="1" x="12" y="17" />
        <rect height="1" width="1" x="14" y="17" />
        <rect height="1" width="2" x="9" y="18" />
        <rect height="1" width="3" x="12" y="18" />
        <rect height="1" width="1" x="10" y="19" />
        <rect height="1" width="2" x="12" y="19" />
        <rect height="1" width="1" x="12" y="20" />
      </g>
      <g fill="var(--fork-brand-mark-right-light, #ff8f0c)">
        <rect height="1" width="1" x="20" y="12" />
        <rect height="1" width="1" x="19" y="13" />
        <rect height="1" width="3" x="16" y="14" />
      </g>
      <g fill="var(--fork-brand-mark-bottom-light, #ffd233)">
        <rect height="1" width="1" x="8" y="16" />
        <rect height="1" width="1" x="8" y="17" />
        <rect height="1" width="1" x="8" y="18" />
        <rect height="1" width="1" x="9" y="19" />
        <rect height="1" width="1" x="10" y="20" />
      </g>
    </svg>
  );
}
