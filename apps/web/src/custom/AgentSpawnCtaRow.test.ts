import { describe, expect, it } from "vite-plus/test";
import type {
  AgentPanelModel,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { resolveSpawnCta } from "./AgentSpawnCtaRow";

const STAMP = "2026-08-01T10:00:00.000Z";

function agent(over: Partial<RuntimeSubagent> & Pick<RuntimeSubagent, "id">): RuntimeSubagent {
  return {
    kind: "subagent",
    title: "Agent",
    role: null,
    model: null,
    effort: null,
    status: "completed",
    activationCount: 1,
    usage: null,
    progress: null,
    lastToolName: null,
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: STAMP,
    startedAt: STAMP,
    completedAt: STAMP,
    updatedAt: STAMP,
    ...over,
  };
}

function model(over: Partial<AgentPanelModel> = {}): AgentPanelModel {
  return {
    workflows: [],
    directAgents: [],
    runningCount: 0,
    waitingCount: 0,
    idleCount: 0,
    settledCount: 0,
    totalTokens: 0,
    hasAgents: false,
    liveCount: 0,
    ...over,
  };
}

describe("resolveSpawnCta", () => {
  it("surfaces coordinator usage when a workflow has no member rows", () => {
    const view = resolveSpawnCta(
      { workflowId: "wf-1", agentTaskIds: ["wf-1"] },
      model({
        workflows: [
          {
            workflow: agent({
              id: "wf-1",
              kind: "workflow",
              title: "Explore",
              workflowName: "Explore",
              usage: { totalTokens: 2400 },
            }),
            phases: [],
            unphasedMembers: [],
          },
        ],
      }),
    );
    expect(view.agents).toEqual([]);
    expect(view.coordinatorTokens).toBe(2400);
  });

  it("does not use coordinator usage when member rows can show their own", () => {
    const member = agent({
      id: "task-1",
      parentAgentId: "wf-1",
      usage: { totalTokens: 800 },
    });
    const view = resolveSpawnCta(
      { workflowId: "wf-1", agentTaskIds: ["wf-1", "task-1"] },
      model({
        workflows: [
          {
            workflow: agent({
              id: "wf-1",
              kind: "workflow",
              title: "Explore",
              usage: { totalTokens: 2400 },
            }),
            phases: [],
            unphasedMembers: [member],
          },
        ],
      }),
    );
    expect(view.agents).toEqual([member]);
    expect(view.coordinatorTokens).toBe(0);
  });
});
