import { randomUUID } from "~/lib/utils";
import {
  automationScheduleFromDraft as scheduleFromDraft,
  automationTaskToDraft as taskToDraft,
  type AutomationDraft as DraftState,
} from "./githubAutomation.logic";
/**
 * One scheduled task as a page — see
 * `.fork/customizations.yaml#fork-scheduled-page`. The title is the heading,
 * the on/off switch and the project sit under it, and two tabs split what
 * the task is (Settings) from what it did (Run history). Creating a task is
 * the same page with no history yet. Save semantics mirror upstream's editor
 * dialog so both doors write the same row; the switch on an existing task
 * flips the server immediately, the way the list's switch does.
 */
import { useAtomValue } from "@effect/atom-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AuthOrchestrationOperateScope,
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  type EnvironmentId,
  type OrchestrationV2ThreadLaunchWorkspaceStrategy,
  type ProjectId,
  type ScheduledTask,
  ScheduledTaskId,
  type ScheduledTaskUpsertInput,
  type ScheduledTaskWebhookDeliverySummary,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { WEBHOOK_SIGNATURE_DEFAULTS } from "~/components/settings/scheduledTasksSettings.logic";
import { useRelativeTimeTick } from "./useRelativeTimeTick";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Table } from "~/components/ui/table";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { requestConfirmDialog } from "~/confirmDialog";
import { readEnvironmentScope } from "~/state/session";
import { useProjects } from "~/state/entities";
import { useEnvironment } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  deliveryOutcomeLabel,
  deliveryOutcomeTone,
  draftSignature,
  relativeLabel,
  SCHEDULED_STARTERS,
  type ScheduledPageTab,
} from "./scheduledPage.logic";
import {
  EnvironmentLabel,
  ScheduledCard,
  ScheduledSectionLabel,
  useConnectedEnvironments,
} from "./scheduledPageChrome";
import { ScheduledRunRows, ScheduledRunsHeader } from "./ScheduledRunsTable";
import { ScheduledTaskEditor, useScheduledTaskModel } from "./ScheduledTaskEditor";

const EMPTY_DRAFT: DraftState = {
  editingId: null,
  title: "",
  prompt: "",
  enabled: true,
  scheduleMode: "fixed",
  intervalMinutes: "15",
  timeOfDay: "09:00",
  weekdays: new Set([1, 2, 3, 4, 5]),
  projectId: "",
  threadId: "",
  workspaceMode: "worktree",
  baseRef: "main",
  startFromOrigin: true,
  existingWorktreePath: "",
  modelKey: "",
  runtimeMode: "full-access",
  interactionMode: "default",
  baseModelSelection: null,
  signatureEnabled: false,
  ...WEBHOOK_SIGNATURE_DEFAULTS,
  signatureSecret: "",
  maxDeliveryAgeMinutes: "",
  replayKey: "",
  coalesceKey: "",
  coalesceWindowSeconds: "",
  filters: [],
  savedFilters: [],
};

function reportFailure(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : String(error),
    }),
  );
}

