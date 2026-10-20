import { ScheduledTaskModelPicker } from "./ScheduledTaskModelPicker";
import { ScheduledTriggerTabs } from "./ScheduledTriggerTabs";
import {
  scheduledTaskDraftSelection,
  scheduledTaskModelSelection,
} from "./scheduledTaskModel.logic";
import type { AutomationDraft as DraftState } from "./githubAutomation.logic";
import { Checkbox } from "~/components/ui/checkbox";
/**
 * The Settings tab of a scheduled task — see
 * `.fork/customizations.yaml#fork-scheduled-page`. One composer, laid out
 * like the chat's: where it runs as the context pills, what the agent is
 * told in the vessel, what fires it and which model on the control row.
 * The draft and its save live in ScheduledTaskDetail; this file only
 * edits the draft. Field semantics mirror upstream's editor dialog
 * (`components/settings/ScheduledTasksSettings.tsx`), including the
 * webhook URL, rotate, and signature controls, so the two doors save the
 * same shape.
 */
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  ClockIcon,
  CopyIcon,
  FolderGit2Icon,
  FolderGitIcon,
  FolderIcon,
  ZapIcon,
} from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  ProviderInstanceId,
  type EnvironmentId,
  type ModelSelection,
  type ScheduledTask,
} from "@t3tools/contracts";
import { DEFAULT_WEBHOOK_PROMPT } from "@t3tools/client-runtime/scheduled-task-webhook";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { webhookAddress } from "@t3tools/client-runtime/webhook-address";

import {
  scheduledTaskDefaultModel,
  type ScheduleMode,
  type WorkspaceMode,
} from "~/components/settings/scheduledTasksSettings.logic";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { ComposerControl, ComposerSelectControl } from "~/components/chat/ComposerControl";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { WorktreeBaseBranchPicker } from "~/components/WorktreeBaseBranchPicker";
import { usePrimaryCloudLinkState } from "~/cloud/primaryCloudLinkState";
import { requestConfirmDialog } from "~/confirmDialog";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useEnvironmentHttpBaseUrl } from "~/state/environments";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { draftTriggerLabel } from "./scheduledPage.logic";
import { ScheduledSectionLabel } from "./scheduledPageChrome";
import "./scheduledComposer.css";

/** JS day-of-week (0 = Sunday) rendered Monday-first. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const WORKSPACE_MODE_LABELS: Record<WorkspaceMode, string> = {
  worktree: "New worktree",
  root: "Project checkout",
  existing_worktree: "Existing checkout",
};

export type SetDraft = Dispatch<SetStateAction<DraftState>>;

function splitModelKey(value: string): ModelSelection | null {
  const index = value.indexOf(":");
  if (index <= 0) return null;
  return {
    instanceId: ProviderInstanceId.make(value.slice(0, index)),
    model: value.slice(index + 1),
  };
}

/**
 * The model the picker shows and the save will store: the draft's pick, or
 * the project's default while the draft has none. Shared with the detail's
 * submit so the saved model is exactly the one on screen.
 */
export function useScheduledTaskModel(input: {
  readonly environmentId: EnvironmentId;
  readonly draft: DraftState;
  readonly project: EnvironmentProject | null;
}) {
  const settings = useEnvironmentSettings(input.environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(input.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const instanceEntries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(
      deriveProviderInstanceEntries(providers),
      settings,
      input.project?.id ?? null,
    ),
  );
  const firstInstance = instanceEntries[0];
  const activeSelection = scheduledTaskModelSelection(
    scheduledTaskDraftSelection(
      input.draft.modelKey ? splitModelKey(input.draft.modelKey) : null,
      instanceEntries,
      () => scheduledTaskDefaultModel(settings, input.project, instanceEntries),
    ),
    input.draft.baseModelSelection,
  );
  const activeInstanceId =
    activeSelection?.instanceId ?? firstInstance?.instanceId ?? ProviderInstanceId.make("");
  const activeModel = activeSelection?.model ?? "";
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, providers, activeInstanceId, activeModel),
    [settings, providers, activeInstanceId, activeModel],
  );
  return {
    instanceEntries,
    modelOptionsByInstance,
    activeSelection,
    activeInstanceId,
    activeModel,
  };
}

