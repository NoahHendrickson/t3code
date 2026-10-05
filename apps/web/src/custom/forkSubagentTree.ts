/**
 * Pure model for the transcript's subagent spawn tree — see
 * `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * Takes the projected subagent items of one spawn batch plus the thread's
 * live subagent roster (upstream's projection keeps status, progress, result,
 * model and timing current there) and returns what the tree paints: the lead
 * line, the status summary, and one row per member with the sidebar's status
 * vocabulary. Kept out of the component so the rules are testable without
 * rendering.
 */
import type {
  OrchestrationV2Subagent,
  OrchestrationV2TurnItem,
  ThreadId,
} from "@t3tools/contracts";
import {
  formatSubagentDisplayTitle,
  subagentGroupSummary,
  summarizeSubagentStatuses,
} from "@t3tools/client-runtime/state/subagent-display";
import * as DateTime from "effect/DateTime";

export type ForkSubagentItem = Extract<OrchestrationV2TurnItem, { readonly type: "subagent" }>;
export type ForkSubagentStatus = OrchestrationV2TurnItem["status"];
export type ForkSubagentMark = "rain" | "idle" | "done" | "failed" | "stopped";

export interface ForkSubagentTreeRow {
  readonly id: string;
  readonly title: string;
  readonly status: ForkSubagentStatus;
  readonly mark: ForkSubagentMark;
  /** Live activity while working, the result once settled; the status word when neither says more. */
  readonly detail: string;
  readonly failed: boolean;
  readonly model: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly childThreadId: ThreadId | null;
}

export interface ForkSubagentTree {
  /** "Kicked off N subagents" while any member works, "Ran N subagents" after. */
  readonly lead: string;
  /** "2 working · 1 done", in the agents panel's words. */
  readonly summary: string;
  readonly active: boolean;
  readonly rows: ReadonlyArray<ForkSubagentTreeRow>;
}

const STATUS_WORD: Record<ForkSubagentStatus, string> = {
  pending: "Working",
  running: "Working",
  waiting: "Working",
  idle: "Idle",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Stopped",
};

const STATUS_MARK: Record<ForkSubagentStatus, ForkSubagentMark> = {
  pending: "rain",
  running: "rain",
  waiting: "rain",
  idle: "idle",
  completed: "done",
  failed: "failed",
  cancelled: "stopped",
  interrupted: "stopped",
};

export function isForkSubagentSettled(status: ForkSubagentStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

/** The server's placeholder when a child ends without output; the mark already says it. */
const GENERIC_CHILD_END = /^Child task ended with status\b/iu;

/** One line of a markdown result: drop list bullets, code ticks, and link targets. */
function plainDetail(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/`/gu, "")
    .replace(/^[ \t]*[-*][ \t]+/gmu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function resolveDetail(input: {
  readonly status: ForkSubagentStatus;
  readonly progress: string | undefined;
  readonly result: string | null;
}): string {
  const progress = input.progress?.trim() || null;
  const result = input.result?.trim() || null;
  const raw = isForkSubagentSettled(input.status) ? result || progress : progress || result;
  if (raw === null || GENERIC_CHILD_END.test(raw)) return STATUS_WORD[input.status];
  return plainDetail(raw) || STATUS_WORD[input.status];
}

const ACRONYMS = new Set(["gpt", "glm", "grok"]);

/**
 * A model slug the way the Figma tree spells it: vendor prefix dropped, words
 * title-cased, a trailing version joined with dots — `claude-opus-5-5` reads
 * "Opus 5.5", `gpt-6-astra` reads "GPT 6 Astra". Null when there is nothing to
 * show; the raw slug when it has no dashes to work with.
 */
export function formatForkSubagentModel(model: string | null): string | null {
  const slug = model?.trim().toLowerCase();
  if (!slug) return null;
  const parts = slug.split(/[-_/]+/u).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  if (parts[0] === "claude" && parts.length > 1) parts.shift();
  const words: string[] = [];
  for (const part of parts) {
    const numeric = /^\d+$/u.test(part);
    const previous = words.at(-1);
    if (numeric && previous !== undefined && /^\d+(\.\d+)*$/u.test(previous)) {
      words[words.length - 1] = `${previous}.${part}`;
      continue;
    }
    words.push(
      numeric
        ? part
        : ACRONYMS.has(part)
          ? part.toUpperCase()
          : part[0]!.toUpperCase() + part.slice(1),
    );
  }
  return words.join(" ");
}

function isoOrNull(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

export function resolveForkSubagentTree(
  members: ReadonlyArray<ForkSubagentItem>,
  liveAgents: ReadonlyArray<OrchestrationV2Subagent> | null | undefined,
): ForkSubagentTree {
  const rows = members.map((item): ForkSubagentTreeRow => {
    const live = liveAgents?.find((agent) => agent.id === item.subagentId);
    const status = live?.status ?? item.status;
    return {
      id: item.id,
      title: formatSubagentDisplayTitle(live?.title ?? item.title ?? "Subagent"),
      status,
      mark: STATUS_MARK[status],
      detail: resolveDetail({
        status,
        progress: live?.progress ?? item.progress,
        result: live?.result ?? item.result,
      }),
      failed: status === "failed",
      model: live?.model ?? null,
      startedAt: isoOrNull(live?.startedAt ?? item.startedAt),
      completedAt: isoOrNull(live?.completedAt ?? item.completedAt),
      childThreadId: live?.childThreadId ?? item.childThreadId,
    };
  });
  const group = subagentGroupSummary(rows);
  return {
    lead: group.label,
    summary: summarizeSubagentStatuses(rows.map((row) => row.status)),
    active: group.active,
    rows,
  };
}
