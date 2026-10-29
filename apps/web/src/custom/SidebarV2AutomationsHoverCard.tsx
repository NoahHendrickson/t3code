/**
 * What the sidebar's Automations row shows on hover — see
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`. The runs the
 * row counts, each with its mark, automation name, thread title, project and
 * pull request, in the glass hover card a thread card uses.
 */
import type { EnvironmentId, ScheduledTaskRun } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useEffect, useRef } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ThreadHoverCard, ThreadHoverCardPopup } from "~/components/ThreadHoverCard";
import { cn } from "~/lib/utils";
import { useProject } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { runPullRequest } from "./scheduled/scheduledPage.logic";
import {
  SCHEDULED_RUN_ACTIVITY_MARKS,
  type ScheduledRunActivityEntry,
} from "./scheduledRunActivity";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";
import { SidebarV2StatusMark } from "./SidebarV2StatusIndicator";

type AutomationRun = ScheduledRunActivityEntry<EnvironmentThreadShell>;

/** A tooltip cannot scroll (its positioner is pointer-events-none), so past
    this the card counts the rest; All runs, one click away, lists them. */
const AUTOMATIONS_HOVER_CARD_LIMIT = 6;

/** The Automations row's hover card. Base UI mounts the popup's children
    only while it is open, so the row never subscribes to tasks or runs; the
    first hover does. */
export function SidebarV2AutomationsHoverCard(props: {
  readonly title: string;
  readonly runs: ReadonlyArray<AutomationRun>;
}) {
  const shown = props.runs.slice(0, AUTOMATIONS_HOVER_CARD_LIMIT);
  const overflow = props.runs.length - shown.length;
  const byEnvironment = new Map<EnvironmentId, AutomationRun[]>();
  for (const run of shown) {
    const group = byEnvironment.get(run.thread.environmentId);
    if (group) group.push(run);
    else byEnvironment.set(run.thread.environmentId, [run]);
  }
  return (
    <ThreadHoverCardPopup side="right" align="start" sideOffset={4}>
      <ThreadHoverCard
        title={props.title}
        footer={
          overflow > 0 ? (
            <div className="pl-0.5 text-xs text-muted-foreground">{`+${overflow} more`}</div>
          ) : null
        }
      >
        {[...byEnvironment].map(([environmentId, runs]) => (
          <AutomationsEnvironmentRuns
            key={environmentId}
            environmentId={environmentId}
            runs={runs}
          />
        ))}
      </ThreadHoverCard>
    </ThreadHoverCardPopup>
  );
}

/** One environment's tasks and newest runs page, read once for all its rows. */
function AutomationsEnvironmentRuns(props: {
  readonly environmentId: EnvironmentId;
  readonly runs: ReadonlyArray<AutomationRun>;
}) {
  const tasks = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: props.environmentId, input: {} }),
  ).data?.tasks;
  const taskTitles = new Map((tasks ?? []).map((task) => [task.id, task.title] as const));
  // The shell does not carry the run's message id, which is where a
  // GitHub-triggered run names its PR, so it comes from run history.
  const runsQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskRuns({ environmentId: props.environmentId, input: {} }),
  );
  const page = runsQuery.data;
  const historyByThread = new Map((page?.runs ?? []).map((run) => [run.threadId, run] as const));
  // A run that waits on you or failed unopened can sit behind a full page of
  // newer runs; those fall back to the thread's own PR. Only a run that
  // started after the page's oldest entry means the cached page is stale,
  // and reopening the card does not reliably revalidate it.
  const oldestOnPage = page?.nextCursor === null ? null : page?.runs.at(-1)?.requestedAt;
  const pageIsStale =
    page !== null &&
    oldestOnPage !== undefined &&
    props.runs.some(
      ({ thread }) =>
        !historyByThread.has(thread.id) &&
        (oldestOnPage === null || Date.parse(thread.createdAt) >= Date.parse(oldestOnPage)),
    );
  const { refresh } = runsQuery;
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (!pageIsStale || refreshedRef.current) return;
    refreshedRef.current = true;
    refresh();
  }, [pageIsStale, refresh]);
  return props.runs.map(({ thread, kind }) => (
    <AutomationsHoverCardRun
      key={thread.id}
      thread={thread}
      kind={kind}
      taskTitle={
        thread.source?.scheduledTaskId === undefined
          ? undefined
          : taskTitles.get(thread.source.scheduledTaskId)
      }
      historyRun={historyByThread.get(thread.id)}
    />
  ));
}

function AutomationsHoverCardRun(
  props: AutomationRun & {
    readonly taskTitle: string | undefined;
    readonly historyRun: ScheduledTaskRun | undefined;
  },
) {
  const { thread, taskTitle } = props;
  const pullRequest = runPullRequest(props.historyRun?.messageId ?? null, thread);
  const project = useProject({ environmentId: thread.environmentId, projectId: thread.projectId });
  return (
    <div className="flex min-w-0 items-start gap-2" data-testid="sidebar-v2-scheduled-hover-run">
      <span
        className={cn(
          "mt-px flex shrink-0 items-center justify-center",
          SIDEBAR_V2_CARD_ALIGNMENT.statusBox,
        )}
      >
        <SidebarV2StatusMark status={SCHEDULED_RUN_ACTIVITY_MARKS[props.kind]} seed={thread.id} />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="min-w-0 truncate text-foreground">{taskTitle ?? thread.title}</div>
        {taskTitle !== undefined ? (
          <div className="min-w-0 truncate text-foreground/75">{thread.title}</div>
        ) : null}
        {project || pullRequest ? (
          <div className="flex min-w-0 items-center gap-1.5">
            {project ? (
              <>
                <ProjectFavicon project={project} className="size-3 shrink-0" />
                <div className="min-w-0 truncate text-foreground/75">{project.title}</div>
              </>
            ) : null}
            {pullRequest ? (
              <div className="shrink-0 tabular-nums">#{pullRequest.number}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