export function ScheduledTaskDetail(props: {
  readonly environmentId: EnvironmentId;
  readonly taskId: ScheduledTaskId | "new";
  readonly tab: ScheduledPageTab;
  readonly starter?: string | undefined;
}) {
  const environment = useEnvironment(props.environmentId);
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected
      ? serverEnvironment.scheduledTasksLive({ environmentId: props.environmentId, input: {} })
      : null,
  );
  if (props.taskId === "new") {
    const starter = SCHEDULED_STARTERS.find((entry) => entry.id === props.starter) ?? null;
    return (
      <TaskDetailForm
        key={`new:${props.environmentId}:${starter?.id ?? ""}`}
        environmentId={props.environmentId}
        task={null}
        initialDraft={
          starter === null
            ? EMPTY_DRAFT
            : {
                ...EMPTY_DRAFT,
                title: starter.title,
                prompt: starter.prompt,
                scheduleMode: starter.scheduleMode,
                githubPrOpened: starter.id === "review-prs",
                githubProjectIds: [],
                intervalMinutes: starter.scheduleMode === "interval" ? "180" : "15",
              }
        }
        tab="settings"
        connected={connected}
        listLoaded={tasksQuery.data !== null}
      />
    );
  }
  if (!connected) {
    return (
      <DetailNotice title="Environment disconnected">
        Reconnect {environment?.label ?? "this environment"} to open its automations.
      </DetailNotice>
    );
  }
  if (tasksQuery.error !== null) {
    return <DetailNotice title="Could not load automations">{tasksQuery.error}</DetailNotice>;
  }
  const task = tasksQuery.data?.tasks.find((entry) => entry.id === props.taskId) ?? null;
  if (tasksQuery.data === null) {
    return <DetailNotice title="Loading…">Fetching this automation.</DetailNotice>;
  }
  if (task === null) {
    return (
      <DetailNotice title="Automation unavailable">
        This automation no longer exists on {environment?.label ?? "this environment"}.
      </DetailNotice>
    );
  }
  return (
    <TaskDetailForm
      key={task.id}
      environmentId={props.environmentId}
      task={task}
      initialDraft={taskToDraft(task)}
      tab={props.tab}
      connected
      listLoaded
    />
  );
}

function DetailNotice(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <BackLink />
      <ScheduledCard className="p-4" role="status">
        <p className="text-sm font-medium">{props.title}</p>
        <p className="text-sm text-muted-foreground">{props.children}</p>
      </ScheduledCard>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/scheduled"
      search={{}}
      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" aria-hidden />
      Automations
    </Link>
  );
}