export type ScheduledTaskModel = ReturnType<typeof useScheduledTaskModel>;

function Field(props: {
  readonly label: string;
  readonly hint?: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-baseline justify-between" htmlFor={props.htmlFor}>
        <span>{props.label}</span>
        {props.hint ? <span className="text-muted-foreground">{props.hint}</span> : null}
      </Label>
      {props.children}
    </div>
  );
}

type ScheduledTaskEditorProps = {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly environmentId: EnvironmentId;
  /** The live row while editing, so a rotated URL shows up; null while creating. */
  readonly task: ScheduledTask | null;
  readonly draft: DraftState;
  readonly setDraft: SetDraft;
  readonly project: EnvironmentProject | null;
  readonly model: ScheduledTaskModel;
  readonly disabled: boolean;
};

export function ScheduledTaskEditor(props: ScheduledTaskEditorProps) {
  const { draft, setDraft, model } = props;
  return (
    // Drawn as the chat composer, by wearing its own stamps: where it runs
    // as the context pills above, the instructions in the vessel, the
    // trigger at the control row's start where the composer keeps its mode,
    // and the model at its end. Each palette's composer paint (Glass's
    // washes, Westworld's blur, the focus hairline, the chips and ghost
    // controls) lands here without a second copy.
    <section className="flex flex-col gap-2" data-scheduled-composer="">
      <ScheduledSectionLabel>Agent instructions</ScheduledSectionLabel>
      <div>
        <div
          data-fork-composer-context-row="true"
          className="flex min-w-0 flex-wrap items-center gap-2 pb-2"
        >
          <RunsInPills {...props} />
        </div>
        <div data-fork-composer-vessel="true" className="flex min-w-0 flex-col rounded-lg">
          <div data-fork-composer-surface="true">
            <textarea
              id="scheduled-task-prompt"
              aria-label="Agent instructions"
              className="block max-h-[60vh] min-h-32 w-full resize-none bg-transparent px-3 py-2.5 text-sm text-foreground outline-none field-sizing-content placeholder:text-muted-foreground"
              placeholder={
                !draft.githubPrOpened && draft.scheduleMode === "webhook"
                  ? "What should the agent do with each request? Use {{body.path}} to pull values out of it."
                  : "What should the agent do each time this runs?"
              }
              value={draft.prompt}
              disabled={props.disabled}
              onChange={(event) =>
                setDraft((current) => ({ ...current, prompt: event.target.value }))
              }
            />
          </div>
          <div
            data-fork-composer-control-row="true"
            className="flex min-w-0 items-center justify-between gap-2 p-2"
          >
            <div
              data-fork-composer-control-row-slot="left"
              className="-m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <TriggerPill {...props} />
            </div>
            <div
              data-fork-composer-control-row-slot="right"
              className="flex min-w-0 shrink-0 items-center justify-end"
            >
              <div data-fork-composer-model-controls="true" className="flex min-w-0 items-center">
                <ScheduledTaskModelPicker
                  environmentId={props.environmentId}
                  disabled={props.disabled}
                  activeInstanceId={model.activeInstanceId}
                  model={model.activeModel}
                  lockedProvider={null}
                  instanceEntries={model.instanceEntries}
                  modelOptionsByInstance={model.modelOptionsByInstance}
                  isComposerOwned={false}
                  onInstanceModelChange={(instanceId, modelId) =>
                    setDraft((current) => ({
                      ...current,
                      modelKey: `${instanceId}:${modelId}`,
                      baseModelSelection:
                        instanceId === model.activeSelection?.instanceId &&
                        modelId === model.activeSelection.model
                          ? model.activeSelection
                          : null,
                    }))
                  }
                  selection={model.activeSelection}
                  prompt={draft.prompt}
                  onPromptChange={(prompt) => setDraft((current) => ({ ...current, prompt }))}
                  onSelectionChange={(selection) =>
                    setDraft((current) => ({
                      ...current,
                      modelKey: `${selection.instanceId}:${selection.model}`,
                      baseModelSelection: selection,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The trigger as the control row's leading ghost control, reading the
 * draft's summary; its popover holds the whole trigger editor. The popup
 * portals out of the detail's disabled fieldset, so it carries its own.
 */
function TriggerPill(props: ScheduledTaskEditorProps) {
  const { draft } = props;
  const TriggerIcon = draft.githubPrOpened
    ? PullRequestGlyph.pullRequest
    : draft.scheduleMode === "webhook"
      ? ZapIcon
      : draft.scheduleMode === "interval"
        ? ClockIcon
        : CalendarClockIcon;
  // Checked repositories in the picker's order; the list truncates, the trigger name never does.
  const repositories = draft.githubPrOpened
    ? props.projects
        .filter((project) => draft.githubProjectIds?.includes(project.id))
        .map((project) => project.title)
        .join(", ")
    : "";
  return (
    <Popover>
      <PopoverTrigger
        disabled={props.disabled}
        data-testid="scheduled-trigger-pill"
        render={<ComposerControl size="xs" className="min-w-0 shrink" />}
      >
        <TriggerIcon aria-hidden />
        <span className="shrink-0">{draftTriggerLabel(draft)}</span>
        {repositories ? <span className="min-w-0 truncate">/ {repositories}</span> : null}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-[min(32rem,calc(100vw-2rem))]">
        <fieldset disabled={props.disabled} className="contents">
          <TriggerFields {...props} />
        </fieldset>
      </PopoverPopup>
    </Popover>
  );
}

function TriggerFields(props: ScheduledTaskEditorProps) {
  const { draft, setDraft } = props;
  return (
    <div className="flex flex-col gap-4">
      <ScheduledTriggerTabs
        value={[draft.githubPrOpened ? "github_pr" : draft.scheduleMode]}
        onValueChange={(values) => {
          if (values[0] === "github_pr") {
            setDraft((current) => ({
              ...current,
              githubPrOpened: true,
              githubProjectIds: current.githubProjectIds ?? [],
              scheduleMode: "webhook",
            }));
            return;
          }
          const mode = values[0] as ScheduleMode | undefined;
          if (mode === "fixed" || mode === "interval" || mode === "webhook")
            setDraft((current) => ({
              ...current,
              scheduleMode: mode,
              githubPrOpened: false,
              prompt:
                mode === "webhook" && !current.prompt.trim()
                  ? DEFAULT_WEBHOOK_PROMPT
                  : current.prompt,
            }));
        }}
      />
      {props.task?.schedule.type === "interval" &&
      props.task.schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS ? (
        <p className="text-sm text-muted-foreground" role="status">
          This task uses a legacy interval below one minute. Saving updates it to at least one
          minute.
        </p>
      ) : null}
      {draft.githubPrOpened ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Review each newly opened pull request in the repositories you select. Each run gets the
            exact PR automatically.
          </p>
          <Field label="Repositories">
            <div className="flex flex-col gap-3">
              {props.projects.map((project) => (
                <Label key={project.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={draft.githubProjectIds?.includes(project.id) ?? false}
                    onCheckedChange={(checked) =>
                      setDraft((current) => {
                        const githubProjectIds = checked
                          ? [...new Set([...(current.githubProjectIds ?? []), project.id])]
                          : (current.githubProjectIds ?? []).filter((id) => id !== project.id);
                        return {
                          ...current,
                          githubProjectIds,
                          projectId: githubProjectIds[0] ?? current.projectId,
                        };
                      })
                    }
                  />
                  {project.title}
                </Label>
              ))}
              {props.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add your repositories as projects first.
                </p>
              ) : null}
            </div>
          </Field>
          <p className="text-xs text-muted-foreground">
            Creating this automation connects the selected GitHub repositories. Existing open PRs
            are not reviewed automatically.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to="/settings/source-control" className="underline underline-offset-2">
              Connect GitHub
            </Link>
            <Link to="/settings/connections" className="underline underline-offset-2">
              Set up remote access
            </Link>
          </div>
          {props.task?.schedule.type === "webhook" && props.task.schedule.github ? (
            <p className="text-sm text-muted-foreground">
              Connected:{" "}
              {props.task.schedule.github.repositories
                .map((repository) => repository.nameWithOwner)
                .join(", ")}
              . {props.task.enabled ? "Waiting for new pull requests." : "Paused."}
            </p>
          ) : null}
        </div>
      ) : draft.scheduleMode === "webhook" ? (
        <>
          <WebhookFields {...props} />
          <p className="text-xs text-muted-foreground">
            {
              "Use {{body.path}} · {{headers.name}} · {{query.name}} · {{body}} · {{request}} in the instructions."
            }
          </p>
        </>
      ) : draft.scheduleMode === "fixed" ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="scheduled-task-time">Run at</Label>
            <div className="w-32">
              <Input
                type="time"
                id="scheduled-task-time"
                nativeInput
                value={draft.timeOfDay}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, timeOfDay: event.target.value }))
                }
              />
            </div>
            <span className="text-xs text-muted-foreground">on</span>
          </div>
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            aria-label="Days to run"
            value={[...draft.weekdays].map(String)}
            onValueChange={(values) => {
              if (values.length === 0) return;
              setDraft((current) => ({ ...current, weekdays: new Set(values.map(Number)) }));
            }}
          >
            {WEEKDAY_ORDER.map((day) => (
              <Toggle key={day} value={String(day)} aria-label={WEEKDAY_LABELS[day]}>
                {WEEKDAY_SHORT[day]}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Label htmlFor="scheduled-task-interval">Run every</Label>
          <div className="w-24">
            <Input
              type="number"
              id="scheduled-task-interval"
              nativeInput
              min={1}
              step="any"
              value={draft.intervalMinutes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, intervalMinutes: event.target.value }))
              }
            />
          </div>
          <span className="text-xs text-muted-foreground">minutes</span>
        </div>
      )}
    </div>
  );
}

