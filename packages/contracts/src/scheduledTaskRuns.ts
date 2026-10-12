/**
 * Run history for scheduled tasks — see
 * `.fork/customizations.yaml#fork-scheduled-page`.
 *
 * A run is the user message a scheduled task dispatched: either the first
 * message of a thread the task launched, or a message it queued into its
 * bound thread. The server derives the list from the message ids the task
 * service already mints (`scheduled-task-message:<taskId>:…`) and joins the
 * V2 run and thread projections, so nothing new is persisted. The status is
 * the agent run's status, not the task's dispatch status: a dispatch that
 * never produced a thread is not a run here, and the task's own
 * `lastRunError` still reports it.
 */
import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  MessageId,
  ProjectId,
  RunId,
  ScheduledTaskId,
  ThreadId,
} from "./baseSchemas.ts";
import { OrchestrationV2RunStatus } from "./orchestrationV2.ts";

/** Why the task fired. Parsed from the message id the service minted. */
export const ScheduledTaskRunTrigger = Schema.Literals(["scheduled", "manual", "webhook"]);
export type ScheduledTaskRunTrigger = typeof ScheduledTaskRunTrigger.Type;

export const ScheduledTaskRun = Schema.Struct({
  taskId: ScheduledTaskId,
  messageId: MessageId,
  threadId: ThreadId,
  projectId: ProjectId,
  threadTitle: Schema.String,
  trigger: ScheduledTaskRunTrigger,
  /** Null while the message is queued behind a turn in its bound thread. */
  runId: Schema.NullOr(RunId),
  status: Schema.NullOr(OrchestrationV2RunStatus),
  /** When the run was requested, or the message was recorded if no run exists yet. */
  requestedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type ScheduledTaskRun = typeof ScheduledTaskRun.Type;

export const SCHEDULED_TASK_RUNS_DEFAULT_LIMIT = 100;

const ScheduledTaskRunsCursor = Schema.Struct({
  requestedAt: IsoDateTime,
  turnItemId: Schema.String,
});

export const ScheduledTaskListRunsInput = Schema.Struct({
  /** Omit to list runs of every task in the environment. */
  id: Schema.optional(ScheduledTaskId),
  cursor: Schema.optional(ScheduledTaskRunsCursor),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 }))),
});
export type ScheduledTaskListRunsInput = typeof ScheduledTaskListRunsInput.Type;

export const ScheduledTaskListRunsResult = Schema.Struct({
  runs: Schema.Array(ScheduledTaskRun),
  nextCursor: Schema.NullOr(ScheduledTaskRunsCursor),
});
export type ScheduledTaskListRunsResult = typeof ScheduledTaskListRunsResult.Type;
