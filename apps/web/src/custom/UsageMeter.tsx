/**
 * A limit meter: a muted, fully rounded track filled to the share left, toned
 * green from 50%, pastel yellow down to 20%, red below. Shared by the Usage
 * limits view and the composer's limits bar (fork-usage-limits-surface,
 * fork-composer-usage-limits). Size the track with `className`; `remaining`
 * null draws the bare track for an account with no window.
 */
import { cn } from "~/lib/utils";

function toneOf(remaining: number): string {
  if (remaining >= 50) return "bg-success";
  if (remaining >= 20) return "bg-yellow-300 dark:bg-yellow-200";
  return "bg-destructive";
}

export function UsageMeter(props: {
  readonly remaining: number | null;
  readonly className?: string;
  readonly fillClassName?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden rounded-full bg-muted", props.className)}>
      {props.remaining === null ? null : (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[background-color,opacity]",
            toneOf(props.remaining),
            props.fillClassName,
          )}
          style={{ width: `${props.remaining}%` }}
        />
      )}
    </span>
  );
}
