import { githubPrRunContext } from "@t3tools/contracts";
/**
 * Run history for scheduled tasks — see
 * `.fork/customizations.yaml#fork-scheduled-page`. Every run is a thread (or
 * a turn in the task's bound thread), so a row opens the thread the way the
 * sidebar would. The rows come from the server's `scheduledTasks.listRuns`
 * snapshot; the thread shell the client already holds overlays a live status
 * when it describes the same run, so a run that is still working updates
 * without a refetch.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  EnvironmentId,
  ScheduledTaskId,
  ScheduledTaskRun,
  ScheduledTaskListRunsInput,
} from "@t3tools/contracts";

import { useRelativeTimeTick } from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useProject, useThreadShell } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import {
  formatDuration,
  overlayRunStatus,
  presentRunStatus,
  relativeLabel,
  runDurationSeconds,
  TRIGGER_LABELS,
} from "./scheduledPage.logic";

export function ScheduledRunsHeader(props: { readonly showTask: boolean }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Status</TableHead>
        <TableHead>{props.showTask ? "Task" : "Thread"}</TableHead>
        <TableHead>Trigger</TableHead>
        <TableHead>Started</TableHead>
        <TableHead>Duration</TableHead>
        <TableHead>
          <span className="sr-only">Open</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

const COLUMN_COUNT = 6;

function NoticeRow(props: { readonly children: string; readonly tone?: "error" | "muted" }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={COLUMN_COUNT}
        className={props.tone === "error" ? "text-destructive" : "text-muted-foreground"}
        role="status"
      >
        {props.children}
      </TableCell>
    </TableRow>
  );
}

/**
 * One environment's rows. Omit `taskId` for every task in the environment;
 * `taskTitles` then names the task on each row. `refreshKey` refetches when
 * the owning task reports a new run, so a freshly fired task shows up
 * without the user reloading.
 */
export function ScheduledRunRows(props: {
  readonly environmentId: EnvironmentId;
  readonly taskId?: ScheduledTaskId | undefined;
  readonly showTask: boolean;
  readonly taskTitles?: ReadonlyMap<string, string> | undefined;
  readonly refreshKey?: string | undefined;
  readonly environmentLabel?: string | undefined;
}) {
  const [cursors, setCursors] = useState<Array<ScheduledTaskListRunsInput["cursor"]>>([]);
  const cursor = cursors.at(-1);
  const runsQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskRuns({
      environmentId: props.environmentId,
      input: {
        ...(props.taskId === undefined ? {} : { id: props.taskId }),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  );
  const { refresh } = runsQuery;
  const lastRefreshKey = useRef(props.refreshKey);
  useEffect(() => {
    if (lastRefreshKey.current === props.refreshKey) return;
    lastRefreshKey.current = props.refreshKey;
    refresh();
  }, [props.refreshKey, refresh]);
  useRelativeTimeTick(30_000);
  const runs = runsQuery.data?.runs ?? null;
  const nextCursor = runsQuery.data?.nextCursor ?? null;
  return (
    <TableBody>
      {props.environmentLabel !== undefined ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="text-muted-foreground">
            {props.environmentLabel}
          </TableCell>
        </TableRow>
      ) : null}
      {runsQuery.error !== null ? (
        <NoticeRow tone="error">{runsQuery.error}</NoticeRow>
      ) : runs === null ? (
        <NoticeRow>Loading runs…</NoticeRow>
      ) : runs.length === 0 ? (
        <NoticeRow>
          {cursors.length > 0
            ? "No older runs."
            : props.taskId === undefined
              ? "No runs yet."
              : "This task has not run yet."}
        </NoticeRow>
      ) : (
        runs.map((run) => (
          <ScheduledRunRow
            key={run.messageId}
            environmentId={props.environmentId}
            run={run}
            showTask={props.showTask}
            taskTitle={props.taskTitles?.get(run.taskId)}
          />
        ))
      )}
      {cursors.length > 0 || nextCursor !== null ? (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT}>
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={cursors.length === 0 || runsQuery.isPending}
                onClick={() => setCursors((current) => current.slice(0, -1))}
              >
                Newer
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={nextCursor === null || runsQuery.isPending || runsQuery.error !== null}
                onClick={() => {
                  if (nextCursor !== null) setCursors((current) => [...current, nextCursor]);
                }}
              >
                Older
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </TableBody>
  );
}

function ScheduledRunRow(props: {
  readonly environmentId: EnvironmentId;
  readonly run: ScheduledTaskRun;
  readonly showTask: boolean;
  readonly taskTitle?: string | undefined;
}) {
  const navigate = useNavigate();
  const { run } = props;
  const pullRequest = githubPrRunContext(run.messageId);
  const shell = useThreadShell({ environmentId: props.environmentId, threadId: run.threadId });
  const project = useProject({ environmentId: props.environmentId, projectId: run.projectId });
  const status = presentRunStatus(
    overlayRunStatus(
      run,
      shell?.latestRun ? { runId: shell.latestRun.runId, status: shell.latestRun.status } : null,
    ),
  );
  const duration = runDurationSeconds(run);
  const open = () =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: props.environmentId, threadId: run.threadId },
    });
  return (
    <TableRow
      className="cursor-pointer"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      data-testid="scheduled-run-row"
    >
      <TableCell>
        <Badge variant={status.tone}>{status.label}</Badge>
      </TableCell>
      <TableCell className="max-w-96 whitespace-normal">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {props.showTask
              ? (props.taskTitle ?? shell?.title ?? run.threadTitle)
              : (shell?.title ?? run.threadTitle)}
          </span>
          {pullRequest ? (
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="truncate text-muted-foreground underline underline-offset-2"
            >
              {pullRequest.label}
            </a>
          ) : (
            <span className="truncate text-muted-foreground">
              {props.showTask ? (shell?.title ?? run.threadTitle) : (project?.title ?? "")}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{TRIGGER_LABELS[run.trigger]}</TableCell>
      <TableCell className="text-muted-foreground">{relativeLabel(run.requestedAt)}</TableCell>
      <TableCell className="text-muted-foreground">
        {duration === null ? (status.live ? "Running" : "—") : formatDuration(duration)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        <ArrowUpRightIcon className="inline size-3.5" aria-hidden />
      </TableCell>
    </TableRow>
  );
}
