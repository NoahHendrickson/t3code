/**
 * In-chat spawn CTA. Replaces upstream's bordered one-line bar with the
 * Figma tree (t3-fork file, node 376:21366): a header plus an indented
 * member list. Clicking still opens the Agents panel — the panel remains
 * the full roster; this is the transcript summary.
 *
 * Header policy lives in `resolveSpawnCta` so this file paints. Member
 * liveness and model compacting come from `subagentRuntime`; marks come
 * from the sidebar vocabulary. See `.fork/customizations.yaml#fork-subagent-spawn-card`.
 */
import { TreeView } from "@phosphor-icons/react";
import {
  formatSubagentModelLabel,
  formatSubagentTokenCount,
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  type AgentPanelModel,
  type AgentPanelWorkflowGroup,
  type RuntimeSubagent,
  type RuntimeSubagentStatus,
} from "@t3tools/client-runtime/state/subagentRuntime";
import type { ReactNode } from "react";

import {
  SidebarV2IdleMark,
  SidebarV2StatusDot,
  SidebarV2WorkingRain,
} from "./SidebarV2StatusIndicator";

export type AgentSpawnCtaSpawn = {
  readonly workflowId: string | null;
  readonly agentTaskIds: ReadonlyArray<string>;
};

type SpawnCtaView = {
  readonly agents: ReadonlyArray<RuntimeSubagent>;
  readonly live: boolean;
  readonly lead: string;
  readonly status: string;
  readonly workflowName: string | null;
  /** Coordinator aggregate, only when the workflow has no member rows. */
  readonly coordinatorTokens: number;
};

type SpawnMemberMark = "rain" | "idle" | "done" | "failed" | "stopped";

const SPAWN_MEMBER_VISUAL: Record<
  RuntimeSubagentStatus,
  { readonly mark: SpawnMemberMark; readonly fallback: string }
> = {
  pending: { mark: "rain", fallback: "Working" },
  running: { mark: "rain", fallback: "Working" },
  waiting: { mark: "rain", fallback: "Working" },
  idle: { mark: "idle", fallback: "Idle" },
  completed: { mark: "done", fallback: "Completed" },
  failed: { mark: "failed", fallback: "Failed" },
  cancelled: { mark: "stopped", fallback: "Stopped" },
  interrupted: { mark: "stopped", fallback: "Stopped" },
};

/** Same flatten AgentsPanel's `workflowMembers` and `workflowCardMembers` use. */
function workflowMembers(group: AgentPanelWorkflowGroup): ReadonlyArray<RuntimeSubagent> {
  return [...group.phases.flatMap((phase) => phase.members), ...group.unphasedMembers];
}

export function resolveSpawnCta(spawn: AgentSpawnCtaSpawn, model: AgentPanelModel): SpawnCtaView {
  const memberIds = new Set(spawn.agentTaskIds);
  const workflowGroup = spawn.workflowId
    ? model.workflows.find((group) => group.workflow.id === spawn.workflowId)
    : undefined;
  const agents = workflowGroup
    ? workflowMembers(workflowGroup)
    : model.directAgents.filter((agent) => memberIds.has(agent.id));
  const agentCount = Math.max(
    agents.length,
    Math.max(memberIds.size - (spawn.workflowId ? 1 : 0), 0),
  );
  const working = agents.filter((agent) => isActiveSubagentStatus(agent.status)).length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  // Coordinator status is authoritative for workflows: members can look
  // settled while the run is still mid-flight.
  const live =
    workflowGroup !== undefined
      ? !isTerminalSubagentStatus(workflowGroup.workflow.status)
      : working > 0;
  const livePhase = workflowGroup?.phases.find((phase) => phase.state === "running");
  const workflowName =
    workflowGroup?.workflow.workflowName ?? workflowGroup?.workflow.title ?? null;
  const lead = live
    ? `Kicked off ${agentCount} subagent${agentCount === 1 ? "" : "s"}`
    : `Ran ${agentCount} subagent${agentCount === 1 ? "" : "s"}`;
  const status = live
    ? livePhase
      ? `${livePhase.title} · ${livePhase.activeCount} working`
      : working > 0
        ? `${working} working`
        : "working"
    : failed > 0
      ? `${failed} failed`
      : "completed";
  // Same panel-footer rule: providers may roll member usage into the
  // coordinator, so surface it only when there are no member rows to paint.
  const coordinatorTokens =
    spawn.workflowId && agents.length === 0 ? (workflowGroup?.workflow.usage?.totalTokens ?? 0) : 0;
  return { agents, live, lead, status, workflowName, coordinatorTokens };
}

