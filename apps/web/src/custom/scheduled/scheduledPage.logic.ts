/**
 * Pure helpers behind the Scheduled page — see
 * `.fork/customizations.yaml#fork-scheduled-page`. Search parsing, list
 * filtering, and the presentation of runs and triggers live here so the
 * components stay dumb and the guard tests can exercise the decisions.
 */
import {
  EnvironmentId,
  ScheduledTaskId,
  type OrchestrationV2RunStatus,
  type ScheduledTask,
  type ScheduledTaskRun,
  type ScheduledTaskRunTrigger,
  type ScheduledTaskSchedule,
  type ScheduledTaskWebhookDeliveryOutcome,
} from "@t3tools/contracts";

import { formatRelativeTime } from "~/timestampFormat";

export type ScheduledPageTab = "settings" | "runs";

/** `task: "new"` is the create form; `view: "runs"` is every run across tasks. */
export interface ScheduledPageSearch {
  readonly env?: EnvironmentId;
  readonly task?: ScheduledTaskId | "new";
  readonly tab?: ScheduledPageTab;
  readonly view?: "runs";
  /** A starter recipe id that prefills the create form. */
  readonly starter?: string;
}

export function validateScheduledPageSearch(raw: Record<string, unknown>): ScheduledPageSearch {
  const env =
    typeof raw.env === "string" && raw.env.trim() ? EnvironmentId.make(raw.env) : undefined;
  const task =
    raw.task === "new"
      ? ("new" as const)
      : typeof raw.task === "string" && raw.task.trim()
        ? ScheduledTaskId.make(raw.task)
        : undefined;
  const tab = raw.tab === "runs" ? ("runs" as const) : undefined;
  const view = raw.view === "runs" && task === undefined ? ("runs" as const) : undefined;
  const starter =
    task === "new" && typeof raw.starter === "string" && isStarterId(raw.starter)
      ? raw.starter
      : undefined;
  return {
    ...(env === undefined ? {} : { env }),
    ...(task === undefined ? {} : { task }),
    ...(tab === undefined ? {} : { tab }),
    ...(view === undefined ? {} : { view }),
    ...(starter === undefined ? {} : { starter }),
  };
}

function isStarterId(value: string): boolean {
  return SCHEDULED_STARTERS.some((starter) => starter.id === value);
}

/** Case-insensitive match on the title or the prompt; an empty query keeps everything. */
export function matchesTaskQuery(task: Pick<ScheduledTask, "title" | "prompt">, query: string) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return task.title.toLowerCase().includes(needle) || task.prompt.toLowerCase().includes(needle);
}

export const TRIGGER_LABELS: Record<ScheduledTaskRunTrigger, string> = {
  scheduled: "Schedule",
  manual: "Run now",
  webhook: "Webhook",
};

export type RunStatusTone = "success" | "error" | "info" | "warning" | "secondary";

/** Every V2 run status as one of five tones with a short label. */
export function presentRunStatus(status: OrchestrationV2RunStatus | null): {
  readonly label: string;
  readonly tone: RunStatusTone;
  readonly live: boolean;
} {
  switch (status) {
    case "completed":
      return { label: "Completed", tone: "success", live: false };
    case "failed":
      return { label: "Failed", tone: "error", live: false };
    case "waiting":
      return { label: "Waiting", tone: "warning", live: true };
    case "running":
    case "starting":
    case "preparing":
      return { label: "Running", tone: "info", live: true };
    case "queued":
      return { label: "Queued", tone: "info", live: true };
    case "interrupted":
      return { label: "Interrupted", tone: "secondary", live: false };
    case "cancelled":
      return { label: "Cancelled", tone: "secondary", live: false };
    case "rolled_back":
      return { label: "Rolled back", tone: "secondary", live: false };
    case null:
      return { label: "Queued", tone: "secondary", live: true };
  }
}

