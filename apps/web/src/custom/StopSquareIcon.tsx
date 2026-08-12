/** Shared 12×12 stop glyph used by the composer primary action and the
 * background-liveness pill. See `.fork/customizations.yaml#fork-composer-shell`. */
export function StopSquareIcon({ size = 12 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1.5" />
    </svg>
  );
}
