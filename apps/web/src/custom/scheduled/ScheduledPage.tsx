/**
 * The Scheduled page — see `.fork/customizations.yaml#fork-scheduled-page`.
 * One workspace page for every scheduled task across every project and
 * environment: a filter row and a table of tasks that
 * opens each one as its own page (ScheduledTaskDetail). "All runs" lists
 * every run the environment ever made. The shell is the Usage page's:
 * SidebarInset, the workspace header, a scroll area, the wide container.
 */
import { useAtomValue } from "@effect/atom-react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ClockIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScheduledTask,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { useRelativeTimeTick } from "~/components/settings/settingsLayout";
import { useNavigateToMainApp } from "~/components/sidebar/mainAppLocation";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SidebarInset } from "~/components/ui/sidebar";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { WorkspacePageContainer } from "~/components/WorkspacePageContainer";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { requestConfirmDialog } from "~/confirmDialog";
import { isElectron } from "~/env";
import { useProjects } from "~/state/entities";
import { type EnvironmentPresentation } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { readEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  matchesTaskQuery,
  relativeLabel,
  scheduleLabel,
  shortModelName,
} from "./scheduledPage.logic";
import { ScheduledCard, useConnectedEnvironments } from "./scheduledPageChrome";
import { ScheduledRunRows, ScheduledRunsHeader } from "./ScheduledRunsTable";
import { ScheduledTaskDetail } from "./ScheduledTaskDetail";

/**
 * Escape steps back a level, except from a field or popup: leaving the task
 * editor from its prompt would throw away the unsaved draft.
 */
function useEscapeToLeave(onEscape: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.key !== "Escape")
        return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[role="dialog"], [aria-modal="true"], [data-slot$="popup"]') !== null)
        return;
      event.preventDefault();
      // The first Escape only leaves the field; a second one leaves the page.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        target.blur();
        return;
      }
      onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape]);
}

export function ScheduledPage() {
  // Read through the router rather than the route module: the route file
  // imports this page, and a cycle would put the split chunk on the hook.
  const search = useSearch({ from: "/scheduled" });
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const environments = useConnectedEnvironments();
  const atRoot = search.task === undefined && search.view === undefined;
  useEscapeToLeave(() => {
    if (atRoot) void navigateToMainApp();
    else void navigate({ to: "/scheduled", search: {} });
  });
  const environmentId =
    search.env !== undefined
      ? search.env
      : environments.length > 0
        ? environments[0]!.environmentId
        : null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      {/* Glass sets the page on the stage card, as a chat view is
          (theme.custom.glass-stage.css). */}
      <div data-fork-stage-card="" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageHeader electron={isElectron}>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <ZapIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">Automations</span>
          </div>
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="wide">
            {search.task !== undefined && environmentId !== null ? (
              <ScheduledTaskDetail
                environmentId={environmentId}
                taskId={search.task}
                tab={search.tab ?? "settings"}
                starter={search.starter}
              />
            ) : search.view === "runs" ? (
              <AllRuns environments={environments} />
            ) : (
              <TaskList environments={environments} />
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

function TaskList(props: { readonly environments: ReadonlyArray<EnvironmentPresentation> }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState<EnvironmentId | "all">("all");
  const defaultEnvironmentId = props.environments[0]?.environmentId ?? null;
  const canCreate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(defaultEnvironmentId),
  );
  const visibleEnvironments =
    environmentFilter === "all"
      ? props.environments
      : props.environments.filter((entry) => entry.environmentId === environmentFilter);
  const openNew = () => {
    if (defaultEnvironmentId === null) return;
    void navigate({
      to: "/scheduled",
      search: {
        env: defaultEnvironmentId,
        task: "new",
      },
    });
  };
  return (
    <div className="flex flex-col gap-6" data-testid="scheduled-task-list">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run agents on a timer or when something happens, in any of your projects. Every run is a
            thread you can open and reply to.
          </p>
        </div>
        <Button
          size="sm"
          disabled={!canCreate || defaultEnvironmentId === null}
          onClick={() => openNew()}
          data-testid="scheduled-new-task"
        >
          <PlusIcon />
          New automation
        </Button>
      </div>

      {props.environments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockIcon />
            </EmptyMedia>
            <EmptyTitle>No environments connected</EmptyTitle>
            <EmptyDescription>Connect an environment to see its automations.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {props.environments.length > 1 ? (
              <ToggleGroup
                aria-label="Environment"
                value={[environmentFilter]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === undefined) return;
                  setEnvironmentFilter(
                    next === "all"
                      ? "all"
                      : (props.environments.find((entry) => entry.environmentId === next)
                          ?.environmentId ?? "all"),
                  );
                }}
              >
                <Toggle value="all">All</Toggle>
                {props.environments.map((entry) => (
                  <Toggle key={entry.environmentId} value={entry.environmentId}>
                    {entry.label}
                  </Toggle>
                ))}
              </ToggleGroup>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <Link
                to="/scheduled"
                search={{ view: "runs" }}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                data-testid="scheduled-all-runs"
              >
                All runs
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </Link>
              <div className="w-56">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search automations"
                    placeholder="Search…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </InputGroup>
              </div>
            </div>
          </div>
          <ScheduledCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {visibleEnvironments.map((environment) => (
                <EnvironmentTaskRows
                  key={environment.environmentId}
                  environment={environment}
                  showEnvironment={visibleEnvironments.length > 1}
                  query={query}
                />
              ))}
            </Table>
          </ScheduledCard>
        </>
      )}
    </div>
  );
}

const TASK_COLUMN_COUNT = 6;

function TaskNoticeRow(props: { readonly children: string; readonly tone?: "error" | "muted" }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={TASK_COLUMN_COUNT}
        className={props.tone === "error" ? "text-destructive" : "text-muted-foreground"}
        role="status"
      >
        {props.children}
      </TableCell>
    </TableRow>
  );
}

