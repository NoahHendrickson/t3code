import type { ScheduledTask, ScheduledTaskUpsertSchedule, ProjectId } from "@t3tools/contracts";
import {
  scheduleFromDraft,
  taskToDraft,
  type DraftState,
} from "~/components/settings/scheduledTasksSettings.logic";

export type AutomationDraft = DraftState & {
  readonly githubPrOpened?: boolean;
  readonly githubProjectIds?: ReadonlyArray<string>;
};

export function automationTaskToDraft(task: ScheduledTask): AutomationDraft {
  return {
    ...taskToDraft(task),
    githubPrOpened: task.schedule.type === "webhook" && task.schedule.github != null,
    githubProjectIds:
      task.schedule.type === "webhook"
        ? (task.schedule.github?.repositories.map((entry) => entry.projectId) ?? [])
        : [],
  };
}

export function automationScheduleFromDraft(
  draft: AutomationDraft,
): ScheduledTaskUpsertSchedule | null {
  if (draft.githubPrOpened)
    return {
      type: "webhook",
      github: {
        repositories: (draft.githubProjectIds ?? []).map((projectId) => ({
          projectId: projectId as ProjectId,
        })),
      },
    };
  const schedule = scheduleFromDraft(draft);
  return schedule?.type === "webhook" ? { ...schedule, github: null } : schedule;
}
