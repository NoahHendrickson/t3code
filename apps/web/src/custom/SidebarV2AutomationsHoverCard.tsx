/**
 * What the sidebar's Automations row shows on hover — see
 * `.fork/customizations.yaml#fork-scheduled-runs-off-sidebar`. The runs the
 * row counts, each with its mark, automation name, thread title, project and
 * pull request, in the glass hover card a thread card uses.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useEffect, useRef } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ThreadHoverCard, ThreadHoverCardPopup } from "~/components/ThreadHoverCard";
import { cn } from "~/lib/utils";
import { useProject } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { runPullRequest } from "./scheduled/scheduledPage.logic";
import { listScheduledRunActivity, type ScheduledRunActivityKind } from "./scheduledRunActivity";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";
import { SidebarV2StatusMark, type SidebarV2TopStatusMark } from "./SidebarV2StatusIndicator";

const AUTOMATION_RUN_MARKS: Record<ScheduledRunActivityKind, SidebarV2TopStatusMark> = {
  working: { label: "Running", mark: "working" },
  needsYou: { label: "Waiting on you", mark: "dot", tone: "approval" },
  failed: { label: "Failed", mark: "dot", tone: "failed" },
};

/** The Automations row's hover card. Base UI mounts the popup's children
    only while it is open, so the row never subscribes to tasks or runs; the
    first hover does. */
export function SidebarV2AutomationsHoverCard(props: {
  readonly title: string;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
}) {
  return (
    <ThreadHoverCardPopup side="right" align="start" sideOffset={4}>
      <AutomationsHoverCardRuns title={props.title} threads={props.threads} />
    </ThreadHoverCardPopup>
  );
}

function AutomationsHoverCardRuns(props: {
  readonly title: string;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
}) {
  return (
    <ThreadHoverCard title={props.title}>
      {listScheduledRunActivity(props.threads).map(({ thread, kind }) => (
        <AutomationsHoverCardRun
          key={`${thread.environmentId}:${thread.id}`}
          thread={thread}
          kind={kind}
        />
      ))}
    </ThreadHoverCard>
  );
}

function AutomationsHoverCardRun(props: {
  readonly thread: EnvironmentThreadShell;
  readonly kind: ScheduledRunActivityKind;
}) {
  const { thread } = props;
  const tasks = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: thread.environmentId, input: {} }),
  ).data?.tasks;
  const taskTitle = tasks?.find((task) => task.id === thread.source?.scheduledTaskId)?.title;
  // The shell does not carry the run's message id, which is where a
  // GitHub-triggered run names its PR. The newest page is the one All runs
  // opens on, and a live run is always on it.
  const runsQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskRuns({ environmentId: thread.environmentId, input: {} }),
  );
  const run = runsQuery.data?.runs.find((candidate) => candidate.threadId === thread.id);
  // A page cached before this run started does not list it, and reopening
  // the card does not reliably revalidate it. Refetch once.
  const runMissing = runsQuery.data !== null && run === undefined;
  const { refresh } = runsQuery;
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (!runMissing || refreshedRef.current) return;
    refreshedRef.current = true;
    refresh();
  }, [runMissing, refresh]);
  const pullRequest = runPullRequest(run?.messageId ?? "", thread);
  const project = useProject({ environmentId: thread.environmentId, projectId: thread.projectId });
  return (
    <div className="flex min-w-0 items-start gap-2" data-testid="sidebar-v2-scheduled-hover-run">
      <span
        className={cn(
          "mt-px flex shrink-0 items-center justify-center",
          SIDEBAR_V2_CARD_ALIGNMENT.statusBox,
        )}
      >
        <SidebarV2StatusMark status={AUTOMATION_RUN_MARKS[props.kind]} seed={thread.id} />
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