const WORKSPACE_MODE_ICONS: Record<WorkspaceMode, typeof FolderIcon> = {
  worktree: FolderGit2Icon,
  root: FolderIcon,
  existing_worktree: FolderGitIcon,
};

/**
 * Where a run happens, as the chat composer's context chips: the workspace
 * select, then the base branch or the checkout it needs. A PR review always
 * runs in a fresh worktree off its repository's default branch (the server's
 * githubPrTrigger decides, not the draft), so it shows that as a readout.
 */
function RunsInPills(props: ScheduledTaskEditorProps) {
  const { draft, setDraft } = props;
  if (draft.githubPrOpened) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span data-fork-context-chip="" className="inline-flex min-w-0 items-center" />}
        >
          <FolderGit2Icon aria-hidden />
          <span className="truncate">New worktree from each repo's default branch</span>
        </TooltipTrigger>
        <TooltipPopup>
          Each PR gets its own review thread in a fresh worktree. Your working branch stays
          unchanged.
        </TooltipPopup>
      </Tooltip>
    );
  }
  const WorkspaceIcon = WORKSPACE_MODE_ICONS[draft.workspaceMode];
  return (
    <>
      <Select
        value={draft.workspaceMode}
        onValueChange={(value) =>
          setDraft((current) => ({ ...current, workspaceMode: value as WorkspaceMode }))
        }
      >
        <ComposerSelectControl size="xs" aria-label="Workspace" className="min-w-0 shrink">
          <WorkspaceIcon aria-hidden />
          <span className="truncate">
            <SelectValue>{WORKSPACE_MODE_LABELS[draft.workspaceMode]}</SelectValue>
          </span>
        </ComposerSelectControl>
        <SelectPopup alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectGroupLabel>Runs in</SelectGroupLabel>
            {(["worktree", "root", "existing_worktree"] as const).map((mode) => {
              const Icon = WORKSPACE_MODE_ICONS[mode];
              return (
                <SelectItem key={mode} value={mode}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="size-3" aria-hidden />
                    {WORKSPACE_MODE_LABELS[mode]}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectPopup>
      </Select>
      {draft.workspaceMode === "worktree" ? (
        <WorktreeBaseBranchPicker
          key={`${props.environmentId}:${props.project?.id ?? ""}`}
          environmentId={props.environmentId}
          cwd={props.project?.workspaceRoot ?? null}
          value={draft.baseRef}
          onValueChange={(baseRef) => setDraft((current) => ({ ...current, baseRef }))}
          startFromOrigin={draft.startFromOrigin}
          onStartFromOriginChange={(startFromOrigin) =>
            setDraft((current) => ({ ...current, startFromOrigin }))
          }
          disabled={props.disabled}
        />
      ) : null}
      {draft.workspaceMode === "existing_worktree" ? <CheckoutPathPill {...props} /> : null}
    </>
  );
}

/** The checkout folder's own name, as the toolbar labels a workspace. */
function checkoutDisplayName(path: string | null): string | null {
  if (!path) return null;
  const normalizedPath = path.replace(/[\\/]+$/, "");
  if (normalizedPath.length === 0) return path;
  return normalizedPath.split(/[\\/]/).at(-1) ?? normalizedPath;
}

function CheckoutPathPill(props: ScheduledTaskEditorProps) {
  const { draft, setDraft } = props;
  const name = checkoutDisplayName(draft.existingWorktreePath.trim() || null);
  return (
    <Popover>
      <PopoverTrigger
        disabled={props.disabled}
        render={<ComposerControl size="xs" className="min-w-0 shrink" />}
      >
        <FolderGitIcon aria-hidden />
        <span className="truncate">{name ?? "Choose checkout"}</span>
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-[min(24rem,calc(100vw-2rem))]">
        <fieldset disabled={props.disabled} className="contents">
          <Field label="Checkout path" htmlFor="scheduled-task-checkout">
            <Input
              id="scheduled-task-checkout"
              value={draft.existingWorktreePath}
              placeholder="/path/to/checkout"
              onChange={(event) =>
                setDraft((current) => ({ ...current, existingWorktreePath: event.target.value }))
              }
            />
          </Field>
        </fieldset>
      </PopoverPopup>
    </Popover>
  );
}

function WebhookFields(props: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly draft: DraftState;
  readonly setDraft: SetDraft;
}) {
  const { draft, setDraft } = props;
  const hasStoredSecret =
    props.task?.schedule.type === "webhook" && props.task.webhook?.hasSecret === true;
  return (
    <div className="flex flex-col gap-4">
      <WebhookEndpointField environmentId={props.environmentId} task={props.task} />
      <Field
        label="Skip requests older than"
        hint="minutes, optional"
        htmlFor="scheduled-task-max-age"
      >
        <Input
          id="scheduled-task-max-age"
          type="number"
          nativeInput
          min={1}
          max={MAX_WEBHOOK_DELIVERY_AGE_MINUTES}
          placeholder="Run every request"
          value={draft.maxDeliveryAgeMinutes}
          onChange={(event) =>
            setDraft((current) => ({ ...current, maxDeliveryAgeMinutes: event.target.value }))
          }
        />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="scheduled-task-signature">Require signature</Label>
          <p className="text-sm text-muted-foreground">
            Reject requests without a valid HMAC-SHA256 signature of the body.
          </p>
        </div>
        <Switch
          id="scheduled-task-signature"
          checked={draft.signatureEnabled}
          onCheckedChange={(signatureEnabled) =>
            setDraft((current) => ({ ...current, signatureEnabled }))
          }
        />
      </div>
      {draft.signatureEnabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Header" htmlFor="scheduled-task-signature-header">
            <Input
              id="scheduled-task-signature-header"
              value={draft.signatureHeader}
              onChange={(event) =>
                setDraft((current) => ({ ...current, signatureHeader: event.target.value }))
              }
            />
          </Field>
          <Field label="Prefix" htmlFor="scheduled-task-signature-prefix">
            <Input
              id="scheduled-task-signature-prefix"
              value={draft.signaturePrefix}
              placeholder="None"
              onChange={(event) =>
                setDraft((current) => ({ ...current, signaturePrefix: event.target.value }))
              }
            />
          </Field>
          <Field label="Encoding" htmlFor="scheduled-task-signature-encoding">
            <Select
              value={draft.signatureEncoding}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  signatureEncoding: value === "base64" ? "base64" : "hex",
                }))
              }
            >
              <SelectTrigger size="sm" id="scheduled-task-signature-encoding">
                <SelectValue>{draft.signatureEncoding}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="hex">hex</SelectItem>
                <SelectItem value="base64">base64</SelectItem>
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Secret" htmlFor="scheduled-task-signature-secret">
            <Input
              id="scheduled-task-signature-secret"
              type="password"
              autoComplete="off"
              value={draft.signatureSecret}
              placeholder={hasStoredSecret ? "Unchanged" : "Shared secret"}
              onChange={(event) =>
                setDraft((current) => ({ ...current, signatureSecret: event.target.value }))
              }
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function WebhookEndpointField(props: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
}) {
  const { environmentId, task } = props;
  const canRotate = useAtomValue(
    serverEnvironment.rotateScheduledTaskWebhookToken.permissionAtom(environmentId),
  );
  const httpBaseUrl = useEnvironmentHttpBaseUrl(environmentId);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "webhook URL" });
  const rotate = useAtomCommand(serverEnvironment.rotateScheduledTaskWebhookToken, {
    label: "scheduled task rotate webhook token",
  });
  const [rotating, setRotating] = useState(false);
  const endpoint = task?.webhook;
  if (!task || !endpoint) {
    return (
      <p className="text-sm text-muted-foreground">
        The URL to give the sender appears here once the task is created.
      </p>
    );
  }
  const { address: url, copyable, note } = webhookAddress(endpoint, httpBaseUrl);
  const rotateUrl = async () => {
    const confirmed =
      (await requestConfirmDialog("Rotate this webhook URL?\nThe current URL stops working.", {
        variant: "destructive",
      })) ?? window.confirm("Rotate this webhook URL? The current URL stops working.");
    if (!confirmed) return;
    setRotating(true);
    const result = await rotate({ environmentId, input: { id: task.id } });
    setRotating(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not rotate webhook URL",
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  return (
    <Field label="Webhook URL">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          aria-label="Webhook URL"
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={!copyable}
          onClick={() => copyToClipboard(url, undefined)}
        >
          <CopyIcon />
          {isCopied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={rotating || !canRotate}
          onClick={() => void rotateUrl()}
        >
          Rotate
        </Button>
      </div>
      {note !== null ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {endpoint.url !== null ? <WebhookDeliveryMode environmentId={environmentId} /> : null}
    </Field>
  );
}

/** Whether T3 Connect forwards requests live or holds them while the environment is offline. */
function WebhookDeliveryMode(props: { readonly environmentId: EnvironmentId }) {
  const cloudLink = usePrimaryCloudLinkState();
  if (cloudLink.target?.environmentId !== props.environmentId || cloudLink.data === null) {
    return null;
  }
  return (
    <p className="text-xs text-muted-foreground">
      {cloudLink.data.holdWebhooksWhileOffline
        ? "Held for up to 24 hours while this environment is offline. "
        : "Forwarded live. Requests fail while this environment is offline. "}
      <Link to="/settings/connections" className="underline underline-offset-2">
        Change in Connections
      </Link>
    </p>
  );
}
