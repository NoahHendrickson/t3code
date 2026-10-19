/**
 * The return arrow the fork's send button carries, from the designs, in place
 * of upstream's up arrow — see `.fork/customizations.yaml#fork-composer-shell`.
 * Drawn on the button's own 24x24 grid rather than a tight viewBox, so the
 * glyph lands at the drawn 12x7 centred on 12,12. Shared by the open
 * composer's send and the collapsed phone row's.
 */
export function ForkReturnGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 8.5V12.5H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 9.5L6 12.5L9 15.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
