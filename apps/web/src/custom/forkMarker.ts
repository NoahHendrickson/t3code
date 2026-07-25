/**
 * Fork-only, Tier 1 — see `.fork/README.md` §3.
 *
 * Stamps the document root so runtime checks — guard tests, the verification
 * routine, and plain DevTools inspection — can confirm the fork build is the
 * one actually running, and so fork-owned CSS can scope itself to marked
 * builds only (see `../theme.custom.css`).
 */

export const FORK_MARKER_ATTRIBUTE = "data-fork";
export const FORK_MARKER_VALUE = "noahhendrickson-t3code";

/** Structural target type keeps this testable without a DOM environment. */
export interface ForkMarkerTarget {
  setAttribute(name: string, value: string): void;
}

export function applyForkMarker(root: ForkMarkerTarget): void {
  root.setAttribute(FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE);
}