function EnvironmentTaskRows(props: {
  readonly environment: EnvironmentPresentation;
  readonly showEnvironment: boolean;
  readonly query: string;
}) {
  const { environmentId } = props.environment;
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const tasks = useMemo(
    () => tasksQuery.data?.tasks.filter((task) => matchesTaskQuery(task, props.query)) ?? null,
    [tasksQuery.data, props.query],
  );
  useRelativeTimeTick(60_000);
  return (
    <TableBody>
      {props.showEnvironment ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={TASK_COLUMN_COUNT} className="text-muted-foreground">
            {props.environment.label}
          </TableCell>
        </TableRow>
      ) : null}
      {tasksQuery.error !== null ? (
        <TaskNoticeRow tone="error">{tasksQuery.error}</TaskNoticeRow>
      ) : tasks === null ? (
        <TaskNoticeRow>Loading automations…</TaskNoticeRow>
      ) : tasks.length === 0 ? (
        <TaskNoticeRow>
          {props.query.trim() ? "No automations match your search." : "No automations yet."}
        </TaskNoticeRow>
      ) : (
        tasks.map((task) => <TaskRow key={task.id} environmentId={environmentId} task={task} />)
      )}
    </TableBody>
  );
}

function TaskRow(props: { readonly environmentId: EnvironmentId; readonly task: ScheduledTask }) {
  const { environmentId, task } = props;
  const navigate = useNavigate();
  const projects = useProjects();
  const project = projects.find(
    (entry) => entry.environmentId === environmentId && entry.id === task.projectId,
  );
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const isWebhook = task.schedule.type === "webhook";
  const toggle = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const run = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const open = (tab?: "runs") =>
    void navigate({
      to: "/scheduled",
      search: { env: environmentId, task: task.id, ...(tab === undefined ? {} : { tab }) },
    });
  const act = async (action: "toggle" | "run" | "delete") => {
    if (busy || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    if (action === "delete") {
      const confirmed =
        (await requestConfirmDialog(`Delete "${task.title}"?\nIts run history stays as threads.`, {
          variant: "destructive",
        })) ?? window.confirm(`Delete "${task.title}"?`);
      if (!confirmed) return;
    }
    setBusy(true);
    const result =
      action === "toggle"
        ? await toggle({ environmentId, input: { id: task.id, enabled: !task.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: task.id } })
          : await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not update automation",
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  const TriggerIcon = isWebhook
    ? ZapIcon
    : task.schedule.type === "interval"
      ? ClockIcon
      : CalendarClockIcon;
  return (
    <TableRow
      className="cursor-pointer"
      tabIndex={0}
      onClick={() => open()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          open();
        }
      }}
      data-testid="scheduled-task-row"
    >
      <TableCell className="max-w-96 whitespace-normal">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{task.title}</span>
          <span className="truncate text-muted-foreground">
            {project?.title ?? "Unknown project"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <TriggerIcon className="size-3.5 text-muted-foreground" aria-hidden />
            {scheduleLabel(task.schedule)}
          </span>
          <span className="text-muted-foreground">
            {!task.enabled
              ? "Paused"
              : isWebhook
                ? "Listening"
                : task.nextRunAt
                  ? `Next ${relativeLabel(task.nextRunAt)}`
                  : "Not scheduled"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          {task.enabled ? (
            <CheckIcon className="size-3.5 text-success-foreground" aria-hidden />
          ) : (
            <XIcon className="size-3.5 text-muted-foreground" aria-hidden />
          )}
          {task.enabled ? "Active" : "Inactive"}
        </span>
      </TableCell>
      <TableCell>
        {task.lastRunStatus === "never" ? (
          <span className="text-muted-foreground">Never</span>
        ) : (
          <div className="flex flex-col">
            <span className="text-muted-foreground">{relativeLabel(task.lastRunAt)}</span>
            {task.lastRunStatus === "failed" ? (
              <Badge variant="error">Failed to start</Badge>
            ) : task.lastRunStatus === "running" ? (
              <Badge variant="info">Starting</Badge>
            ) : null}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {shortModelName(task.modelSelection.model)}
      </TableCell>
      <TableCell className="text-right">
        <div
          className="inline-flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Switch
            size="sm"
            checked={task.enabled}
            disabled={busy || !canOperate}
            aria-label={`Enable ${task.title}`}
            onCheckedChange={() => void act("toggle")}
          />
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || !canOperate}
                  aria-label={`Actions for ${task.title}`}
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => open()}>
                <PencilIcon />
                Edit
              </MenuItem>
              <MenuItem onClick={() => open("runs")}>
                <HistoryIcon />
                Run history
              </MenuItem>
              {isWebhook ? null : (
                <MenuItem onClick={() => void act("run")}>
                  <PlayIcon />
                  Run now
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem onClick={() => void act("delete")}>
                <Trash2Icon />
                Delete
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AllRuns(props: { readonly environments: ReadonlyArray<EnvironmentPresentation> }) {
  return (
    <div className="flex flex-col gap-6" data-testid="scheduled-all-runs-view">
      <div className="flex flex-col gap-3">
        <Link
          to="/scheduled"
          search={{}}
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Automations
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">All runs</h1>
        <p className="text-sm text-muted-foreground">
          Every run your automations have made, newest first. Open one to read the thread.
        </p>
      </div>
      {props.environments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Connect an environment to see its runs.</p>
      ) : (
        <ScheduledCard>
          <Table>
            <ScheduledRunsHeader showTask />
            {props.environments.map((environment) => (
              <AllRunsEnvironment
                key={environment.environmentId}
                environment={environment}
                showEnvironment={props.environments.length > 1}
              />
            ))}
          </Table>
        </ScheduledCard>
      )}
    </div>
  );
}

function AllRunsEnvironment(props: {
  readonly environment: EnvironmentPresentation;
  readonly showEnvironment: boolean;
}) {
  const { environmentId } = props.environment;
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const taskTitles = useMemo(
    () => new Map((tasksQuery.data?.tasks ?? []).map((task) => [task.id, task.title] as const)),
    [tasksQuery.data],
  );
  const refreshKey = (tasksQuery.data?.tasks ?? [])
    .map((task) => `${task.id}:${task.runCount}:${task.lastRunAt ?? ""}`)
    .join("|");
  return (
    <ScheduledRunRows
      environmentId={environmentId}
      showTask
      taskTitles={taskTitles}
      refreshKey={refreshKey}
      environmentLabel={props.showEnvironment ? props.environment.label : undefined}
    />
  );
}
