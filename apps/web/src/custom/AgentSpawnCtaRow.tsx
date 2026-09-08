/**
 * In-chat spawn CTA. Replaces upstream's bordered one-line bar with the
 * Figma tree (t3-fork file, node 376:21366): a header plus an indented
 * member list. Clicking still opens the Agents panel — the panel remains
 * the full roster; this is the transcript summary.
 *
 * See `.fork/customizations.yaml#fork-subagent-spawn-card`.
 */
import { TreeView } from "@phosphor-icons/react";
import {
  formatSubagentTokenCount,
  isActiveSubagentStatus,
  type AgentPanelModel,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { SidebarV2StatusDot, SidebarV2WorkingRain } from "./SidebarV2StatusIndicator";

export type AgentSpawnCtaSpawn = {
  readonly workflowId: string | null;
  readonly agentTaskIds: ReadonlyArray<string>;
};

export function AgentSpawnCtaRow(props: {
  readonly spawn: AgentSpawnCtaSpawn;
  readonly agentPanelModel: AgentPanelModel;
  readonly onOpenAgents: () => void;
}) {
  const { spawn, agentPanelModel, onOpenAgents } = props;
  const memberIds = new Set(spawn.agentTaskIds);
  const workflowGroup = spawn.workflowId
    ? agentPanelModel.workflows.find((group) => group.workflow.id === spawn.workflowId)
    : undefined;
  const agents = workflowGroup
    ? [...workflowGroup.phases.flatMap((phase) => phase.members), ...workflowGroup.unphasedMembers]
    : agentPanelModel.directAgents.filter((agent) => memberIds.has(agent.id));
  const agentCount = Math.max(
    agents.length,
    Math.max(memberIds.size - (spawn.workflowId ? 1 : 0), 0),
  );

  const running = agents.filter(
    (agent) => agent.status === "running" || agent.status === "pending",
  ).length;
  const waiting = agents.filter((agent) => agent.status === "waiting").length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  // The coordinator's own status is authoritative for workflows: dynamic
  // spawns mean the member list can be momentarily all-settled while the
  // run is still mid-flight. A workflow is live until the coordinator itself
  // reaches a terminal state.
  const coordinatorStatus = workflowGroup?.workflow.status;
  const coordinatorSettled =
    coordinatorStatus === "completed" ||
    coordinatorStatus === "failed" ||
    coordinatorStatus === "cancelled" ||
    coordinatorStatus === "interrupted";
  const live = workflowGroup !== undefined ? !coordinatorSettled : running + waiting > 0;
  const livePhase = workflowGroup?.phases.find((phase) => phase.state === "running");
  const workflowName =
    workflowGroup?.workflow.workflowName ?? workflowGroup?.workflow.title ?? null;

  // Waiting and stalled agents read as working; only settled states
  // differentiate. Phase title stays when a workflow is mid-phase.
  const working = running + waiting;
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

  return (
    <button
      type="button"
      data-fork-subagent-spawn-card=""
      onClick={onOpenAgents}
      className="flex w-full flex-col items-start gap-3.5 text-left text-sm leading-5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
    >
      <span className="flex w-full items-start gap-2">
        <span aria-hidden className="flex size-4 shrink-0 items-center py-px">
          <TreeView weight="regular" className="size-4 text-foreground" />
        </span>
        <span className="flex min-w-0 flex-col items-start">
          <span className="min-w-0 text-foreground">
            <span>{lead}</span>
            {workflowName ? <span className="text-muted-foreground"> · {workflowName}</span> : null}
          </span>
          <span className="flex items-start gap-3 whitespace-nowrap text-muted-foreground">
            <span>{status}</span>
            <span className="underline decoration-solid">View agents</span>
          </span>
        </span>
      </span>
      {agents.length > 0 ? (
        <span className="flex flex-col items-start gap-3.5 pl-6">
          {agents.map((agent) => (
            <SpawnAgentRow key={agent.id} agent={agent} />
          ))}
        </span>
      ) : null}
    </button>
  );
}

function SpawnAgentRow({ agent }: { readonly agent: RuntimeSubagent }) {
  const live = isActiveSubagentStatus(agent.status);
  const metadata = [
    formatSpawnModel(agent.model),
    formatSpawnEffort(agent.effort),
    agent.usage && agent.usage.totalTokens > 0
      ? `${formatSubagentTokenCount(agent.usage.totalTokens)} tokens`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <span className="flex items-start gap-2">
      <span aria-hidden className="flex items-center py-1">
        {live ? (
          <SidebarV2WorkingRain seed={agent.id} />
        ) : agent.status === "failed" ? (
          <SidebarV2StatusDot tone="failed" />
        ) : agent.status === "completed" ? (
          <SidebarV2StatusDot tone="done" />
        ) : (
          <SidebarV2StatusDot tone="input" />
        )}
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="min-w-0 truncate text-foreground">{agent.title}</span>
        <span className="min-w-0 truncate text-muted-foreground">{agentDetail(agent)}</span>
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

function agentDetail(agent: RuntimeSubagent): string {
  if (isActiveSubagentStatus(agent.status)) {
    return agent.progress ?? agent.lastToolName ?? "Working";
  }
  if (agent.status === "failed") {
    return agent.error ?? "Failed";
  }
  if (agent.status === "completed") {
    return agent.result ?? "Completed";
  }
  if (agent.status === "idle") {
    return "Idle";
  }
  return "Stopped";
}

/** Compact provider ids into the Figma-style title case ("Opus 5"). */
function formatSpawnModel(model: string | null): string | null {
  if (!model) {
    return null;
  }
  const compact = model
    .replace(/^claude-/u, "")
    .replace(/-\d{8}$/u, "")
    .replace(/-latest$/u, "");
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
