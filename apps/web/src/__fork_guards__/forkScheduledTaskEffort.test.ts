import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ModelSelection, ProviderInstanceId, ScheduledTask } from "@t3tools/contracts";
import { taskToDraft } from "../components/settings/scheduledTasksSettings.logic";
import {
  scheduledTaskModelSelection,
  scheduledTaskModelWithOptions,
} from "../custom/scheduled/scheduledTaskModel.logic";

const decodeTask = Schema.decodeSync(ScheduledTask);
const saved = Schema.decodeSync(ModelSelection)({
  instanceId: "codex",
  model: "gpt-5.4",
  options: [
    { id: "reasoningEffort", value: "high" },
    { id: "serviceTier", value: "priority" },
  ],
});
const selected = { instanceId: saved.instanceId, model: saved.model };

describe("fork guard: scheduled task effort", () => {
  it("restores saved effort instead of losing it when parsing the model picker key", () => {
    expect(scheduledTaskModelSelection(selected, saved)).toEqual(saved);
  });

  it("round-trips edited effort through the persisted task and editor draft", () => {
    const edited = scheduledTaskModelWithOptions(saved, [
      { id: "reasoningEffort", value: "low" },
      { id: "serviceTier", value: "priority" },
    ]);
    const task = decodeTask({
      id: "scheduled-task:effort",
      title: "Review PRs",
      prompt: "Review for bugs",
      enabled: true,
      schedule: { type: "interval", everyMs: 3600000 },
      projectId: "project",
      threadId: null,
      workspaceStrategy: { type: "root" },
      modelSelection: edited,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdBy: "user",
      creationSource: "web",
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-12T00:00:00.000Z",
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: "never",
      lastRunError: null,
      runCount: 0,
    });
    const draft = taskToDraft(task);
    expect(draft.modelKey).toBe("codex:gpt-5.4");
    expect(scheduledTaskModelSelection(selected, draft.baseModelSelection)).toEqual({
      ...saved,
      options: [
        { id: "reasoningEffort", value: "low" },
        { id: "serviceTier", value: "priority" },
      ],
    });
  });

  it.each([
    { ...selected, model: "another-model" },
    { ...selected, instanceId: ProviderInstanceId.make("another-instance") },
  ])("does not carry effort across a change to %s", (next) => {
    expect(scheduledTaskModelSelection(next, saved)).toEqual(next);
    expect(scheduledTaskModelSelection(next, saved)?.options).toBeUndefined();
  });

  it("keeps configured default effort for a new task", () => {
    expect(scheduledTaskModelSelection(saved, null)).toEqual(saved);
  });

  it("clears effort without restoring the previous saved value", () => {
    const cleared = scheduledTaskModelWithOptions(saved, undefined);
    expect(scheduledTaskModelSelection(selected, cleared)).toEqual({
      instanceId: "codex",
      model: "gpt-5.4",
    });
  });
});