export function AgentSpawnCtaRow(props: {
  readonly spawn: AgentSpawnCtaSpawn;
  readonly agentPanelModel: AgentPanelModel;
  readonly onOpenAgents: () => void;
}) {
  const { agents, lead, status, workflowName, coordinatorTokens } = resolveSpawnCta(
    props.spawn,
    props.agentPanelModel,
  );

  return (
    <button
      type="button"
      data-fork-subagent-spawn-card=""
      onClick={props.onOpenAgents}
      className="flex w-full min-w-0 flex-col items-start gap-3.5 text-left text-sm leading-5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
    >
      <span className="flex w-full min-w-0 items-start gap-2">
        <span aria-hidden className="flex size-4 shrink-0 items-center py-px">
          <TreeView weight="regular" className="size-4 text-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="w-full min-w-0 truncate text-foreground">
            <span>{lead}</span>
            {workflowName ? <span className="text-muted-foreground"> · {workflowName}</span> : null}
          </span>
          <span className="flex min-w-0 items-start gap-3 whitespace-nowrap text-muted-foreground">
            <span>{status}</span>
            {coordinatorTokens > 0 ? (
              <span className="tabular-nums">
                {formatSubagentTokenCount(coordinatorTokens)} tokens
              </span>
            ) : null}
            <span className="underline decoration-solid">View agents</span>
          </span>
        </span>
      </span>
      {agents.length > 0 ? (
        <span className="flex w-full min-w-0 flex-col items-start gap-3.5 pl-6">
          {agents.map((agent) => (
            <SpawnAgentRow key={agent.id} agent={agent} />
          ))}
        </span>
      ) : null}
    </button>
  );
}

function SpawnAgentRow({ agent }: { readonly agent: RuntimeSubagent }) {
  const visual = SPAWN_MEMBER_VISUAL[agent.status];
  const metadata = [
    formatSpawnModel(agent.model),
    formatSpawnEffort(agent.effort),
    agent.usage && agent.usage.totalTokens > 0
      ? `${formatSubagentTokenCount(agent.usage.totalTokens)} tokens`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <span className="flex w-full min-w-0 items-start gap-2">
      <span aria-hidden className="flex shrink-0 items-center py-1">
        {spawnMemberMark(visual.mark, agent.id)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="w-full min-w-0 truncate text-foreground">{agent.title}</span>
        <span className="w-full min-w-0 truncate text-muted-foreground">
          {spawnMemberDetail(agent, visual.fallback)}
        </span>
        {metadata.length > 0 ? (
          <span className="flex items-start gap-3 whitespace-nowrap text-muted-foreground">
            {metadata.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function spawnMemberMark(mark: SpawnMemberMark, rainSeed: string): ReactNode {
  switch (mark) {
    case "rain":
      return <SidebarV2WorkingRain seed={rainSeed} />;
    case "idle":
      return <SidebarV2IdleMark />;
    case "done":
      return <SidebarV2StatusDot tone="done" />;
    case "failed":
      return <SidebarV2StatusDot tone="failed" />;
    case "stopped":
      return (
        <span className="flex size-[14px] shrink-0 items-center justify-center">
          <span className="size-2 rounded-full bg-muted-foreground/60" />
        </span>
      );
    default: {
      const _exhaustive: never = mark;
      return _exhaustive;
    }
  }
}

function spawnMemberDetail(agent: RuntimeSubagent, fallback: string): string {
  if (isActiveSubagentStatus(agent.status)) {
    return agent.progress ?? agent.lastToolName ?? fallback;
  }
  return agent.error ?? agent.result ?? agent.progress ?? agent.lastToolName ?? fallback;
}

/** Title-case the canonical compact id so Figma's "Opus 5" still tracks the stripper. */
function formatSpawnModel(model: string | null): string | null {
  const compact = formatSubagentModelLabel(model, null);
  if (!compact) {
    return null;
  }
  return compact
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function formatSpawnEffort(effort: string | null): string | null {
  if (!effort) {
    return null;
  }
  const lower = effort.toLocaleLowerCase();
  if (lower === "medium" || lower === "med") {
    return "Med";
  }
  return `${effort[0]!.toUpperCase()}${effort.slice(1).toLocaleLowerCase()}`;
}
