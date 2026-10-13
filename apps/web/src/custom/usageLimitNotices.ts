/**
 * The Usage limits view's warnings — see
 * `.fork/customizations.yaml#fork-usage-limits-surface`. Upstream also warns
 * for a provider that reports no windows at all (e.g. Grok); the fork drops
 * that line, since there is nothing to show or act on. Failures still surface.
 */
import {
  collectLimitNotices,
  limitsNotice,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";

/** Derived from upstream's helper, so a rewording there cannot bring the line back. */
const NO_WINDOWS_NOTICE = limitsNotice({ checkedAt: "", windows: [] });

export function actionableLimitNotices(presentations: LimitPresentations): readonly string[] {
  const notices = collectLimitNotices(presentations);
  if (!NO_WINDOWS_NOTICE) return notices;
  return notices.filter((notice) => !notice.endsWith(`: ${NO_WINDOWS_NOTICE}`));
}
