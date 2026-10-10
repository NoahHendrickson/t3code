/**
 * Pure model for the transcript's subagent spawn tree — see
 * `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * Takes the projected subagent items of one spawn batch plus the thread's
 * live subagent roster (upstream's projection keeps status, progress, result,
 * model and timing current there) and returns what the tree paints: the lead
 * line, the status summary, the batch's elapsed span, and one row per member
 * with the sidebar's status vocabulary. Lead, summary and the
 * progress-or-result preference are upstream's shared helpers; what is the
 * fork's own here is the mark vocabulary, the one-line markdown strip and the
 * model spelling. Kept out of the component so the rules are testable without
 * rendering.
 */
import type {
  OrchestrationV2Subagent,
  OrchestrationV2TurnItem,
  ThreadId,
} from "@t3tools/contracts";
import {
  formatSubagentDisplayTitle,
  subagentDetailPreview,
  subagentGroupSummary,
  summarizeSubagentStatuses,
} from "@t3tools/client-runtime/state/subagent-display";
import { formatModelSlugName } from "@t3tools/shared/model";
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

/** The batch's one elapsed span, in the shape `AgentElapsed` ticks. */
export interface ForkSubagentTiming {
  readonly status: "running" | "completed";
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface ForkSubagentTree {
  /** "Kicked off N subagents" while any member works, "Ran N subagents" after. */
  readonly lead: string;
  /** "2 working · 1 done", in the agents panel's words. */
  readonly summary: string;
  readonly active: boolean;
  /**
   * First launch to last settle, ticking while the batch is active — upstream's
   * group rule: null when no member reports a start time (provider-native
   * subagents often carry none), and the end withheld rather than cut short
   * while a settled member has no completion time.
   */
  readonly timing: ForkSubagentTiming | null;
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

/** Upstream's pick (progress while live, result once settled, one line), then
    the fork's placeholder drop and markdown strip over it. */
function resolveDetail(input: {
  readonly status: ForkSubagentStatus;
  readonly progress: string | undefined;
  readonly result: string | null;
}): string {
  const preview = subagentDetailPreview(input);
  if (preview === null || GENERIC_CHILD_END.test(preview)) return STATUS_WORD[input.status];
  return plainDetail(preview) || STATUS_WORD[input.status];
}

/**
 * A model id the way the Figma tree spells it: upstream's shared spelling
 * (`formatModelSlugName`) with the vendor word dropped and a dated snapshot's
 * date left off, so `claude-opus-5-5` reads "Opus 5.5" and the
 * `claude-sonnet-4-5-20250929` a Claude subagent reports reads "Sonnet 4.5".
 * Null when nothing was reported.
 */
export function formatForkSubagentModel(model: string | null): string | null {
  const slug = model?.trim();
  if (!slug) return null;
  return (
    formatModelSlugName(slug)
      .replace(/^claude\s+/iu, "")
      .replace(/\s+\d{8}(?=\[|$)/u, "")
      .trim() || null
  );
}

function isoOrNull(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

export function resolveForkSubagentTree(
  members: ReadonlyArray<ForkSubagentItem>,
  liveAgents: ReadonlyArray<OrchestrationV2Subagent> | null | undefined,
): ForkSubagentTree {
  const rows: ForkSubagentTreeRow[] = [];
  let startMs: number | null = null;
  let endMs: number | null = null;
  let endUnknown = false;
  for (const item of members) {
    const live = liveAgents?.find((agent) => agent.id === item.subagentId);
    const status = live?.status ?? item.status;
    const startedAt = live?.startedAt ?? item.startedAt;
    const completedAt = live?.completedAt ?? item.completedAt;
    if (startedAt) {
      const ms = DateTime.toEpochMillis(startedAt);
      startMs = startMs === null ? ms : Math.min(startMs, ms);
    }
    if (completedAt) {
      const ms = DateTime.toEpochMillis(completedAt);
      endMs = endMs === null ? ms : Math.max(endMs, ms);
    } else {
      endUnknown = true;
    }
    rows.push({
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
      startedAt: isoOrNull(startedAt),
      completedAt: isoOrNull(completedAt),
      childThreadId: live?.childThreadId ?? item.childThreadId,
    });
  }
  const group = subagentGroupSummary(rows);
  return {
    lead: group.label,
    summary: summarizeSubagentStatuses(rows.map((row) => row.status)),
    active: group.active,
    timing:
      startMs === null
        ? null
        : {
            status: group.active ? "running" : "completed",
            startedAt: new Date(startMs).toISOString(),
            completedAt:
              group.active || endUnknown || endMs === null ? null : new Date(endMs).toISOString(),
          },
    rows,
  };
}
