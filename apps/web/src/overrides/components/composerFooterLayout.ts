// Fork shadow of upstream composerFooterLayout — see
// `.fork/customizations.yaml#fork-composer-shell`.
//
// These constants drive mode-row ⋯ collapse only (ComposerFooterModeControls
// vs CompactComposerControlsMenu). Upstream's 620/780 packed mode + model into
// one in-box footer; the fork's denser below-surface mode chips still fit well
// below those widths. Model-picker compaction stays on upstream's numbers via
// `apps/web/src/custom/composerModelSlotCompact.ts` so one visual complaint
// does not widen the right slot at the same time. Keep the wide-actions
// threshold under the form's max-w-3xl (768px) so the expanded mode row remains
// reachable at the form's natural ceiling.

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
