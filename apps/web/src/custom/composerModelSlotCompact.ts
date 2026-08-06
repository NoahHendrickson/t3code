/**
 * Model-picker / traits-adjacent compact threshold for the fork composer.
 *
 * Mode-row ⋯ collapse lives in the `composerFooterLayout` override (400/520).
 * The model trigger still uses upstream's 620/780 so expanding modes early
 * does not also grow the right-hand model control in the 400–620 band.
 * See `.fork/customizations.yaml#fork-composer-shell`.
 */

export const COMPOSER_MODEL_SLOT_COMPACT_BREAKPOINT_PX = 620;
export const COMPOSER_MODEL_SLOT_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX = 780;

export function shouldUseCompactComposerModelSlot(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  const breakpoint = options?.hasWideActions
    ? COMPOSER_MODEL_SLOT_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX
    : COMPOSER_MODEL_SLOT_COMPACT_BREAKPOINT_PX;
  return width !== null && width < breakpoint;
}
