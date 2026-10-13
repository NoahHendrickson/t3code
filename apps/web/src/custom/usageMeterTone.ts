/**
 * Limit meter fill by share left — green from 50%, pastel yellow down to 20%,
 * red below. Shared by the Usage limits view and the composer's 5-hour bar
 * (fork-usage-limits-surface, fork-composer-usage-limits).
 */
export function usageMeterTone(remaining: number): string {
  if (remaining >= 50) return "bg-success";
  if (remaining >= 20) return "bg-yellow-300 dark:bg-yellow-200";
  return "bg-destructive";
}
