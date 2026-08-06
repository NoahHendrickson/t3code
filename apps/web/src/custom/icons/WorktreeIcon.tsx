/**
 * The worktree mark — see `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Drawn in Figma (t3-fork, node 86:6226) rather than taken from Phosphor: no
 * glyph in that set says "this thread has a checkout of its own". The nearest
 * candidates are folders, and a folder on the card's repo line reads as the
 * project, which is the one thing this must not be confused with.
 *
 * It composes with the Phosphor duotone set rather than merely sitting beside
 * it. Phosphor draws on a 256 viewBox at stroke 16 and fills its secondary
 * shapes at 20% — this is a 32 viewBox at stroke 2, the same 1:16 ratio, with
 * the same 20% on the two outer nodes. So at `size-3` its strokes land on the
 * same 0.75px as the `GitBranchIcon` it replaces, and the duotone reads as one
 * family. Change the viewBox and the stroke has to move with it.
 *
 * `currentColor` throughout, and the export's `#1E1E1E` backing rect and clip
 * path are dropped: the first would paint a dark square into a light-mode card,
 * and the second bounds nothing once the artboard is gone.
 */
import type { SVGProps } from "react";

export function WorktreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      // The lucide class contract the Phosphor shim also keeps: nothing styles
      // off it, but tests identify a rendered icon by it.
      {...props}
      className={
        props.className ? `lucide lucide-worktree ${props.className}` : "lucide lucide-worktree"
      }
    >
      <path
        opacity="0.2"
        d="M26 13C27.1046 13 28 12.1046 28 11C28 9.89543 27.1046 9 26 9C24.8954 9 24 9.89543 24 11C24 12.1046 24.8954 13 26 13Z"
        fill="currentColor"
      />
      <path
        opacity="0.2"
        d="M6 13C7.10457 13 8 12.1046 8 11C8 9.89543 7.10457 9 6 9C4.89543 9 4 9.89543 4 11C4 12.1046 4.89543 13 6 13Z"
        fill="currentColor"
      />
      <path
        d="M16 10L16 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 10C17.6569 10 19 8.65685 19 7C19 5.34315 17.6569 4 16 4C14.3431 4 13 5.34315 13 7C13 8.65685 14.3431 10 16 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 14C27.6569 14 29 12.6569 29 11C29 9.34315 27.6569 8 26 8C24.3431 8 23 9.34315 23 11C23 12.6569 24.3431 14 26 14Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 14C7.65685 14 9 12.6569 9 11C9 9.34315 7.65685 8 6 8C4.34315 8 3 9.34315 3 11C3 12.6569 4.34315 14 6 14Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 28C17.6569 28 19 26.6569 19 25C19 23.3431 17.6569 22 16 22C14.3431 22 13 23.3431 13 25C13 26.6569 14.3431 28 16 28Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23.5 12.4433L16 16.7735" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5977 12.5L15.9993 16.7735" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