function TaskDetailForm(props: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly initialDraft: DraftState;
  readonly tab: ScheduledPageTab;
  readonly connected: boolean;
  readonly listLoaded: boolean;
}) {
  const { task } = props;
  const navigate = useNavigate();
  const environments = useConnectedEnvironments();
  // A new task can target any connected environment; an existing one cannot move.
  const [environmentId, setEnvironmentId] = useState(props.environmentId);
  const environment = useEnvironment(environmentId);
  const allProjects = useProjects();
  const projects = useMemo(
    () => allProjects.filter((project) => project.environmentId === environmentId),
    [allProjects, environmentId],
  );
  const [draft, setDraft] = useState<DraftState>(() =>
    task === null && props.initialDraft.projectId === ""
      ? { ...props.initialDraft, projectId: projects[0]?.id ?? "" }
      : props.initialDraft,
  );
  const selectedProjectId = draft.projectId || projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const model = useScheduledTaskModel({ environmentId, draft, project: selectedProject });
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "scheduled task upsert",
  });
  const setEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const runNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const [newTaskId] = useState(() => ScheduledTaskId.make(`scheduled-task:${randomUUID()}`));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const submissionPending = useRef(false);
  const savedSignature = useMemo(
    () => (task === null ? null : draftSignature(taskToDraft(task))),
    [task],
  );
  const dirty = savedSignature === null || draftSignature(draft) !== savedSignature;
  useRelativeTimeTick(60_000);

  const openTab = (tab: ScheduledPageTab) => {
    if (task === null) return;
    void navigate({
      to: "/scheduled",
      search: { env: environmentId, task: task.id, ...(tab === "runs" ? { tab } : {}) },
    });
  };

  const toggleEnabled = async (enabled: boolean) => {
    setDraft((current) => ({ ...current, enabled }));
    if (task === null || busy) return;
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    setBusy(true);
    const result = await setEnabled({ environmentId, input: { id: task.id, enabled } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      setDraft((current) => ({ ...current, enabled: !enabled }));
      reportFailure("Could not update automation", squashAtomCommandFailure(result));
    }
  };

  const runTaskNow = async () => {
    if (task === null || busy) return;
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    setBusy(true);
    const result = await runNow({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not run automation", squashAtomCommandFailure(result));
      return;
    }
    openTab("runs");
  };

  const deleteTask = async () => {
    if (task === null || busy) return;
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    const confirmed =
      (await requestConfirmDialog(`Delete "${task.title}"?\nIts run history stays as threads.`, {
        variant: "destructive",
      })) ?? window.confirm(`Delete "${task.title}"?`);
    if (!confirmed) return;
    setBusy(true);
    const result = await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not delete automation", squashAtomCommandFailure(result));
      return;
    }
    void navigate({ to: "/scheduled", search: {} });
  };

  const submit = async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      submissionPending.current ||
      saving ||
      !props.connected ||
      !props.listLoaded
    )
      return;
    const selection = model.activeSelection;
    if (
      !draft.title.trim() ||
      !draft.prompt.trim() ||
      !projects.some((project) => project.id === selectedProjectId) ||
      selection === null
    ) {
      reportFailure("Automation is incomplete", "Add a title, instructions, project, and model.");
      return;
    }
    if (
      draft.githubPrOpened &&
      (!draft.githubProjectIds?.length ||
        !draft.githubProjectIds.every((id) => projects.some((project) => project.id === id)))
    ) {
      reportFailure("Choose repositories", "Select at least one repository from this environment.");
      return;
    }
    const schedule = scheduleFromDraft(draft);
    if (schedule === null) {
      reportFailure(
        "Invalid age limit",
        `Enter whole minutes from 1 to ${MAX_WEBHOOK_DELIVERY_AGE_MINUTES}, or leave it blank.`,
      );
      return;
    }
    if (
      schedule.type === "webhook" &&
      schedule.signature &&
      (!schedule.signature.header ||
        (!schedule.signature.secret &&
          !(task?.schedule.type === "webhook" && task.webhook?.hasSecret)))
    ) {
      reportFailure("Signing secret is required", "Enter the signature header and secret.");
      return;
    }
    if (
      schedule.type === "interval" &&
      (!Number.isSafeInteger(schedule.everyMs) || schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS)
    ) {
      reportFailure("Invalid interval", "Enter an interval of at least one minute.");
      return;
    }
    if (
      !draft.githubPrOpened &&
      draft.workspaceMode === "existing_worktree" &&
      !draft.existingWorktreePath.trim()
    ) {
      reportFailure("Checkout path is required", "Enter the path of the checkout to run in.");
      return;
    }
    // Keep the original selection object (with provider options) when the
    // picker still points at the same instance+model.
    const modelSelection =
      draft.baseModelSelection !== null &&
      draft.baseModelSelection.instanceId === selection.instanceId &&
      draft.baseModelSelection.model === selection.model
        ? draft.baseModelSelection
        : selection;
    const workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy =
      draft.workspaceMode === "root"
        ? { type: "root" }
        : draft.workspaceMode === "existing_worktree"
          ? { type: "existing_worktree", worktreePath: draft.existingWorktreePath.trim() }
          : {
              type: "worktree",
              baseRef: draft.baseRef.trim() || "main",
              startFromOrigin: draft.startFromOrigin,
            };
    const input: ScheduledTaskUpsertInput = {
      ...(task ? { id: task.id, requireExisting: true } : { id: newTaskId }),
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      enabled: draft.enabled,
      schedule,
      projectId: selectedProjectId as ProjectId,
      threadId: draft.threadId ? (draft.threadId as ThreadId) : null,
      workspaceStrategy,
      modelSelection,
      runtimeMode: draft.runtimeMode,
      interactionMode: draft.interactionMode,
      creationSource: "web",
    };
    submissionPending.current = true;
    setSaving(true);
    const result = await upsertTask({ environmentId, input });
    setSaving(false);
    submissionPending.current = false;
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        reportFailure("Could not save automation", squashAtomCommandFailure(result));
      }
      return;
    }
    if (task === null) {
      void navigate({
        to: "/scheduled",
        search: { env: environmentId, task: result.value.task.id },
      });
    } else {
      setDraft(taskToDraft(result.value.task));
    }
  };

  const isWebhook = draft.scheduleMode === "webhook";
  const disabled = saving || !props.connected;

  return (
    <div className="flex flex-col gap-6" data-testid="scheduled-task-detail">
      <div className="flex flex-col gap-3">
        <BackLink />
        <input
          aria-label="Automation name"
          className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
          placeholder="Untitled automation"
          value={draft.title}
          disabled={disabled}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <Label className="inline-flex items-center gap-2">
            <Switch
              size="sm"
              checked={draft.enabled}
              disabled={disabled || busy || (task !== null && !canOperate)}
              onCheckedChange={(enabled) => void toggleEnabled(enabled)}
            />
            <span>{draft.enabled ? "Active" : "Inactive"}</span>
          </Label>
          <span className="h-4 border-l border-border/60" aria-hidden />
          {!draft.githubPrOpened ? (
            <Select
              value={selectedProjectId}
              onValueChange={(projectId) =>
                setDraft((current) => ({ ...current, projectId: projectId ?? "" }))
              }
            >
              <SelectTrigger size="sm" aria-label="Project">
                <SelectValue placeholder="Select a project">{selectedProject?.title}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : (
            <span>{draft.githubProjectIds?.length ?? 0} repositories</span>
          )}
          {task === null && environments.length > 1 ? (
            <Select
              value={environmentId}
              onValueChange={(id) => {
                const next = environments.find((entry) => entry.environmentId === id);
                if (!next) return;
                setEnvironmentId(next.environmentId);
                setDraft((current) => ({
                  ...current,
                  projectId: "",
                  githubProjectIds: [],
                  modelKey: "",
                  baseModelSelection: null,
                  baseRef: "main",
                  startFromOrigin: true,
                  existingWorktreePath: "",
                }));
              }}
            >
              <SelectTrigger size="sm" aria-label="Runs on">
                <SelectValue>
                  {environment ? <EnvironmentLabel environment={environment} /> : null}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {environments.map((entry) => (
                  <SelectItem key={entry.environmentId} value={entry.environmentId}>
                    <EnvironmentLabel environment={entry} />
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : environment && environments.length > 1 ? (
            <EnvironmentLabel environment={environment} className="text-muted-foreground" />
          ) : null}
          {task !== null ? (
            <span className="text-muted-foreground">
              Created by {task.createdBy === "user" ? "you" : "an agent"} ·{" "}
              {relativeLabel(task.createdAt)}
            </span>
          ) : null}
        </div>
        {task !== null ? (
          <ToggleGroup
            aria-label="Automation view"
            value={[props.tab]}
            onValueChange={(values) => {
              const next = values[0];
              if (next === "settings" || next === "runs") openTab(next);
            }}
          >
            <Toggle value="settings">Settings</Toggle>
            <Toggle value="runs">Run history</Toggle>
          </ToggleGroup>
        ) : null}
      </div>

      {props.tab === "runs" && task !== null ? (
        <div className="flex flex-col gap-6">
          <ScheduledCard>
            <Table>
              <ScheduledRunsHeader showTask={false} />
              <ScheduledRunRows
                environmentId={environmentId}
                taskId={task.id}
                showTask={false}
                refreshKey={`${task.runCount}:${task.lastRunAt ?? ""}:${task.lastRunStatus}`}
              />
            </Table>
          </ScheduledCard>
          {task.schedule.type === "webhook" ? (
            <WebhookDeliveries environmentId={environmentId} task={task} />
          ) : null}
        </div>
      ) : (
        <>
          {!props.connected ? (
            <p className="text-sm text-destructive" role="status">
              Reconnect this environment before saving.
            </p>
          ) : null}
          <fieldset disabled={disabled} className="contents">
            <ScheduledTaskEditor
              environmentId={environmentId}
              task={task}
              draft={draft}
              setDraft={setDraft}
              project={selectedProject}
              projects={projects}
              model={model}
              disabled={disabled}
            />
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {task !== null ? (
                <Button
                  size="sm"
                  variant="ghost-destructive"
                  disabled={busy || !canOperate}
                  onClick={() => void deleteTask()}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {task !== null && !isWebhook ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canOperate}
                  onClick={() => void runTaskNow()}
                >
                  <PlayIcon />
                  Run now
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!canOperate || saving || !props.connected || !props.listLoaded || !dirty}
                onClick={() => void submit()}
              >
                {saving
                  ? draft.githubPrOpened
                    ? "Connecting GitHub…"
                    : "Saving…"
                  : task === null
                    ? "Create automation"
                    : "Save changes"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Requests the webhook URL received, including the ones that never became a run. */
function WebhookDeliveries(props: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
}) {
  const deliveriesQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskWebhookDeliveries({
      environmentId: props.environmentId,
      input: { id: props.task.id },
    }),
  );
  const [selectedId, setSelectedId] = useState<ScheduledTaskWebhookDeliverySummary["id"] | null>(
    null,
  );
  const selectedQuery = useEnvironmentQuery(
    selectedId === null
      ? null
      : serverEnvironment.scheduledTaskWebhookDelivery({
          environmentId: props.environmentId,
          input: { id: props.task.id, deliveryId: selectedId },
        }),
  );
  const deliveries = deliveriesQuery.data?.deliveries ?? null;
  const selected = selectedQuery.data?.delivery ?? null;
  const error = selectedId === null ? deliveriesQuery.error : selectedQuery.error;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <ScheduledSectionLabel>Webhook deliveries</ScheduledSectionLabel>
        {selectedId !== null ? (
          <Button size="xs" variant="ghost-muted" onClick={() => setSelectedId(null)}>
            Back to deliveries
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={deliveriesQuery.isPending}
            onClick={deliveriesQuery.refresh}
          >
            Refresh
          </Button>
        )}
      </div>
      <ScheduledCard className="p-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {selectedId !== null && selected === null && selectedQuery.error === null ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading delivery…
          </p>
        ) : selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={deliveryOutcomeTone(selected.outcome)}>
                {deliveryOutcomeLabel(selected.outcome)}
              </Badge>
              <span>
                {selected.method} · {relativeLabel(selected.receivedAt)}
              </span>
              {selected.signatureVerified ? (
                <span className="text-muted-foreground">Signature verified</span>
              ) : null}
            </div>
            {selected.error ? <p className="text-sm text-destructive">{selected.error}</p> : null}
            <DeliveryBlock title="Prompt sent to the agent">
              {selected.renderedPrompt ?? "No run was started for this request."}
            </DeliveryBlock>
            {selected.missingFields.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Empty placeholders: {selected.missingFields.join(", ")}
              </p>
            ) : null}
            <DeliveryBlock title="Headers">
              {Object.entries(selected.headers)
                .map(([name, value]) => `${name}: ${value}`)
                .join("\n")}
            </DeliveryBlock>
            {selected.query ? <DeliveryBlock title="Query">{selected.query}</DeliveryBlock> : null}
            <DeliveryBlock title={selected.bodyTruncated ? "Body (truncated)" : "Body"}>
              {selected.body || "(empty)"}
            </DeliveryBlock>
          </div>
        ) : selectedId !== null ? null : deliveries === null ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading deliveries…
          </p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {deliveries.map((delivery) => (
              <li key={delivery.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm hover:text-foreground"
                  onClick={() => setSelectedId(delivery.id)}
                >
                  <Badge variant={deliveryOutcomeTone(delivery.outcome)}>
                    {deliveryOutcomeLabel(delivery.outcome)}
                  </Badge>
                  <span>{delivery.method}</span>
                  <span className="text-muted-foreground">
                    {relativeLabel(delivery.receivedAt)}
                  </span>
                  {delivery.missingFields.length > 0 ? (
                    <span className="text-muted-foreground">
                      {delivery.missingFields.length} empty placeholder
                      {delivery.missingFields.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScheduledCard>
    </section>
  );
}

function DeliveryBlock(props: { readonly title: string; readonly children: string }) {
  return (
    <div className="space-y-1">
      <Label>{props.title}</Label>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs break-all whitespace-pre-wrap">
        {props.children}
      </pre>
    </div>
  );
}