/** Whole seconds between request and completion, or null while running. */
export function runDurationSeconds(run: Pick<ScheduledTaskRun, "requestedAt" | "completedAt">) {
  if (run.completedAt === null) return null;
  const start = Date.parse(run.requestedAt);
  const end = Date.parse(run.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** The live thread status wins over the snapshot only when it describes the same run. */
export function overlayRunStatus(
  run: Pick<ScheduledTaskRun, "runId" | "status">,
  live: { readonly runId: string; readonly status: OrchestrationV2RunStatus } | null,
): OrchestrationV2RunStatus | null {
  if (live !== null && run.runId !== null && live.runId === run.runId) return live.status;
  return run.status;
}

/** Starter recipes: a title, a prompt, and the trigger the editor opens on. */
export interface ScheduledStarter {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly scheduleMode: "fixed" | "interval" | "webhook";
  readonly prompt: string;
}

export const SCHEDULED_STARTERS: ReadonlyArray<ScheduledStarter> = [
  {
    id: "review-prs",
    title: "Review new pull requests",
    summary: "Review every new PR in the GitHub repositories you choose.",
    scheduleMode: "webhook",
    prompt:
      "Review this pull request for correctness bugs and regressions. Verify each finding in the surrounding code and post a concise review comment on the PR. Include file references and explain the impact. Do not push changes or approve.",
  },
  {
    id: "morning-check-in",
    title: "Morning check-in",
    summary: "Every weekday morning, summarize what changed and what needs attention.",
    scheduleMode: "fixed",
    prompt:
      "Summarize what changed in this repository since yesterday: merged pull requests, open pull requests waiting on review, failing CI runs, and new issues. Keep it to a short list I can read in a minute, and name anything that looks urgent first.",
  },
  {
    id: "keep-green",
    title: "Keep the build green",
    summary: "Every few hours, run the test suite and fix what broke.",
    scheduleMode: "interval",
    prompt:
      "Pull the latest default branch, run the project's lint, typecheck, and test commands, and fix any failure you find with the smallest change. Open a pull request for the fix with the failing output in the description. If everything passes, reply with one line and stop.",
  },
];

/** JS day-of-week (0 = Sunday). */
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Mirrors upstream's settings label so the two pages never disagree on a trigger. */
export function scheduleLabel(schedule: ScheduledTaskSchedule): string {
  if (schedule.type === "webhook") return schedule.github ? "GitHub PR opened" : "On webhook";
  if (schedule.type === "interval") {
    const minutes = schedule.everyMs / 60_000;
    return Number.isInteger(minutes)
      ? `Every ${minutes} min`
      : `Every ${Math.round(schedule.everyMs / 1000)} sec`;
  }
  return fixedTimeLabel(schedule.timeOfDay, schedule.weekdays ?? []);
}

function fixedTimeLabel(timeOfDay: string, weekdays: ReadonlyArray<number>): string {
  const days =
    weekdays.length === 0
      ? "Daily"
      : weekdays.length === 5 && weekdays.every((day) => day >= 1 && day <= 5)
        ? "Weekdays"
        : weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ");
  return `${days} at ${timeOfDay}`;
}

/**
 * The composer's trigger pill: an unsaved draft summarised the way the task
 * list's Trigger column reads the saved row. Days run Monday-first, as the
 * day picker draws them.
 */
export function draftTriggerLabel(draft: {
  readonly githubPrOpened?: boolean | undefined;
  readonly scheduleMode: "interval" | "fixed" | "webhook";
  readonly intervalMinutes: string;
  readonly timeOfDay: string;
  readonly weekdays: ReadonlySet<number>;
}): string {
  if (draft.githubPrOpened) return "GitHub PR opened";
  if (draft.scheduleMode === "webhook") return "On webhook";
  if (draft.scheduleMode === "interval") {
    const minutes = Number(draft.intervalMinutes);
    return draft.intervalMinutes.trim() && Number.isFinite(minutes) && minutes > 0
      ? `Every ${minutes} min`
      : "Every interval";
  }
  // Every day selected saves with no weekdays, which the list reads as Daily.
  const weekdays =
    draft.weekdays.size === 7
      ? []
      : [...draft.weekdays].toSorted((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return fixedTimeLabel(draft.timeOfDay, weekdays);
}

/** Past instants read "5m ago"; future ones (a next run) read "in 5m". */
export function relativeLabel(value: string | null): string {
  if (!value) return "Not scheduled";
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs <= 0) {
    const relative = formatRelativeTime(value);
    if (!relative) return "Not scheduled";
    return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 2) return "in under a minute";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export const DELIVERY_OUTCOME_LABELS: Record<ScheduledTaskWebhookDeliveryOutcome, string> = {
  accepted: "Ran",
  dispatch_failed: "Run failed",
  rejected_signature: "Bad signature",
  disabled: "Task paused",
  rate_limited: "Rate limited",
  expired: "Too old",
  ignored: "Not a new PR",
};

export function deliveryOutcomeTone(
  outcome: ScheduledTaskWebhookDeliveryOutcome,
): "success" | "warning" | "error" {
  if (outcome === "accepted") return "success";
  if (
    outcome === "ignored" ||
    outcome === "disabled" ||
    outcome === "rate_limited" ||
    outcome === "expired"
  ) {
    return "warning";
  }
  return "error";
}

/** Short model name for a table cell: the slug after the last slash. */
export function shortModelName(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

/** A stable string for a draft so the editor knows whether there is anything to save. */
export function draftSignature(draft: {
  readonly title: string;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly scheduleMode: string;
  readonly intervalMinutes: string;
  readonly timeOfDay: string;
  readonly weekdays: ReadonlySet<number>;
  readonly projectId: string;
  readonly workspaceMode: string;
  readonly baseRef: string;
  readonly startFromOrigin: boolean;
  readonly existingWorktreePath: string;
  readonly modelKey: string;
  readonly signatureEnabled: boolean;
  readonly signatureHeader: string;
  readonly signatureEncoding: string;
  readonly signaturePrefix: string;
  readonly signatureSecret: string;
  readonly maxDeliveryAgeMinutes: string;
}): string {
  return JSON.stringify({ ...draft, weekdays: [...draft.weekdays].toSorted((a, b) => a - b) });
}
