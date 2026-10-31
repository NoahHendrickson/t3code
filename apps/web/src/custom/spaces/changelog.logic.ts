/* A space's merged PRs by week, see `.fork/customizations.yaml#fork-spaces`. A PR list
   entry has no merge time, so entries are dated by last update: a merged PR rarely
   changes, and a bump only reorders it within the list. */

export interface ConventionalTitle {
  /** `feat`, `fix`, … — null when the title has no prefix. */
  readonly kind: string | null;
  readonly scope: string | null;
  readonly subject: string;
}

const CONVENTIONAL_TITLE = /^([a-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/i;

export function parseConventionalTitle(title: string): ConventionalTitle {
  const match = CONVENTIONAL_TITLE.exec(title.trim());
  if (match === null) return { kind: null, scope: null, subject: title.trim() };
  return {
    kind: match[1]!.toLowerCase(),
    scope: match[2] ?? null,
    subject: match[3]!.trim(),
  };
}

export interface ChangelogWeek<T> {
  /** The week's Monday, local midnight, in ms: unique where labels are not. */
  readonly start: number;
  readonly label: string;
  readonly entries: readonly T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of the Monday starting `date`'s week. */
function weekStart(date: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start.getTime();
}

const WEEK_LABEL_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Groups entries (already newest first) by calendar week. Entries with an
    unparseable date are dropped rather than filed under a made-up week. */
export function groupChangelogByWeek<T extends { readonly updatedAt: string }>(
  entries: readonly T[],
  now: Date,
): ReadonlyArray<ChangelogWeek<T>> {
  const thisWeek = weekStart(now);
  const weeks: Array<{ start: number; label: string; entries: T[] }> = [];
  for (const entry of entries) {
    const time = Date.parse(entry.updatedAt);
    if (!Number.isFinite(time)) continue;
    const start = weekStart(new Date(time));
    let week = weeks.find((candidate) => candidate.start === start);
    if (week === undefined) {
      const weeksAgo = Math.round((thisWeek - start) / (7 * DAY_MS));
      const label =
        weeksAgo <= 0
          ? "This week"
          : weeksAgo === 1
            ? "Last week"
            : `Week of ${WEEK_LABEL_FORMAT.format(start)}`;
      week = { start, label, entries: [] };
      weeks.push(week);
    }
    week.entries.push(entry);
  }
  return weeks.sort((left, right) => right.start - left.start);
}
