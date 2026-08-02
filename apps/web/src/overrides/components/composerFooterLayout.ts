// Fork shadow of upstream composerFooterLayout — see
// `.fork/customizations.yaml#fork-composer-shell`.
//
// Upstream's 620/780 thresholds were calibrated for packing mode + model into
// one in-box footer. The fork's denser below-surface control row (20px chips,
// text-only mode toggles, model on the opposite side) still has room well
// below those widths, so the ⋯ menu was firing with a large empty gap. Keep
// the wide-actions threshold under the form's max-w-3xl (768px) so the
// expanded row remains reachable at the form's natural ceiling.

export const COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX = 400;
export const COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX = 520;
export const COMPOSER_PRIMARY_ACTIONS_COMPACT_BREAKPOINT_PX =
  COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX;

export function shouldUseCompactComposerFooter(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  const breakpoint = options?.hasWideActions
    ? COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX
    : COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX;
  return width !== null && width < breakpoint;
}

export function shouldUseCompactComposerPrimaryActions(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  if (!options?.hasWideActions) {
    return false;
  }
  return width !== null && width < COMPOSER_PRIMARY_ACTIONS_COMPACT_BREAKPOINT_PX;
}
