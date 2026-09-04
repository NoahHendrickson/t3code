import { autoAnimate } from "@formkit/auto-animate";
import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  canSnooze,
  effectiveSnoozed,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClockIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PinIcon,
  PlusIcon,
  ServerIcon,
  TerminalIcon,
  Undo2Icon,
} from "lucide-react";
/* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
// Own statement: a fence comment inside the lucide brace list is scraped as a
// binding by phosphorIcons.test.ts (same reason Globe2Icon sits out here).
import { XIcon } from "lucide-react";
/* fork:end sidebar-v2-draft-rows */
/* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
// A statement of its own rather than a name in upstream's list: the phosphor
// guard parses that list's braces, and a fence comment inside them reads as a
// binding. Out here the fence survives and the parser stays honest.
import { Globe2Icon } from "lucide-react";
/* fork:end sidebar-v2-dev-server-pulse */
/* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
// Own statement for the same phosphor-guard reason as XIcon / Globe2Icon
// above. PinIcon stays in upstream's list — upstream imports it itself.
import { PinOffIcon } from "lucide-react";
/* fork:end sidebar-v2-row-action-hit-area */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "@tanstack/react-router";

import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { isElectron } from "../env";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { useShortcutModifierState } from "../shortcutModifierState";
import { useTerminalFocus } from "../hooks/useTerminalFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { isMacPlatform } from "~/lib/utils";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { releaseComposerDraftUploads } from "../lib/composerDraftUploads";
import { readLocalApi } from "../localApi";
import { getProjectOrderKey, selectProjectGroupingSettings } from "../logicalProject";
import {
  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  buildSidebarProjectPickerEntries,
  /* fork:end sidebar-v2-project-grouping */
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../uiStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useThreadActions } from "../hooks/useThreadActions";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */
import { useScrollGutterWidth } from "~/custom/useScrollGutterWidth";
/* fork:end fork-sidebar-chrome */
import { openCommandPalette } from "../commandPaletteBus";
/* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
/* fork:end sidebar-v2-dev-server-pulse */
import {
  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  resolveThreadActionProjectRef,
  /* fork:end sidebar-v2-project-grouping */
  startNewThreadFromContext,
} from "../lib/chatThreadActions";
import { useClientSettings } from "../hooks/useSettings";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useNowMinute } from "../hooks/useNowMinute";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { environmentServerConfigsAtom, primaryServerKeybindingsAtom } from "../state/server";
import { vcsEnvironment } from "../state/vcs";
import { threadEnvironment } from "../state/threads";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import {
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  buildDraftThreadRouteParams,
  /* fork:end sidebar-v2-draft-rows */
  buildThreadRouteParams,
  resolveActiveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { formatRelativeTimeLabel, parseTimestampDate } from "../timestampFormat";
import type { SidebarThreadSummary } from "../types";
import { cn } from "~/lib/utils";
import { buildThreadActionMenuItems } from "./threadActionMenu.logic";
import {
  animatePinnedLayoutChanges,
  buildBulkTitleRegenerationContextMenuItem,
  formatWorkingDurationLabel,
  firstValidTimestampMs,
  hasUnseenCompletion,
  isSidebarNestedLinkClick,
  isTrailingDoubleClick,
  orderItemsByPreferredIds,
  planPinnedReorder,
  reduceSidebarProjectScopeMenuState,
  resolveAdjacentThreadId,
  resolveSettledTimestamp,
  resolveSidebarThreadStatus,
  shouldCreateNewThreadInCurrentProject,
  resolveWorkingStartedAt,
  sortLogicalProjectsForSidebar,
  sortPinnedThreadsForSidebar,
  sortSettledThreadsForSidebar,
  sortThreadsForSidebar,
  useThreadJumpHintVisibility,
} from "./Sidebar.logic";
import { resolveLocalCheckoutBranchMismatch } from "./BranchToolbar.logic";
import {
  nextThreadChangeRequestSnapshot,
  prStatusIndicator,
  resolveDisplayedThreadPr,
  resolveDisplayedThreadPrProvider,
  setThreadChangeRequestSnapshot,
  settledPrHoverColorClass,
  terminalStatusFromRunningIds,
  threadChangeRequestSnapshotsAtom,
  type ThreadChangeRequestSnapshot,
  type TerminalStatusIndicator,
  useLinkedThreadPullRequest,
} from "./ThreadStatusIndicators";
import {
  resolveSnoozePresets,
  snoozeWakeDescription,
  snoozeWakeLabel,
  type SnoozePreset,
} from "./Sidebar.snooze";
import { ProjectFavicon } from "./ProjectFavicon";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows */
import { SidebarV2StatusMark, type SidebarV2DotTone } from "~/custom/SidebarV2StatusIndicator";
import {
  SidebarV2ProjectFolderMark,
  SidebarV2ThreadCardMeta,
} from "~/custom/SidebarV2ThreadCardMeta";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "~/custom/sidebarV2CardAlignment";
import {
  threadCardTitleClassName,
  threadCardTitleRecedes,
  threadRowSurfaceClassName,
} from "~/custom/sidebarV2RowPolicy";
/* fork:end sidebar-v2-card-rows */
import { SidebarV2ChromeActionRows, SidebarV2ProjectScopeRow } from "~/custom/SidebarV2ChromeRows";
/* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
import {
  SIDEBAR_V2_ICON_BUTTON_CLASS,
  SIDEBAR_V2_SLIM_ROW_ACTION_CLASS,
  SIDEBAR_V2_TRAILING_OFFSET,
} from "~/custom/sidebarV2TrailingColumn";
/* fork:end sidebar-v2-row-action-hit-area */
/* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
import { SidebarV2ProjectGroupHeader } from "~/custom/SidebarV2ProjectGroupHeader";
import {
  buildActiveThreadSections,
  createProjectRefIndex,
  threadsVisibleInProjectSection,
  UNGROUPED_PROJECT_KEY,
  useSidebarV2CollapsedProjects,
  useSidebarV2GroupByProject,
} from "~/custom/sidebarV2ProjectGrouping";
/* fork:end sidebar-v2-project-grouping */
/* fork:begin sidebar-v2-list-animation — see .fork/customizations.yaml#sidebar-v2-list-animation */
import { sidebarV2ListAnimation } from "~/custom/sidebarV2ListAnimation";
/* fork:end sidebar-v2-list-animation */
/* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
import {
  draftIdByThreadKey as indexDraftIdsByThreadKey,
  listSidebarDraftRows,
  pickDiscardNeighborKey,
  sidebarDraftModelSelection,
  sidebarDraftRowCapabilities,
  sidebarServerActionThreadKeys,
} from "~/custom/sidebarV2DraftRows";
/* fork:end sidebar-v2-draft-rows */
import { getTriggerDisplayModelLabel } from "./chat/providerIconUtils";
import {
  deriveProviderEntriesByEnvironment,
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  NO_PROVIDER_MODEL_SELECTION,
  /* fork:end sidebar-v2-draft-rows */
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../providerInstances";
import { useThreadRunningTerminalIds } from "../state/terminalSessions";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { SidebarContent, SidebarGroup, useSidebar } from "./ui/sidebar";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useComposerDraftStore } from "../composerDraftStore";

// Settled-tail paging: recent history is the common lookup; the deep tail
// stays behind an explicit Show more.
const SETTLED_TAIL_INITIAL_COUNT = 10;
const SETTLED_TAIL_PAGE_COUNT = 25;
// Keep the v2 key so existing preferences survive the v2-to-default rename.
const SETTLED_SHELF_EXPANDED_KEY = "t3code:sidebar-v2:settled-expanded";
const SNOOZED_SHELF_EXPANDED_KEY = "t3code:sidebar-v2:snoozed-expanded";

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

function threadTimeLabel(thread: SidebarThreadSummary): string {
  const timestamp = thread.latestUserMessageAt ?? thread.updatedAt;
  return compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

// Settled rows read "how long ago did this wrap up", matching their sort
// key: both go through resolveSettledTimestamp so label and order can't
// disagree.
function settledTimeLabel(thread: SidebarThreadSummary): string {
  const timestamp = resolveSettledTimestamp(thread);
  return timestamp === null ? "" : compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

// Floats at the row's right edge, vertically centered, while the jump
// modifier is held. An overlay pill instead of an inline slot: the hint
// must neither displace the status/time label (holding ⌘ used to blank
// out "Working") nor shift any layout when it appears. pointer-events-none
// so it never swallows clicks meant for the settle/un-settle buttons it
// can overlap.
function JumpHintBadge(props: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-1.5 top-1/2 z-10 inline-flex h-5 -translate-y-1/2 items-center rounded-full border border-border/80 bg-background/95 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
    >
      {props.label}
    </span>
  );
}

// Self-ticking so only this span re-renders each second, not the whole row.
function WorkingDuration(props: { startedAt: string | null }) {
  const startedMs = props.startedAt !== null ? Date.parse(props.startedAt) : Number.NaN;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (Number.isNaN(startedMs)) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(id);
  }, [startedMs]);
  if (Number.isNaN(startedMs)) return null;
  return (
    <span className="font-mono tabular-nums">
      {formatWorkingDurationLabel(Date.now() - startedMs)}
    </span>
  );
}

const EMPTY_PROVIDER_ENTRIES: ReadonlyMap<string, ProviderInstanceEntry> = new Map();

function terminalProcessLabel(count: number): string {
  return `${count} terminal ${count === 1 ? "process" : "processes"} running`;
}

function SidebarThreadTooltip({
  thread,
  projectTitle,
  projectCwd,
  projectFaviconPath,
  environmentLabel,
  providerEntry,
  showInstanceBadge,
  modelInstanceId,
  modelLabel,
  branchMismatch,
  /* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
  devServerLabel,
  /* fork:end sidebar-v2-dev-server-pulse */
  terminalStatus,
  terminalProcessCount,
}: {
  thread: SidebarThreadSummary;
  projectTitle: string | null;
  projectCwd: string | null;
  projectFaviconPath: string | null;
  environmentLabel: string | null;
  providerEntry: ProviderInstanceEntry | null;
  showInstanceBadge: boolean;
  modelInstanceId: string;
  modelLabel: string;
  branchMismatch: {
    threadBranch: string;
    currentBranch: string;
  } | null;
  /* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
  /** `localhost:<port>` (+n) while the scanner attributes a listener to this
      thread's terminals, or null. Names what the card's pulsing mark can only
      signal — the next reader should not assume the boolean was all we had. */
  devServerLabel: string | null;
  /* fork:end sidebar-v2-dev-server-pulse */
  terminalStatus: TerminalStatusIndicator | null;
  terminalProcessCount: number;
}) {
  const driverKind = providerEntry?.driverKind ?? null;
  return (
    <TooltipPopup
      side="right"
      align="start"
      sideOffset={4}
      variant="glass"
      className="max-w-80 text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0"
    >
      <div className="flex min-w-0 max-w-80 flex-col gap-2 p-[var(--floating-content-inset)]">
        <div className="min-w-0 truncate text-xs leading-none font-medium text-foreground">
          {thread.title}
        </div>
        <div className="grid gap-1.5 pl-0.5 text-xs text-muted-foreground">
          {projectTitle ? (
            <div className="flex min-w-0 items-center gap-2">
              <ProjectFavicon
                environmentId={thread.environmentId}
                cwd={projectCwd ?? ""}
                faviconPath={projectFaviconPath}
                className="size-3 shrink-0 stroke-muted-foreground"
              />
              <div className="min-w-0 truncate text-foreground/75">{projectTitle}</div>
            </div>
          ) : null}
          {environmentLabel ? (
            <div className="flex min-w-0 items-center gap-2">
              <ServerIcon className="size-3 shrink-0 stroke-muted-foreground" />
              <div className="min-w-0 truncate text-foreground/75">{environmentLabel}</div>
            </div>
          ) : null}
          {thread.branch ? (
            <div className="flex min-w-0 items-center gap-2">
              <GitBranchIcon className="size-3 shrink-0 stroke-muted-foreground" />
              <div className="min-w-0 truncate text-foreground/75">{thread.branch}</div>
            </div>
          ) : null}
          {/* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */}
          {devServerLabel ? (
            <div className="flex min-w-0 items-center gap-2">
              <Globe2Icon className="size-4 shrink-0 stroke-muted-foreground" />
              <div className="min-w-0 wrap-break-word text-foreground/90">{devServerLabel}</div>
            </div>
          ) : null}
          {/* fork:end sidebar-v2-dev-server-pulse */}
          {branchMismatch ? (
            <div className="flex min-w-0 items-start gap-2 text-warning">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0 stroke-current" />
              <div className="min-w-0 flex-1 wrap-break-word leading-5">
                You're currently checked out on another branch.
              </div>
            </div>
          ) : null}
          {driverKind ? (
            <div className="flex min-w-0 items-center gap-2">
              <ProviderInstanceIcon
                driverKind={driverKind}
                displayName={
                  providerEntry?.displayName ?? thread.session?.providerName ?? modelInstanceId
                }
                accentColor={providerEntry?.accentColor}
                // Initials would swallow a size-3 glyph: accent dot, name in label.
                showBadge={showInstanceBadge && providerEntry?.accentColor !== undefined}
                badgeContent="none"
                badgeClassName="h-2 min-w-2 px-0"
                iconClassName="size-3 shrink-0 grayscale opacity-60"
              />
              <div className="min-w-0 truncate text-foreground/75">
                {showInstanceBadge && providerEntry
                  ? `${modelLabel} · ${providerEntry.displayName}`
                  : modelLabel}
              </div>
            </div>
          ) : null}
          {terminalStatus ? (
            <div className="flex min-w-0 items-center gap-2">
              <TerminalIcon
                aria-hidden
                className={cn("size-3 shrink-0", terminalStatus.colorClass)}
              />
              <div className="min-w-0 truncate text-foreground/75">
                {terminalProcessLabel(terminalProcessCount)}
              </div>
            </div>
          ) : null}
          {thread.session?.lastError ? (
            <div className="flex min-w-0 items-start gap-2 text-red-600 dark:text-red-400">
              <CircleAlertIcon className="mt-0.5 size-3 shrink-0 stroke-current" />
              {/* fork:begin sidebar-v2-error-tooltip — see .fork/customizations.yaml#sidebar-v2-error-tooltip
                  Upstream's restyle flattened this to the literal "Error
                  occurred", which removed the only place the sidebar surfaced
                  what actually failed — diagnosing a dead session meant opening
                  it. The message returns, wrapping rather than truncating: an
                  error's tail (exit codes, file paths) is routinely the useful
                  half, and this tooltip is already the row's overflow surface. */}
              <div className="min-w-0 flex-1 wrap-break-word leading-5">
                {thread.session.lastError}
              </div>
              {/* fork:end sidebar-v2-error-tooltip */}
            </div>
          ) : null}
        </div>
      </div>
    </TooltipPopup>
  );
}

/**
 * Hover entry point for snooze: a clock button opening the preset menu.
 * Controlled by the row (which also uses the open state to pin its hover
 * actions while the menu is up).
 */
function SnoozePopoverButton(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (preset: SnoozePreset) => void;
  timestampFormat: TimestampFormat;
}) {
  const { open, onOpenChange, onSnooze, timestampFormat } = props;
  // Presets resolve at open time so "In 1 hour" is relative to the click,
  // not to when the row mounted.
  const presets = useMemo(
    () => (open ? resolveSnoozePresets(new Date(), timestampFormat) : []),
    [open, timestampFormat],
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="Snooze thread"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                  className={SIDEBAR_V2_ICON_BUTTON_CLASS}
                  /* fork:end sidebar-v2-row-action-hit-area */
                />
              }
            />
          }
        >
          <ClockIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup>Snooze thread</TooltipPopup>
      </Tooltip>
      <PopoverPopup side="bottom" align="end" className="w-56" viewportClassName="p-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenChange(false);
              onSnooze(preset);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground/90 hover:bg-accent hover:text-foreground"
          >
            <span className="flex-1">{preset.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
              {preset.whenLabel}
            </span>
          </button>
        ))}
      </PopoverPopup>
    </Popover>
  );
}

// Subset of useSortable applied to a pinned card's root <li>. Listeners go
// on the whole card (no dedicated handle): the pointer sensor's distance
// constraint keeps plain clicks working, and we skip dnd-kit's aria
// attributes since there is no keyboard sensor and the card body already
// carries its own button semantics.
type SortablePinnedRowBag = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "setNodeRef" | "transform" | "transition" | "isDragging"
>;

function SortablePinnedThreadRow(props: {
  id: string;
  children: (bag: SortablePinnedRowBag) => ReactNode;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    animateLayoutChanges: animatePinnedLayoutChanges,
  });
  return props.children({ listeners, setNodeRef, transform, transition, isDragging });
}

const SidebarThreadRow = memo(function SidebarThreadRow(props: {
  thread: SidebarThreadSummary;
  variant: "card" | "slim";
  // Slim rows are either settled (action: un-settle) or merely quiet
  // (seen Ready threads — action: settle).
  variantAction: "settle" | "unsettle" | "unsnooze";
  // False on environments whose server predates thread.settle/unsettle:
  // the lifecycle affordances hide entirely rather than fail on click.
  settlementSupported: boolean;
  // Same contract for thread.snooze/unsnooze.
  snoozeSupported: boolean;
  isPinned: boolean;
  /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
  // Same capability contract as settle/snooze, for the card's hover pin
  // action (leading the cell, before snooze). Pin/unpin also stay in the
  // context menu, which is the only surface slim rows offer them on.
  pinningSupported: boolean;
  onPin: (threadRef: ScopedThreadRef) => void;
  onUnpin: (threadRef: ScopedThreadRef) => void;
  /* fork:end sidebar-v2-row-action-hit-area */
  sortable?: SortablePinnedRowBag | undefined;
  // Compact wake countdown ("2h") for rows in the snoozed shelf.
  snoozeWakeLabelText: string | null;
  // When a snooze ended (timer or early wake); drives the Woke pill until
  // the user visits the thread.
  wokeAt: string | null;
  isActive: boolean;
  openPullRequestsInRightPanel: boolean;
  jumpLabel: string | null;
  currentEnvironmentId: string | null;
  environmentLabel: string | null;
  projectCwd: string | null;
  projectFaviconPath: string | null;
  projectTitle: string | null;
  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  projectTitleHidden?: boolean;
  /* fork:end sidebar-v2-project-grouping */
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
  timestampFormat: TimestampFormat;
  onThreadClick: (event: ReactMouseEvent, threadRef: ScopedThreadRef) => void;
  onThreadActivate: (threadRef: ScopedThreadRef) => void;
  onStartRename: (threadRef: ScopedThreadRef, title: string) => void;
  onRenameTitleChange: (title: string) => void;
  onCommitRename: (threadRef: ScopedThreadRef, title: string, originalTitle: string) => void;
  onCancelRename: () => void;
  isRenaming: boolean;
  renamingTitle: string;
  onContextMenu: (threadRef: ScopedThreadRef, position: { x: number; y: number }) => void;
  onSettle: (threadRef: ScopedThreadRef) => void;
  onUnsettle: (threadRef: ScopedThreadRef) => void;
  onSnooze: (threadRef: ScopedThreadRef, preset: SnoozePreset) => void;
  onUnsnooze: (threadRef: ScopedThreadRef) => void;
  onAcknowledgeWoke: (threadRef: ScopedThreadRef, visitedAt: string) => void;
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  // Drafts sit in the settle slot with an X instead of Check — same hover
  // cell, no server lifecycle. null on real threads.
  onDiscardDraft: ((threadRef: ScopedThreadRef) => void) | null;
  /* fork:end sidebar-v2-draft-rows */
  changeRequestSnapshot: ThreadChangeRequestSnapshot | null;
  onChangeRequestSnapshot: (
    threadKey: string,
    snapshot: ThreadChangeRequestSnapshot | null,
  ) => void;
}) {
  const {
    isRenaming,
    changeRequestSnapshot,
    onChangeRequestSnapshot,
    onCancelRename,
    onCommitRename,
    onContextMenu,
    onAcknowledgeWoke,
    /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
    onDiscardDraft,
    /* fork:end sidebar-v2-draft-rows */
    /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
    onPin,
    /* fork:end sidebar-v2-row-action-hit-area */
    onRenameTitleChange,
    onSettle,
    onSnooze,
    onStartRename,
    onThreadActivate,
    onThreadClick,
    /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
    onUnpin,
    /* fork:end sidebar-v2-row-action-hit-area */
    onUnsettle,
    onUnsnooze,
    openPullRequestsInRightPanel,
    renamingTitle,
    thread,
    variant,
    variantAction,
  } = props;
  const threadRef = useMemo(
    () => scopeThreadRef(thread.environmentId, thread.id),
    [thread.environmentId, thread.id],
  );
  const threadKey = scopedThreadKey(threadRef);
  const isRegeneratingTitle = thread.titleRegeneration != null;
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const openPrLink = useOpenPrLink();
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const terminalProcessCount = runningTerminalIds.length;

  const gitCwd = thread.worktreePath ?? props.projectCwd;
  const linkedPullRequestStatus = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
  );
  const gitStatus = useEnvironmentQuery(
    (thread.branch != null || thread.worktreePath !== null) && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const retainTerminalOnBranchMismatch = thread.worktreePath === null;
  const pr = resolveDisplayedThreadPr({
    threadBranch: thread.branch,
    gitStatus: gitStatus.data,
    snapshot: changeRequestSnapshot,
    retainTerminalOnBranchMismatch,
    linkedPullRequest: thread.linkedPullRequest,
    linkedPullRequestStatus,
  });

  // Same semantics as the legacy sidebar (never-visited counts as read):
  // switching sidebars must not light up every historical thread as unread.
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const status = resolveSidebarThreadStatus(thread);
  // A woken thread reappears at its original position (the sort is
  // deliberately static), so the pill has to carry the weight. Snoozing is
  // an explicit act, so the pill clears only when the user re-engages:
  // reading a completion-triggered wake, clicking the pill, sending a
  // message, settling, archiving, or a change request state that settles the
  // thread. Timer wakes survive a mere visit. An unparseable visit timestamp
  // counts as never-visited, so corrupt local data cannot eat the wake signal.
  const lastVisitedDate = lastVisitedAt === undefined ? null : parseTimestampDate(lastVisitedAt);
  const wokeAtDate = props.wokeAt === null ? null : parseTimestampDate(props.wokeAt);
  const isWoke =
    wokeAtDate !== null &&
    (lastVisitedDate === null || lastVisitedDate < wokeAtDate) &&
    thread.settledOverride !== "settled";
  // Upstream's slim-shelf recede rule: who owns the next move, folded with
  // read/woke state. CARDS DO NOT READ THIS — the component set draws Working
  // titles forward and Done/Idle receded, which is the opposite split, so a
  // card's title AND surface both come from `cardRecedes` below. This
  // predicate survives for the snoozed/settled slim rows, whose brightness
  // still encodes unread-ness (the card delegates that to the status dot).
  // See the "two recede rules" note in custom/sidebarV2RowPolicy.ts.
  const shouldRecede =
    (status === "ready" || status === "working" || status === "monitoring") &&
    !isUnread &&
    !isWoke &&
    !props.isActive &&
    !isSelected;
  // Approval stays amber and input stays indigo, matching sidebar v1 and the
  // mobile Live Activity/widgets. Working does NOT: v2 takes the emerald from
  // the phanttom Ghostty sidebar this design is ported from, so a working
  // thread reads green on web and still sky on mobile
  // (`apps/mobile/src/features/threads/thread-list-v2-items.tsx`). Migrating
  // mobile is a separate call; the divergence is deliberate, not an oversight.
  // Working and done share that emerald on purpose — the mark's *form*
  // separates them (falling pixels vs a static dot), not its hue.
  // Only two of these were drawn (working, approval); the rest are extended
  // from the same vocabulary. `rain` = the agent is moving, `dot` = it
  // stopped and the row is waiting on something, `woke` keeps its own glyph.
  // Labels are no longer painted — every status is a leading mark (rain, dot,
  // woke clock, idle ring, or the slow monitoring pulse). The label strings
  // survive only as accessible names for aria-hidden marks.
  //
  // Discriminated on `mark` so the dot branch cannot be handed the `working`
  // tone, which has no dot rendering.
  const topStatus:
    | { label: string; tone: "working"; mark: "rain" }
    | { label: string; tone: SidebarV2DotTone; mark: "dot" | "woke" }
    | { label: "Monitoring"; mark: "monitoring" }
    | null =
    status === "working"
      ? { label: "Working", tone: "working", mark: "rain" }
      : status === "monitoring"
        ? { label: "Monitoring", mark: "monitoring" }
        : status === "approval"
          ? { label: "Needs approval", tone: "approval", mark: "dot" }
          : status === "input"
            ? { label: "Needs input", tone: "input", mark: "dot" }
            : status === "failed"
              ? { label: "Failed", tone: "failed", mark: "dot" }
              : isWoke
                ? { label: "Woke from snooze", tone: "approval", mark: "woke" }
                : isUnread
                  ? { label: "Done", tone: "done", mark: "dot" }
                  : null;

  /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows */
  // The card's recede rule (Done/Idle — see rowPolicy). Computed once because
  // the surface consumes it too: title and surface dim together, or a Working
  // card would recede its surface while forcing its title forward. Monitoring
  // keeps its title forward (not idle, not done).
  const cardRecedes = threadCardTitleRecedes({
    isDone: topStatus?.mark === "dot" && topStatus.tone === "done",
    isIdle: topStatus === null,
    isActive: props.isActive,
    isSelected,
  });
  /* fork:end sidebar-v2-card-rows */

  const branchMismatch = resolveLocalCheckoutBranchMismatch({
    effectiveEnvMode: thread.worktreePath === null ? "local" : "worktree",
    activeWorktreePath: thread.worktreePath,
    activeThreadBranch: thread.branch,
    currentGitBranch: gitStatus.data?.refName ?? null,
  });
  const prProvider = resolveDisplayedThreadPrProvider({
    threadBranch: thread.branch,
    gitStatus: gitStatus.data,
    snapshot: changeRequestSnapshot,
    retainTerminalOnBranchMismatch,
    linkedPullRequest: thread.linkedPullRequest,
    linkedPullRequestStatus,
  });
  const prStatus = prStatusIndicator(pr, prProvider);
  const settledPrHoverClass = pr ? settledPrHoverColorClass(pr.state) : undefined;
  useEffect(() => {
    const nextSnapshot = nextThreadChangeRequestSnapshot({
      threadBranch: thread.branch,
      gitStatus: gitStatus.data,
      snapshot: changeRequestSnapshot,
      retainTerminalOnBranchMismatch,
      linkedPullRequest: thread.linkedPullRequest,
      linkedPullRequestStatus,
    });
    if (nextSnapshot === undefined) return;
    onChangeRequestSnapshot(threadKey, nextSnapshot);
  }, [
    changeRequestSnapshot,
    gitStatus.data,
    linkedPullRequestStatus,
    onChangeRequestSnapshot,
    retainTerminalOnBranchMismatch,
    thread.branch,
    thread.linkedPullRequest,
    threadKey,
  ]);

  const modelInstanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry = props.providerEntryByInstanceId.get(modelInstanceId) ?? null;
  const showInstanceBadge =
    providerEntry !== null &&
    shouldShowInstanceBadge(providerEntry, props.providerEntryByInstanceId.values());
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelLabel(selectedModel)
    : thread.modelSelection.model;

  const isRemote =
    props.currentEnvironmentId !== null && thread.environmentId !== props.currentEnvironmentId;

  /* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
  // Attribution is the port scanner's existing terminal→thread mapping — the
  // same per-row subscription upstream's v1 row already makes (Sidebar.tsx).
  // A listener counts for this row only when it was spawned inside one of the
  // thread's own T3 terminals; a server started in an external shell has
  // `terminal: null` (the scanner knows its pid but not its cwd) and lights
  // nothing rather than a guessed row.
  //
  // Slim rows never draw the card meta, so they pass null and skip the
  // subscription instead of retaining the scanner for a row that cannot
  // pulse. Card rows subscribe per thread.environmentId — a list spanning M
  // environments holds M discovered-servers streams, the multiplier v1's row
  // already carries.
  const devServerPorts = useThreadDiscoveredPorts({
    environmentId: variant === "card" ? thread.environmentId : null,
    threadId: variant === "card" ? thread.id : null,
  });
  const devServerPort = devServerPorts[0]?.port ?? null;
  // The tooltip names what the mark can only signal, and only what is true
  // from where the user sits. The port is the whole claim — the scanner keeps
  // every listening TCP socket, so "dev server" would overclaim — and for a
  // remote thread the listener is on the remote host, so "localhost" would
  // name the wrong machine. v1 says localhost loosely because its Globe is a
  // button routed through openDiscoveredPort to the right environment; this
  // label is inert text and carries no such correction.
  const devServerLabel =
    devServerPort === null
      ? null
      : `${isRemote ? `port ${devServerPort}` : `localhost:${devServerPort}`}${
          devServerPorts.length > 1 ? ` (+${devServerPorts.length - 1})` : ""
        }`;
  /* fork:end sidebar-v2-dev-server-pulse */

  const detailsTooltip = (
    <SidebarThreadTooltip
      thread={thread}
      projectTitle={props.projectTitle}
      projectCwd={props.projectCwd}
      projectFaviconPath={props.projectFaviconPath}
      environmentLabel={props.environmentLabel}
      providerEntry={providerEntry}
      showInstanceBadge={showInstanceBadge}
      modelInstanceId={modelInstanceId}
      modelLabel={modelLabel}
      branchMismatch={branchMismatch}
      /* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
      devServerLabel={devServerLabel}
      /* fork:end sidebar-v2-dev-server-pulse */
      terminalStatus={terminalStatus}
      terminalProcessCount={terminalProcessCount}
    />
  );

  const handleClick = useCallback(
    (event: ReactMouseEvent) => {
      onThreadClick(event, threadRef);
    },
    [onThreadClick, threadRef],
  );
  const handleAcknowledgeWokeClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (props.wokeAt === null) return;
      onAcknowledgeWoke(threadRef, props.wokeAt);
    },
    [onAcknowledgeWoke, props.wokeAt, threadRef],
  );
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      onContextMenu(threadRef, { x: event.clientX, y: event.clientY });
    },
    [onContextMenu, threadRef],
  );
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onThreadActivate(threadRef);
    },
    [onThreadActivate, threadRef],
  );
  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (isRenaming || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if ((event.target as HTMLElement).closest("button, a, input")) return;
      event.preventDefault();
      onStartRename(threadRef, thread.title);
    },
    [isRenaming, onStartRename, thread.title, threadRef],
  );
  const renameCommittedRef = useRef(false);
  useEffect(() => {
    if (isRenaming) renameCommittedRef.current = false;
  }, [isRenaming]);
  const handleRenameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCommitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCancelRename();
      }
    },
    [onCancelRename, onCommitRename, renamingTitle, thread.title, threadRef],
  );
  const handleRenameBlur = useCallback(() => {
    if (!renameCommittedRef.current) {
      onCommitRename(threadRef, renamingTitle, thread.title);
    }
  }, [onCommitRename, renamingTitle, thread.title, threadRef]);
  const handleSettleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onSettle(threadRef);
    },
    [onSettle, threadRef],
  );
  /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
  const handlePinClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onPin(threadRef);
    },
    [onPin, threadRef],
  );
  const handleUnpinClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnpin(threadRef);
    },
    [onUnpin, threadRef],
  );
  /* fork:end sidebar-v2-row-action-hit-area */
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  const handleDiscardDraftClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onDiscardDraft?.(threadRef);
    },
    [onDiscardDraft, threadRef],
  );
  const showDiscardDraft = onDiscardDraft !== null;
  /* fork:end sidebar-v2-draft-rows */
  const handleUnsettleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnsettle(threadRef);
    },
    [onUnsettle, threadRef],
  );
  const handleUnsnoozeClick = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onUnsnooze(threadRef);
    },
    [onUnsnooze, threadRef],
  );
  const handleSnoozePreset = useCallback(
    (preset: SnoozePreset) => {
      onSnooze(threadRef, preset);
    },
    [onSnooze, threadRef],
  );
  // While the snooze popover is open the pointer leaves the row, which
  // would fade the hover actions out from under the open menu; pin them.
  const [snoozeMenuOpenRaw, setSnoozeMenuOpen] = useState(false);
  // Snooze is offered only where it can succeed: capability-gated and never
  // on blocked-on-you work or queued turns (the server rejects both).
  const showSnoozeButton =
    props.snoozeSupported && canSnooze(thread, { now: new Date().toISOString() });
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  // After showSnoozeButton — using it above its declaration fails typecheck.
  const hasHoverActions =
    props.settlementSupported || props.pinningSupported || showSnoozeButton || showDiscardDraft;
  /* fork:end sidebar-v2-draft-rows */
  // If the thread becomes blocked while the popover is open, the button
  // unmounts without firing onOpenChange(false). Deriving the flag keeps a
  // stale true from permanently hiding the status label / pinning the
  // hover actions, and the effect clears the raw state so the popover
  // doesn't resurrect if the button later remounts.
  const snoozeMenuOpen = snoozeMenuOpenRaw && showSnoozeButton;
  useEffect(() => {
    if (!showSnoozeButton) setSnoozeMenuOpen(false);
  }, [showSnoozeButton]);
  const handlePrClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!pr?.url) return;
      const openedInRightPanel = openPrLink(
        event,
        pr.url,
        openPullRequestsInRightPanel ? threadRef : undefined,
      );
      if (openedInRightPanel && openPullRequestsInRightPanel && !props.isActive) {
        onThreadActivate(threadRef);
      }
    },
    [onThreadActivate, openPrLink, openPullRequestsInRightPanel, pr, props.isActive, threadRef],
  );

  const rowSurfaceClassName = threadRowSurfaceClassName({
    isActive: props.isActive,
    isSelected,
    /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows */
    // One definition of "receded" per row: the card's surface reads the same
    // Done/Idle predicate as its title, or a Working card dims its inherited
    // text while forcing its title forward — two opposite policies in one
    // rectangle. Slim shelves keep upstream's rule.
    recedes: variant === "card" ? cardRecedes : shouldRecede,
    // Cards take the component set's 12px corner; slim shelf rows keep the 8px
    // they were drawn at.
    variant,
    /* fork:end sidebar-v2-card-rows */
  });

  const title = isRenaming ? (
    <input
      autoFocus
      value={renamingTitle}
      aria-label="Thread title"
      onChange={(event) => onRenameTitleChange(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={handleRenameKeyDown}
      onBlur={handleRenameBlur}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded-sm border border-input bg-card px-1 text-sm font-medium text-card-foreground outline-none focus:border-foreground"
    />
  ) : (
    <span
      className={cn(
        "min-w-0 flex-1 transition-opacity motion-reduce:transition-none",
        // Card titles own size+leading in threadCardTitleClassName
        // (0.875rem / 14px). text-xs here used to win the cascade and inject
        // --text-xs--line-height: 1rem (16px), which grew the title row past
        // its h-[14px] via flex min-height:auto — the rain then read as 16px.
        variant === "card"
          ? threadCardTitleClassName({ recedes: cardRecedes })
          : cn(
              "text-sm",
              shouldRecede ? "font-normal" : "font-medium",
              "truncate group-hover/v2-row:text-foreground",
              props.isActive || isWoke
                ? "text-foreground"
                : isUnread
                  ? "text-muted-foreground"
                  : "text-secondary-label/70",
            ),
        isRegeneratingTitle && "opacity-[0.55]",
      )}
    >
      {thread.title}
    </span>
  );

  // A real link so cmd/ctrl+click and middle-click open the host in the
  // browser. A plain click still opens T3's pull request view.
  const prBadge =
    prStatus && pr ? (
      <a
        href={pr.url}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handlePrClick}
        className={cn(
          // Sidebar chrome follows the interface font; tabular digits keep the
          // number from reflowing as PR states stream in.
          "shrink-0 tabular-nums hover:underline",
          /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
             On a card the badge rides the title line (Figma 113:728) at an
             explicit 12px, so the panel's --text-xs → 13px remap cannot grow it
             past the elapsed time beside it; pe-1 is the design's 4px, both to
             the card's content edge and between the badge and that time. Slim
             shelf rows keep upstream's text-xs. */
          variant === "card" ? "pe-1 text-[0.75rem] leading-4" : "text-xs",
          /* fork:end sidebar-v2-card-rows */
          variant === "slim" && variantAction === "unsettle"
            ? props.isActive
              ? "text-secondary-label"
              : cn("text-secondary-label transition-colors", settledPrHoverClass)
            : prStatus.colorClass,
        )}
        aria-label={prStatus.tooltip}
      >
        #{pr.number}
      </a>
    ) : null;
  const terminalStatusIcon = terminalStatus ? (
    <span
      role="img"
      aria-label={terminalProcessLabel(terminalProcessCount)}
      data-testid={`sidebar-terminal-status-${thread.id}`}
      className={cn("inline-flex shrink-0 items-center justify-center", terminalStatus.colorClass)}
    >
      <TerminalIcon className={cn("size-3.5", terminalStatus.pulse && "animate-status-pulse")} />
    </span>
  ) : null;
  /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
     The flat card's repo line leads its project name with the same favicon
     the slim row and the project menu draw, at the line's 16px mark size.
     Pre-built here beside the terminal glyph and handed to the fork card as a
     slot for the same reason. `text-current` keeps the no-asset fallback on
     the line's muted tone rather than ProjectFavicon's icon-muted, and that
     fallback is the design's folder mark itself, aria-hidden like every other
     mark on the line. */
  const projectIcon = (
    <ProjectFavicon
      environmentId={thread.environmentId}
      cwd={props.projectCwd ?? ""}
      faviconPath={props.projectFaviconPath}
      className="size-4 text-current"
      fallbackIcon={SidebarV2ProjectFolderMark}
    />
  );
  /* fork:end sidebar-v2-card-rows */
  /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area
     Upstream hoists one pin marker that doubles as an unpin button in every
     row variant. Unpin stays a card hover action (below) and a context-menu
     item here, so both the card's title line and the slim shelves draw this
     passive marker: a pinned thread shows it wherever it sits, without a
     second 12px target. */
  const pinIndicator = props.isPinned ? (
    <PinIcon aria-label="Pinned" role="img" className="size-3 shrink-0 text-muted-foreground/65" />
  ) : null;
  /* fork:end sidebar-v2-row-action-hit-area */

  if (variant === "slim") {
    return (
      <li
        data-thread-item
        className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_36px]"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                role="button"
                tabIndex={0}
                data-testid="sidebar-row-slim"
                aria-busy={isRegeneratingTitle || undefined}
                className={cn(rowSurfaceClassName, "flex h-9 items-center gap-2.5 px-2.5")}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleKeyDown}
                onContextMenu={handleContextMenu}
              />
            }
          >
            {/* Settled history recedes: dimmed favicon at rest, restored on
              hover so the tail stays scannable when you're hunting. */}
            <span
              className={cn(
                "shrink-0 transition-opacity",
                !props.isActive &&
                  "opacity-40 grayscale group-hover/v2-row:opacity-100 group-hover/v2-row:grayscale-0",
              )}
            >
              <ProjectFavicon
                environmentId={thread.environmentId}
                cwd={props.projectCwd ?? ""}
                faviconPath={props.projectFaviconPath}
                className="size-4"
                fallbackIcon={MessageSquareIcon}
              />
            </span>
            {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                Fixed 14px leading slot (same as the card) so a monitoring mark
                cannot shove the title 24px right of every neighboring slim row. */}
            <span className="pointer-events-none flex size-[14px] shrink-0 items-center justify-center overflow-hidden">
              <SidebarV2StatusMark
                status={topStatus}
                rainSeed={threadKey}
                idle={showDiscardDraft ? "draft" : "empty"}
              />
            </span>
            {/* fork:end sidebar-v2-card-rows */}
            {title}
            {pinIndicator}
            {terminalStatusIcon}
            {isRegeneratingTitle ? (
              <span role="status" className="sr-only">
                Regenerating title
              </span>
            ) : null}
            {/* The PR badge stays outside the hover-fading slot: it must
              remain visible AND clickable while the row is hovered. Only
              the time/jump label yields to the settle affordance. */}
            {prBadge}
            <span className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
              <span
                className={cn(
                  "inline-flex justify-end tabular-nums text-secondary-label transition-opacity",
                  !isWoke && "group-hover/v2-row:opacity-0",
                )}
              >
                {variantAction === "unsnooze" && props.snoozeWakeLabelText !== null ? (
                  // Snoozed rows show when they come BACK, not when they were
                  // last touched — the return ticket is the row's whole story.
                  <span className="text-xs text-blue-600 tabular-nums dark:text-blue-400">
                    {props.snoozeWakeLabelText}
                  </span>
                ) : isWoke ? (
                  // A wake can land straight in the settled tail (e.g. PR
                  // merged while snoozed); the signal must survive the trip.
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Dismiss Woke notification"
                          onClick={handleAcknowledgeWokeClick}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-amber-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
                        >
                          <AlarmClockIcon aria-hidden className="size-3" />
                          <span role="status">Woke</span>
                        </button>
                      }
                    />
                    <TooltipPopup side="top">Dismiss Woke notification</TooltipPopup>
                  </Tooltip>
                ) : (
                  <span className="text-xs">
                    {variantAction === "unsettle"
                      ? settledTimeLabel(thread)
                      : threadTimeLabel(thread)}
                  </span>
                )}
              </span>
              {variantAction === "unsnooze" ? (
                !props.snoozeSupported ? null : (
                  <button
                    type="button"
                    aria-label="Wake thread now"
                    onClick={handleUnsnoozeClick}
                    /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                    className={SIDEBAR_V2_SLIM_ROW_ACTION_CLASS}
                    /* fork:end sidebar-v2-row-action-hit-area */
                  >
                    <AlarmClockOffIcon className="mb-px size-3" />
                  </button>
                )
              ) : !props.settlementSupported ? null : variantAction === "unsettle" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Un-settle thread"
                        onClick={handleUnsettleClick}
                        /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                        className={SIDEBAR_V2_SLIM_ROW_ACTION_CLASS}
                        /* fork:end sidebar-v2-row-action-hit-area */
                      />
                    }
                  >
                    <Undo2Icon className="mb-px size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Un-settle thread</TooltipPopup>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-label="Settle thread"
                  onClick={handleSettleClick}
                  /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                  className={SIDEBAR_V2_SLIM_ROW_ACTION_CLASS}
                  /* fork:end sidebar-v2-row-action-hit-area */
                >
                  <CheckIcon className="size-3" />
                </button>
              )}
            </span>
            {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
          </TooltipTrigger>
          {detailsTooltip}
        </Tooltip>
      </li>
    );
  }

  const sortable = props.sortable;
  return (
    <li
      data-thread-item
      ref={sortable?.setNodeRef}
      style={
        sortable
          ? {
              transform: CSS.Translate.toString(sortable.transform),
              transition: sortable.transition,
            }
          : undefined
      }
      {...(sortable?.listeners ?? {})}
      className={cn(
        "list-none [content-visibility:auto]",
        sortable?.isDragging && "z-20 opacity-80",
        /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
           content-visibility skips offscreen rows; this is what keeps the
           scrollbar honest while they are skipped. One value, because the
           component set draws one height: the li carries no padding of its own,
           so it equals the drawn card exactly — 8 + 18 + 2 + 16 + 8 = 52. */
        "[contain-intrinsic-size:auto_52px]",
        /* fork:end sidebar-v2-card-rows */
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              role="button"
              tabIndex={0}
              data-testid="sidebar-row-card"
              aria-busy={isRegeneratingTitle || undefined}
              className={rowSurfaceClassName}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onKeyDown={handleKeyDown}
              onContextMenu={handleContextMenu}
            />
          }
        >
          {/* Two rows: title and repo. Status leads the title line; the repo
              line indents under the title text (16px mark + 6px gap). The
              trailing cell on the title line holds the PR badge, elapsed time
              while working, and the hover actions — status no longer shares
              that cell, so the opacity crossfade hit-path bug cannot return.

              Drawn height 52 (8+18+2+16+8); the li adds nothing, so
              contain-intrinsic-size is that exact value. */}
          {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
              Figma 113:725: px-4 py-8 (4/8), 2px between the rows. List pad 8
              puts the leading status box at 12px, and a 16px box centres its
              mark at 20 — the same axis as Search and the group folder icon. */}
          <div className="relative z-10 flex flex-col gap-0.5 px-1 py-2">
            {/* fork:end sidebar-v2-card-rows */}
            {/* Title line is 18px tall — the 14px prompt's own line box, and
                what the card's 52 is measured from (8 + 18 + 2 + 16 + 8). */}
            {/* Box and gap are derived in custom/sidebarV2CardAlignment: they
                are what put the prompt on the same 34px edge as the group
                header's label, so neither moves alone. */}
            {/* No overflow-hidden on the row: the trailing settle/X cell is
                h-6 and must overhang into py-2. Clipping here cut the 24px
                hover fill into a short rectangle. Rain clips itself in the
                status slot below. */}
            <div
              className={cn(
                "flex h-[18px] min-h-[18px] min-w-0 items-center",
                SIDEBAR_V2_CARD_ALIGNMENT.titleGap,
              )}
            >
              {/* Leading status box (Figma 113:725 `indicator`). Always present
                  (idle draws the hollow ring) so the title text and the
                  indented row below share one left edge. The marks inside keep
                  their own sizes — the rain is 14px tall, a status dot is 8px —
                  and centre in the box. pointer-events-none: a mark is never a
                  target. */}
              <span
                className={cn(
                  "pointer-events-none flex shrink-0 items-center justify-center overflow-hidden",
                  SIDEBAR_V2_CARD_ALIGNMENT.statusBox,
                )}
              >
                {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows */}
                <SidebarV2StatusMark
                  status={topStatus}
                  rainSeed={threadKey}
                  idle={showDiscardDraft ? "draft" : "ring"}
                />
                {/* fork:end sidebar-v2-card-rows */}
              </span>
              {title}
              {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                  Pinned state rides the title line as a 12px glyph after the
                  prompt: the pinned block above the divider carries the
                  grouping, the glyph names the state per card. */}
              {pinIndicator}
              {/* fork:end sidebar-v2-card-rows */}
              {isRegeneratingTitle ? (
                <span role="status" className="sr-only">
                  Regenerating title
                </span>
              ) : null}
              {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                  Trailing group (Figma 113:728): the PR badge, then elapsed /
                  hover actions. The design ends the group 4px in from the
                  card's content edge and puts 4px between the badge and the
                  time; the badge carries both as its own `pe-1`, so the group
                  needs no gap of its own and the hover actions underneath keep
                  their flush 24px box on the trailing axis.

                  The badge does not fade with the elapsed time on hover: it is
                  a link to the PR, and a control you can only reach by *not*
                  pointing at its row is not a control. */}
              {prBadge || hasHoverActions || status === "working" ? (
                <span className="flex shrink-0 items-center">
                  {prBadge}
                  {/* fork:end sidebar-v2-card-rows */}
                  {/* Elapsed while working, hover actions when offered.
                      Stacked and right-aligned so the title truncates against
                      whichever child is showing. Status used to live here too;
                      moving it left is what let the indent below line up. */}
                  {/* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */}
                  {/* h-6, not the line's 18px: the hover actions share this
                      cell and a 24px target cannot fit in an 18px one. The cell
                      is centred in the title line, so it spans y 5→29 of the
                      card's content box — 3px into the py-2 above, and below
                      through the 2px row gap to exactly the top of the runtime
                      glyph, which sits at y 29→43 on the same trailing axis.

                      Flush, not overlapping, and deliberate: 0px is what the
                      design's 52px height leaves once the hit target holds its
                      24px WCAG floor (see custom/sidebarV2TrailingColumn — that
                      floor is design-wide, not this cell's private call). The
                      hover fill therefore meets the glyph without covering it.
                      Nothing is stolen either: this wrapper is `relative` and
                      the runtime span is not, so the actions hit-test above it
                      regardless. Shrinking the cell to buy clearance would
                      trade a visual seam for a sub-minimum target. */}
                  {/* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */}
                  {hasHoverActions ||
                  /* fork:end sidebar-v2-draft-rows */
                  status === "working" ? (
                    <span className="grid h-6 shrink-0 grid-cols-1 items-center justify-items-end">
                      {/* fork:end sidebar-v2-row-action-hit-area */}
                      {status === "working" ? (
                        <span
                          className={cn(
                            "pointer-events-none col-start-1 row-start-1 flex items-center pr-1",
                            // The fade exists to yield the cell to the hover
                            // actions. When neither action is offered there is
                            // nothing to yield to, and an unconditional fade
                            // blanks the timer on hover with nothing in its place.
                            /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                            hasHoverActions &&
                              /* fork:end sidebar-v2-draft-rows */
                              "transition-opacity group-hover/v2-row:opacity-0",
                            snoozeMenuOpen && "opacity-0",
                          )}
                        >
                          <span
                            aria-hidden
                            className="text-[11px] leading-[15px] text-foreground tabular-nums"
                          >
                            <WorkingDuration startedAt={resolveWorkingStartedAt(thread)} />
                          </span>
                        </span>
                      ) : null}
                      {/* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */}
                      {hasHoverActions ? (
                        /* fork:end sidebar-v2-draft-rows */
                        <span
                          className={cn(
                            // Zero-width at rest so a settled row's title still runs
                            // the full width of the card when nothing is pointing at
                            // it; the column only widens once the actions are
                            // actually showing, and the title re-truncates to match.
                            // fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area
                            // focus-within:overflow-visible, because the clip that
                            // collapses this to zero width also cuts the focus ring:
                            // it is a box-shadow 4px outside a button the wrapper
                            // hugs exactly, so a keyboard user got no indicator at
                            // all on the one control the ring was added for. Only
                            // lifted while focus is inside, which is the same
                            // condition that widens the wrapper.
                            //
                            // The offset is derived in custom/sidebarV2TrailingColumn
                            // with the rest of the column's; `relative` keeps the
                            // actions in the positioned layer with any opacity
                            // crossfade sibling (elapsed) that shares this cell.
                            // fork:end sidebar-v2-row-action-hit-area
                            SIDEBAR_V2_TRAILING_OFFSET.cardActions,
                            "relative col-start-1 row-start-1 flex w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity focus-within:w-auto focus-within:overflow-visible focus-within:opacity-100 group-hover/v2-row:w-auto group-hover/v2-row:opacity-100",
                            snoozeMenuOpen && "w-auto opacity-100",
                          )}
                        >
                          {/* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area
                          Pin leads the cell, ahead of snooze: the two literal
                          labels are separate branches on purpose — the hit-area
                          guard counts each label's call sites. */}
                          {props.pinningSupported ? (
                            props.isPinned ? (
                              <button
                                type="button"
                                aria-label="Unpin thread"
                                onClick={handleUnpinClick}
                                className={SIDEBAR_V2_ICON_BUTTON_CLASS}
                              >
                                <PinOffIcon className="size-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                aria-label="Pin thread"
                                onClick={handlePinClick}
                                className={SIDEBAR_V2_ICON_BUTTON_CLASS}
                              >
                                <PinIcon className="size-3" />
                              </button>
                            )
                          ) : null}
                          {/* fork:end sidebar-v2-row-action-hit-area */}
                          {showSnoozeButton ? (
                            <SnoozePopoverButton
                              open={snoozeMenuOpen}
                              onOpenChange={setSnoozeMenuOpen}
                              onSnooze={handleSnoozePreset}
                              timestampFormat={props.timestampFormat}
                            />
                          ) : null}
                          {props.settlementSupported ? (
                            <button
                              type="button"
                              aria-label="Settle thread"
                              onClick={handleSettleClick}
                              /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                              className={SIDEBAR_V2_ICON_BUTTON_CLASS}
                              /* fork:end sidebar-v2-row-action-hit-area */
                            >
                              {/* Icon-only in v2: at 282px the "Settle" text pushed the
                              hover actions over the title, which now shares their
                              line. `aria-label` carries the name. */}
                              <CheckIcon className="size-3" />
                            </button>
                          ) : null}
                          {/* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */}
                          {showDiscardDraft ? (
                            <button
                              type="button"
                              aria-label="Discard draft"
                              onClick={handleDiscardDraftClick}
                              className={SIDEBAR_V2_ICON_BUTTON_CLASS}
                            >
                              <XIcon className="size-3" />
                            </button>
                          ) : null}
                          {/* fork:end sidebar-v2-draft-rows */}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <SidebarV2ThreadCardMeta
              projectTitle={props.projectTitle}
              /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
              projectTitleHidden={props.projectTitleHidden === true}
              /* fork:end sidebar-v2-project-grouping */
              /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                 The project favicon, pre-built above beside the terminal glyph. */
              projectIconSlot={projectIcon}
              /* fork:end sidebar-v2-card-rows */
              branch={thread.branch}
              // fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
              // The same predicate the row already uses to pick its git cwd and
              // env mode above, so the mark cannot claim a worktree the rest of
              // the row is not treating as one.
              // fork:end sidebar-v2-card-rows
              hasWorktree={thread.worktreePath !== null}
              /* fork:begin sidebar-v2-dev-server-pulse — see .fork/customizations.yaml#sidebar-v2-dev-server-pulse */
              devServerPort={devServerPort}
              /* fork:end sidebar-v2-dev-server-pulse */
              /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                 Upstream's terminal-status glyph (#4712), pre-built above and
                 handed in as a slot so the fork card keeps upstream's
                 after-the-branch reading order without upstream state crossing
                 the component boundary. */
              terminalSlot={terminalStatusIcon}
              /* fork:end sidebar-v2-card-rows */
              modelLabel={modelLabel}
              isRemote={isRemote}
            />
          </div>
          {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
        </TooltipTrigger>
        {detailsTooltip}
      </Tooltip>
    </li>
  );
});

/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
   Upstream's `latestTurnDiff` stub stood here. It always returned null — shells
   carry no checkpoint summaries — and the fork card was its only caller, so it
   went out with the row that displayed diff counts (Figma 113:724 draws none).
   Port it back, with a call site, if the shell projection ever grows the field
   and the design finds somewhere to put it. */
/* fork:end sidebar-v2-card-rows */

export default function Sidebar() {
  const projects = useProjects();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const threads = useThreadShells();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const confirmThreadDelete = useClientSettings((s) => s.confirmThreadDelete);
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const sidebarProjectSortOrder = useClientSettings((s) => s.sidebarProjectSortOrder);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  const [groupByProject, setGroupByProject] = useSidebarV2GroupByProject();
  const [collapsedProjectKeys, toggleProjectGroupCollapsed] = useSidebarV2CollapsedProjects();
  /* fork:end sidebar-v2-project-grouping */
  const {
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    confirmAndUnpinThread,
    reorderPinnedThread,
    archiveThread,
    deleteThread,
  } = useThreadActions();
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyBranchToClipboard } = useCopyToClipboard<{ branch: string }>({
    target: "branch name",
    onCopy: ({ branch }) => {
      toastManager.add({
        type: "success",
        title: "Branch copied",
        description: branch,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy branch",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: ({ threadId }) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const newThreadContext = useHandleNewThread();
  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */
  const listScrollGutterRef = useScrollGutterWidth();
  /* fork:end fork-sidebar-chrome */
  const openAddProjectCommandPalette = useCallback(
    () => openCommandPalette({ open: "add-project" }),
    [],
  );
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const toggleThreadSelection = useThreadSelectionStore((s) => s.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((s) => s.rangeSelectTo);
  const markThreadUnread = useUiStateStore((s) => s.markThreadUnread);
  const markThreadVisited = useUiStateStore((s) => s.markThreadVisited);
  const acknowledgeWoke = useCallback(
    (threadRef: ScopedThreadRef, visitedAt: string) => {
      markThreadVisited(scopedThreadKey(threadRef), visitedAt);
    },
    [markThreadVisited],
  );
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeDraftThread = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  // Upstream only resolves a draft route after promotion. Unpromoted drafts
  // still own a reserved thread id — use it so the sidebar card highlights
  // and keyboard order treat the draft the same as any other open thread.
  const routeThreadRef = useMemo(() => {
    const promoted = resolveActiveThreadRouteRef(routeTarget, routeDraftThread);
    if (promoted) return promoted;
    if (routeTarget?.kind === "draft" && routeDraftThread) {
      return scopeThreadRef(routeDraftThread.environmentId, routeDraftThread.threadId);
    }
    return null;
  }, [routeDraftThread, routeTarget]);
  /* fork:end sidebar-v2-draft-rows */
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  const routeTargetRef = useRef(routeTarget);
  routeTargetRef.current = routeTarget;
  // Post-settle navigation validates against the CURRENT route, not the one
  // captured when the settle started: if the user navigated elsewhere while
  // the command was in flight, completing it must not yank them away.
  const routeThreadKeyRef = useRef(routeThreadKey);
  routeThreadKeyRef.current = routeThreadKey;

  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const orderedProjects = useMemo(
    () =>
      orderItemsByPreferredIds({
        items: projects,
        preferredIds: projectOrder,
        getId: getProjectOrderKey,
        getPreferenceIds: (project) => [
          getProjectOrderKey(project),
          legacyProjectCwdPreferenceKey(project.workspaceRoot),
        ],
      }),
    [projectOrder, projects],
  );
  const unsortedProjectGroups = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects: sidebarProjectSortOrder === "manual" ? orderedProjects : projects,
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }),
    [
      environmentLabelById,
      orderedProjects,
      primaryEnvironmentId,
      projectGroupingSettings,
      projects,
      sidebarProjectSortOrder,
    ],
  );
  const projectGroups = useMemo(
    () => sortLogicalProjectsForSidebar(unsortedProjectGroups, threads, sidebarProjectSortOrder),
    [sidebarProjectSortOrder, threads, unsortedProjectGroups],
  );
  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  // Keyed on the project list alone. The active-thread list churns on inputs
  // grouping does not care about — the quantized clock, capability
  // descriptors, PR states arriving one per row — and rebuilding this index on
  // each of those is work per project for an answer that has not changed.
  const projectRefIndex = useMemo(() => createProjectRefIndex(projectGroups), [projectGroups]);
  /* fork:end sidebar-v2-project-grouping */
  const projectGroupsRef = useRef(projectGroups);
  projectGroupsRef.current = projectGroups;
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  // Threads on non-primary environments (T3 Connect, hosted) resolve their
  // provider entry from their own environment's config: default instance ids
  // are driver slugs, so a flat map would collide across environments.
  const providerEntriesByEnvironment = useMemo(
    () =>
      deriveProviderEntriesByEnvironment(
        [...serverConfigs].map(
          ([environmentId, config]) => [environmentId, config.providers] as const,
        ),
      ),
    [serverConfigs],
  );
  const projectCwdByKey = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          `${project.environmentId}:${project.id}`,
          project.workspaceRoot,
        ]),
      ),
    [projects],
  );
  const projectFaviconPathByKey = useMemo(
    () =>
      new Map(
        projects.map((project) => [`${project.environmentId}:${project.id}`, project.faviconPath]),
      ),
    [projects],
  );
  const projectDisplayNameByKey = useMemo(
    () =>
      new Map(
        projectGroups.flatMap((group) =>
          group.memberProjects.map(
            (project) => [`${project.environmentId}:${project.id}`, group.displayName] as const,
          ),
        ),
      ),
    [projectGroups],
  );

  const nowMinute = useNowMinute();
  // Snooze wake times are second-precise, so classifying with the quantized
  // minute would hold a woken thread on the shelf for up to a minute. The
  // tick is a plain counter bumped exactly at the next wake boundary (armed
  // below, after the partition knows the boundary); the partition reads a
  // fresh clock whenever it recomputes.
  const [snoozeWakeTick, bumpSnoozeWakeTick] = useState(0);

  const changeRequestSnapshotByKey = useAtomValue(threadChangeRequestSnapshotsAtom);

  // Project scope: one menu above the list. Scoping filters the list without
  // making the header width depend on the number or length of project names.
  const [projectScopeKey, setProjectScopeKey] = useState<string | null>(null);
  const [projectScopeMenuState, dispatchProjectScopeMenu] = useReducer(
    reduceSidebarProjectScopeMenuState,
    { open: false, query: "" },
  );
  const scopedProjectGroup = useMemo(
    () =>
      projectScopeKey === null
        ? null
        : (projectGroups.find((project) => project.projectKey === projectScopeKey) ?? null),
    [projectGroups, projectScopeKey],
  );
  const scopedProjectKeys = useMemo(
    () =>
      scopedProjectGroup === null
        ? null
        : new Set(
            scopedProjectGroup.memberProjectRefs.map(
              (projectRef) => `${projectRef.environmentId}:${projectRef.projectId}`,
            ),
          ),
    [scopedProjectGroup],
  );
  useEffect(() => {
    if (projectScopeKey !== null && scopedProjectGroup === null) {
      setProjectScopeKey(null);
    }
  }, [projectScopeKey, scopedProjectGroup]);
  // Scope flips drop the selection: rows selected under the old scope may be
  // hidden now, and bulk actions must never count or touch invisible rows.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, projectScopeKey]);

  const openProjectSettings = useCallback(
    (projectGroup: SidebarProjectSnapshot) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/projects/$projectKey",
        params: { projectKey: projectGroup.projectKey },
      });
    },
    [isMobile, router, setOpenMobile],
  );
  const handleProjectSettings = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, projectGroup: SidebarProjectSnapshot) => {
      event.preventDefault();
      event.stopPropagation();
      dispatchProjectScopeMenu({ type: "project-settings-opened" });
      openProjectSettings(projectGroup);
    },
    [openProjectSettings],
  );

  // Settled threads stay in the live shell stream (settled ≠ archived), so
  // the partition works directly off live shells: no archived-snapshot
  // merging, no optimistic holds. Archived threads remain hidden here —
  // archive keeps its original "remove from sidebar" meaning.
  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const projectDefaultModelByKey = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          `${project.environmentId}:${project.id}`,
          project.defaultModelSelection,
        ]),
      ),
    [projects],
  );
  const serverThreadKeys = useMemo(
    () =>
      new Set(
        threads.map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
      ),
    [threads],
  );
  // Prompt titles are read from getState() on route/shell changes — not
  // subscribed per keystroke — so typing in the composer does not rebuild the
  // partition. Leaving the draft (routeThreadKey) is what refreshes the label.
  const draftRows = useMemo(
    () =>
      listSidebarDraftRows({
        draftsById: draftThreadsByThreadKey,
        modelSelectionForDraft: (draftId, draft) =>
          sidebarDraftModelSelection({
            composerDraft: useComposerDraftStore.getState().getComposerDraft(draftId),
            fallback:
              projectDefaultModelByKey.get(`${draft.environmentId}:${draft.projectId}`) ??
              NO_PROVIDER_MODEL_SELECTION,
          }),
        promptForDraft: (draftId) =>
          useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt ?? "",
        hasServerShell: (threadRef) => serverThreadKeys.has(scopedThreadKey(threadRef)),
      }),
    // routeThreadKey: snapshot composer prompts when the open thread changes.
    [draftThreadsByThreadKey, projectDefaultModelByKey, routeThreadKey, serverThreadKeys],
  );
  const draftIdByThreadKey = useMemo(() => indexDraftIdsByThreadKey(draftRows), [draftRows]);
  const draftIdByThreadKeyRef = useRef(draftIdByThreadKey);
  draftIdByThreadKeyRef.current = draftIdByThreadKey;
  /* fork:end sidebar-v2-draft-rows */
  const {
    pinnedThreads,
    reorderablePinnedKeys,
    activeThreads,
    snoozedThreads,
    settledThreads,
    snoozeNow,
  } = useMemo(() => {
    // Snooze classification uses a REAL clock, not the quantized minute:
    // wake times are second-precise and a woken thread must not linger on
    // the shelf for the rest of the minute. snoozeWakeTick re-runs this
    // memo exactly at the next wake boundary.
    void snoozeWakeTick;
    const preciseNow = new Date().toISOString();
    const visible = threads.filter(
      (thread) =>
        thread.archivedAt === null &&
        (scopedProjectKeys === null ||
          scopedProjectKeys.has(`${thread.environmentId}:${thread.projectId}`)),
    );
    const pinned: EnvironmentThreadShell[] = [];
    const active: EnvironmentThreadShell[] = [];
    const snoozed: EnvironmentThreadShell[] = [];
    const settled: EnvironmentThreadShell[] = [];
    for (const thread of visible) {
      // Threads on servers without the settlement capability (old server,
      // or descriptor not loaded yet) never classify as settled: the user
      // could neither un-settle nor pin them, so auto-settling them would
      // strand rows in a tail with no working affordances.
      const supportsSettlement =
        serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSettlement === true;
      const supportsSnooze =
        serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSnooze === true;
      // Snooze outranks settlement and pinning until the thread wakes.
      if (supportsSnooze && effectiveSnoozed(thread, { now: preciseNow })) {
        snoozed.push(thread);
      } else if (supportsSettlement && thread.settledOverride === "settled") {
        settled.push(thread);
      } else if (thread.pinnedAt != null) {
        pinned.push(thread);
      } else {
        active.push(thread);
      }
    }
    /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
    // Client-only drafts (plus → /draft/$id) never enter the shell stream
    // until the first send. Fold them into the active list so the card shows
    // up under the project the moment the draft exists.
    for (const row of draftRows) {
      const shell = row.shell;
      if (
        scopedProjectKeys !== null &&
        !scopedProjectKeys.has(`${shell.environmentId}:${shell.projectId}`)
      ) {
        continue;
      }
      active.push(shell);
    }
    /* fork:end sidebar-v2-draft-rows */
    return {
      pinnedThreads: sortPinnedThreadsForSidebar(pinned),
      reorderablePinnedKeys: new Set(
        pinned
          .filter(
            (thread) =>
              serverConfigs.get(thread.environmentId)?.environment.capabilities.threadPinReorder ===
              true,
          )
          .map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
      ),
      activeThreads: sortThreadsForSidebar(active),
      // Soonest wake first: "what comes back next" is the shelf's question.
      snoozedThreads: snoozed.toSorted(
        (left, right) =>
          firstValidTimestampMs(left.snoozedUntil ?? null) -
          firstValidTimestampMs(right.snoozedUntil ?? null),
      ),
      settledThreads: sortSettledThreadsForSidebar(settled),
      snoozeNow: preciseNow,
    };
  }, [
    /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
    draftRows,
    /* fork:end sidebar-v2-draft-rows */
    nowMinute,
    scopedProjectKeys,
    serverConfigs,
    snoozeWakeTick,
    threads,
  ]);

  // Arm a timeout for the earliest upcoming wake so the shelf empties the
  // moment a snooze expires instead of on the next minute tick. Sorted
  // soonest-first, so entry 0 is the boundary.
  useEffect(() => {
    const nextWakeAtMs =
      snoozedThreads.length > 0 && snoozedThreads[0]?.snoozedUntil != null
        ? Date.parse(snoozedThreads[0].snoozedUntil)
        : Number.NaN;
    if (Number.isNaN(nextWakeAtMs)) return;
    // setTimeout delays are signed 32-bit: anything larger overflows and
    // fires immediately, turning a far-future wake (event-condition snoozes
    // synced from elsewhere) into a tight re-arm loop. Clamped, the timer
    // just re-arms every ~24.8 days until the wake is in range.
    const delayMs = Math.min(Math.max(0, nextWakeAtMs - Date.now()) + 50, 2_147_483_647);
    const id = window.setTimeout(() => bumpSnoozeWakeTick((tick) => tick + 1), delayMs);
    return () => window.clearTimeout(id);
  }, [snoozedThreads]);

  // The settled tail renders in pages: history shouldn't dominate the
  // sidebar, and the common lookups are recent. Expansion resets when the
  // filter context changes so a scope/search flip never inherits a deep
  // page state.
  const [settledVisibleCount, setSettledVisibleCount] = useState(SETTLED_TAIL_INITIAL_COUNT);
  const settledResetKey = projectScopeKey ?? "all";
  const lastSettledResetKeyRef = useRef(settledResetKey);
  if (lastSettledResetKeyRef.current !== settledResetKey) {
    lastSettledResetKeyRef.current = settledResetKey;
    setSettledVisibleCount(SETTLED_TAIL_INITIAL_COUNT);
  }
  const visibleSettledThreads = useMemo(() => {
    if (settledThreads.length <= settledVisibleCount) return settledThreads;
    const visible = settledThreads.slice(0, settledVisibleCount);
    // The open thread must never hide under "Show more": navigating into a
    // deep settled thread (search, deep link) pulls its row into the visible
    // tail so the highlight and the un-settle affordance stay reachable.
    if (routeThreadKey !== null) {
      const routeThread = settledThreads
        .slice(settledVisibleCount)
        .find(
          (thread) =>
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
        );
      if (routeThread !== undefined) visible.push(routeThread);
    }
    return visible;
  }, [routeThreadKey, settledThreads, settledVisibleCount]);
  const hiddenSettledCount = settledThreads.length - visibleSettledThreads.length;
  const showMoreSettled = useCallback(
    () => setSettledVisibleCount((count) => count + SETTLED_TAIL_PAGE_COUNT),
    [],
  );
  const [settledShelfExpanded, setSettledShelfExpanded] = useLocalStorage(
    SETTLED_SHELF_EXPANDED_KEY,
    true,
    Schema.Boolean,
  );
  const toggleSettledShelf = useCallback(
    () => setSettledShelfExpanded((value) => !value),
    [setSettledShelfExpanded],
  );
  const renderedSettledThreads = useMemo(() => {
    if (settledShelfExpanded) return visibleSettledThreads;
    if (routeThreadKey === null) return [];
    const routeThread = visibleSettledThreads.find(
      (thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
    );
    return routeThread === undefined ? [] : [routeThread];
  }, [routeThreadKey, settledShelfExpanded, visibleSettledThreads]);

  // The snoozed shelf is collapsed by default: out of the way, never gone.
  // Collapsed threads don't render (and so don't participate in jump
  // shortcuts or multi-select), matching the settled tail's paging model.
  const [snoozedShelfExpanded, setSnoozedShelfExpanded] = useLocalStorage(
    SNOOZED_SHELF_EXPANDED_KEY,
    false,
    Schema.Boolean,
  );
  const toggleSnoozedShelf = useCallback(
    () => setSnoozedShelfExpanded((value) => !value),
    [setSnoozedShelfExpanded],
  );
  const visibleSnoozedThreads = useMemo(() => {
    if (snoozedShelfExpanded) return snoozedThreads;
    // The open thread must never vanish behind the collapsed shelf: a
    // snoozed thread reached by route (deep link, open before snoozing
    // elsewhere) keeps its row — with highlight and wake affordance — same
    // exception the settled tail's "Show more" makes.
    if (routeThreadKey === null) return [];
    const routeThread = snoozedThreads.find(
      (thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
    );
    return routeThread === undefined ? [] : [routeThread];
  }, [routeThreadKey, snoozedShelfExpanded, snoozedThreads]);

  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  // One section when flat, one per project when grouped: the list below renders
  // this sequence and the keyboard order flattens it, so the two cannot
  // disagree about what order the rows are in.
  //
  // Grouping needs somewhere to lead the eye that the alternatives do not
  // already cover: a scoped sidebar is one project, and so is a sidebar with
  // one project in it, and in both a header would only repeat a label already
  // on screen.
  const activeSections = useMemo(
    () =>
      buildActiveThreadSections({
        threads: activeThreads,
        projectGroups,
        projectRefIndex,
        grouped: groupByProject && projectScopeKey === null && projectGroups.length > 1,
      }),
    [activeThreads, groupByProject, projectGroups, projectRefIndex, projectScopeKey],
  );
  // Collapse filters the paint sequence: a closed group hides its cards, with
  // the open route thread kept visible so a deep link (or a collapse while
  // viewing) cannot bury the row you are on — same exception the snoozed shelf
  // makes. Paint and keyboard order both read this, so they cannot disagree.
  const visibleActiveSections = useMemo(
    () =>
      activeSections.map((section) => {
        const collapsed =
          section.header !== null && collapsedProjectKeys.has(section.header.projectKey);
        return {
          ...section,
          collapsed,
          threads: threadsVisibleInProjectSection({
            threads: section.threads,
            collapsed,
            keepThread: (thread) =>
              routeThreadKey !== null &&
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
          }),
        };
      }),
    [activeSections, collapsedProjectKeys, routeThreadKey],
  );
  // Positional consumers read this: resolveAdjacentThreadId (arrow nav),
  // rangeSelectTo (shift-select) and planForwardNavigation (where you land
  // after settling or snoozing the thread you are viewing). It has to be the
  // order the rows are painted in, or all three address the wrong row. The jump
  // labels are keyed by thread rather than by index, so they cannot
  // misaddress — but they are numbered from this list, so a stale order shows
  // them out of sequence down the screen.
  const orderedActiveThreads = useMemo(
    () => visibleActiveSections.flatMap((section) => section.threads),
    [visibleActiveSections],
  );
  /* fork:end sidebar-v2-project-grouping */
  const orderedThreads = useMemo(
    /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping
       Pinned rows paint first and flat, above the grouped sections; the rest is
       the grouped paint order, so keyboard order and paint order stay one list. */
    () => [
      ...pinnedThreads,
      ...orderedActiveThreads,
      ...visibleSnoozedThreads,
      ...renderedSettledThreads,
    ],
    [pinnedThreads, orderedActiveThreads, visibleSnoozedThreads, renderedSettledThreads],
    /* fork:end sidebar-v2-project-grouping */
  );
  const orderedThreadKeys = useMemo(
    () =>
      orderedThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    [orderedThreads],
  );
  // Rows call back into the click handler without carrying the ordered list as
  // a prop — a fresh array identity per shell update would defeat every row's
  // memoization. The ref keeps shift-range-select working against the list as
  // rendered at click time.
  const orderedThreadKeysRef = useRef(orderedThreadKeys);
  orderedThreadKeysRef.current = orderedThreadKeys;
  const threadByKey = useMemo(
    () =>
      new Map(
        orderedThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [orderedThreads],
  );
  // Handlers read these through refs: depending on per-update Map/Set
  // identities would give every row a fresh callback prop on each shell
  // event and defeat row memoization during streaming.
  const threadByKeyRef = useRef(threadByKey);
  threadByKeyRef.current = threadByKey;
  // handleNewThread is inherently unstable (depends on the projects list);
  // a ref keeps it out of attemptSettle's dependency array.
  const handleNewThreadRef = useRef(newThreadContext.handleNewThread);
  handleNewThreadRef.current = newThreadContext.handleNewThread;
  const settledThreadKeys = useMemo(
    () =>
      new Set(
        settledThreads.map((thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        ),
      ),
    [settledThreads],
  );
  const settledThreadKeysRef = useRef(settledThreadKeys);
  settledThreadKeysRef.current = settledThreadKeys;
  const snoozedThreadKeys = useMemo(
    () =>
      new Set(
        snoozedThreads.map((thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        ),
      ),
    [snoozedThreads],
  );
  const snoozedThreadKeysRef = useRef(snoozedThreadKeys);
  snoozedThreadKeysRef.current = snoozedThreadKeys;

  const jumpLabelByKey = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const [index, threadKey] of orderedThreadKeys.entries()) {
      const jumpCommand = threadJumpCommandForIndex(index);
      if (!jumpCommand) break;
      const label = shortcutLabelForCommand(keybindings, jumpCommand);
      if (label) mapping.set(threadKey, label);
    }
    return mapping;
  }, [keybindings, orderedThreadKeys]);
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();

  // Settled threads are live shells, so opening one is plain navigation:
  // history stays readable without un-settling, and sending a message or
  // starting a session un-settles server-side.
  const navigateToThread = useCallback(
    async (threadRef: ScopedThreadRef, opts?: { readonly replace?: boolean }) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
      const draftId = draftIdByThreadKeyRef.current.get(scopedThreadKey(threadRef));
      if (draftId) {
        await router.navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(draftId),
          ...(opts?.replace === true ? { replace: true } : null),
        });
        return;
      }
      /* fork:end sidebar-v2-draft-rows */
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        ...(opts?.replace === true ? { replace: true } : null),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const startThreadRename = useCallback((threadRef: ScopedThreadRef, title: string) => {
    /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
    // Drafts are client-only until the first send; there is no server title
    // to rename, and the painted label is fixed ("New thread").
    if (draftIdByThreadKeyRef.current.has(scopedThreadKey(threadRef))) return;
    /* fork:end sidebar-v2-draft-rows */
    setRenamingThreadKey(scopedThreadKey(threadRef));
    setRenamingTitle(title);
  }, []);
  const cancelThreadRename = useCallback(() => setRenamingThreadKey(null), []);
  const commitThreadRename = useCallback(
    (threadRef: ScopedThreadRef, title: string, originalTitle: string) => {
      void (async () => {
        const trimmed = title.trim();
        setRenamingThreadKey(null);
        if (trimmed.length === 0) {
          toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
          return;
        }
        if (trimmed === originalTitle) return;
        const result = await updateThreadMetadata({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, title: trimmed },
        });
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to rename thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [updateThreadMetadata],
  );

  const handleThreadClick = useCallback(
    (event: ReactMouseEvent, threadRef: ScopedThreadRef) => {
      if (isSidebarNestedLinkClick(event.target)) return;
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const threadKey = scopedThreadKey(threadRef);
      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        rangeSelectTo(threadKey, orderedThreadKeysRef.current);
        return;
      }
      if (isTrailingDoubleClick(event.detail)) {
        return;
      }
      navigateToThread(threadRef);
    },
    [navigateToThread, rangeSelectTo, toggleThreadSelection],
  );

  // A settle per thread at a time: double clicks and repeated menu picks
  // must not dispatch a second settle that fails and toasts a false error.
  const settlingThreadKeysRef = useRef(new Set<string>());
  // Parking the thread you're looking at (settle or snooze) moves you
  // forward: the next remaining card (never a settled or snoozed row, never
  // one leaving in the same batch), or a fresh draft in this project when it
  // was the last active one. Callers snapshot the plan BEFORE the command
  // mutates the partition; background parks never navigate (null plan).
  const planForwardNavigation = useCallback(
    (threadKey: string, coParkingKeys?: ReadonlySet<string>): (() => void) | null => {
      if (routeThreadKeyRef.current !== threadKey) return null;
      const shell = threadByKeyRef.current.get(threadKey);
      const orderedKeys = orderedThreadKeysRef.current;
      const settledKeys = settledThreadKeysRef.current;
      const snoozedKeys = snoozedThreadKeysRef.current;
      const currentIndex = orderedKeys.indexOf(threadKey);
      const nextCardKey =
        currentIndex === -1
          ? null
          : ([...orderedKeys.slice(currentIndex + 1), ...orderedKeys.slice(0, currentIndex)].find(
              (key) => !settledKeys.has(key) && !snoozedKeys.has(key) && !coParkingKeys?.has(key),
            ) ?? null);
      const nextThread = nextCardKey ? threadByKeyRef.current.get(nextCardKey) : null;
      return nextThread
        ? () => navigateToThread(scopeThreadRef(nextThread.environmentId, nextThread.id))
        : shell
          ? () =>
              void handleNewThreadRef.current(scopeProjectRef(shell.environmentId, shell.projectId))
          : () => void router.navigate({ to: "/" });
    },
    [navigateToThread, router],
  );

  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
  // Discard must not reuse planForwardNavigation: that helper's last-card
  // fallback spawns a fresh draft (correct for settle, wrong here). Neighbor
  // pick lives in pickDiscardNeighborKey; navigation reuses navigateToThread
  // with replace. Await then clear — sync clear while still on /draft/$id
  // races the missing-session redirect into a fresh draft.
  const discardDraftThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      void (async () => {
        const threadKey = scopedThreadKey(threadRef);
        const draftId = draftIdByThreadKeyRef.current.get(threadKey);
        if (!draftId) return;

        if (routeThreadKeyRef.current === threadKey) {
          const targetKey = pickDiscardNeighborKey({
            orderedKeys: orderedThreadKeysRef.current,
            currentKey: threadKey,
          });
          const nextThread = targetKey ? threadByKeyRef.current.get(targetKey) : null;
          if (nextThread) {
            await navigateToThread(scopeThreadRef(nextThread.environmentId, nextThread.id), {
              replace: true,
            });
          } else {
            await router.navigate({ to: "/", replace: true });
          }
        }

        releaseComposerDraftUploads(draftId);

        useComposerDraftStore.getState().clearDraftThread(draftId);
      })();
    },
    [navigateToThread, router],
  );
  /* fork:end sidebar-v2-draft-rows */

  const attemptSettle = useCallback(
    (threadRef: ScopedThreadRef, opts: { coSettlingKeys?: ReadonlySet<string> } = {}) => {
      void (async () => {
        const threadKey = scopedThreadKey(threadRef);
        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
        if (draftIdByThreadKeyRef.current.has(threadKey)) return;
        /* fork:end sidebar-v2-draft-rows */
        if (settlingThreadKeysRef.current.has(threadKey)) return;
        settlingThreadKeysRef.current.add(threadKey);
        try {
          const navigateAfterSettle = planForwardNavigation(threadKey, opts.coSettlingKeys);
          const result = await settleThread(threadRef);
          if (result._tag === "Failure") {
            // Never navigate away from a thread that did not settle.
            if (!isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to settle thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
            return;
          }
          // Only move forward if the user is still on the settled thread —
          // a navigation made during the await wins over ours.
          if (routeThreadKeyRef.current === threadKey) {
            navigateAfterSettle?.();
          }
        } finally {
          settlingThreadKeysRef.current.delete(threadKey);
        }
      })();
    },
    [planForwardNavigation, settleThread],
  );
  const attemptUnsettle = useCallback(
    (threadRef: ScopedThreadRef) => {
      void (async () => {
        const result = await unsettleThread(threadRef);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to un-settle thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [unsettleThread],
  );
  const attemptUnsnooze = useCallback(
    (threadRef: ScopedThreadRef) => {
      void (async () => {
        const result = await unsnoozeThread(threadRef);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to wake thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [unsnoozeThread],
  );
  // Drag-to-reorder for the pinned block. A drop computes ONE fractional key
  // for the moved thread and sends it to that thread's own server (see
  // planPinnedReorder for the keyless-neighbor materialization case, which
  // instead rewrites every key in the section). The optimistic order keeps
  // the card where it was dropped until EVERY key the drop wrote is
  // reflected in canonical state — a section rewrite is several sequential
  // writes, and releasing on the first landed key would expose the
  // half-written canonical order, reshuffling the block once per write.
  // A failed write clears the override (the card snaps back) with a toast.
  // A key we did NOT write landing (a concurrent client's reorder that must
  // win) and ANY membership change (new pin, unpin, snooze/wake) also
  // release it: the override can't say where members it never saw belong,
  // and holding it would launder a stale order into later drags.
  const pinnedDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [optimisticPinnedOrder, setOptimisticPinnedOrder] = useState<{
    readonly order: readonly string[];
    /** pinOrderKey per thread as of the drop — the baseline that tells a
        concurrent client's write apart from one of our own landing. */
    readonly keysAtDrop: ReadonlyMap<string, string | null>;
    /** The keys this drop writes (one per planned assignment). The
        override holds until all of them appear in canonical state. */
    readonly assignedKeys: ReadonlyMap<string, string>;
  } | null>(null);
  const orderedPinnedThreads = useMemo(() => {
    if (optimisticPinnedOrder === null) return pinnedThreads;
    return orderItemsByPreferredIds({
      items: pinnedThreads,
      preferredIds: optimisticPinnedOrder.order,
      getId: (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    });
  }, [optimisticPinnedOrder, pinnedThreads]);
  useEffect(() => {
    if (optimisticPinnedOrder === null) return;
    const canonical = pinnedThreads.filter((thread) =>
      reorderablePinnedKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
    );
    const canonicalKeys = canonical.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    );
    // The override represents one drop against one snapshot of the world.
    // Release it when the world moves on: membership changed (pin/unpin/
    // snooze/wake — the override can't say where members it never saw
    // belong), a key changed to something we did NOT write (a concurrent
    // client's reorder that must win), every key we wrote has landed, or
    // canonical already matches. Releasing on the FIRST landed key instead
    // of the last exposes the half-written order mid-materialization and
    // the block visibly reshuffles once per write.
    const membershipChanged =
      canonicalKeys.length !== optimisticPinnedOrder.order.length ||
      canonicalKeys.some((key) => !optimisticPinnedOrder.order.includes(key));
    const foreignKeyLanded = canonical.some((thread, index) => {
      const threadKey = canonicalKeys[index]!;
      const currentKey = thread.pinOrderKey ?? null;
      if (currentKey === optimisticPinnedOrder.keysAtDrop.get(threadKey)) return false;
      return currentKey !== optimisticPinnedOrder.assignedKeys.get(threadKey);
    });
    const currentKeyByThreadKey = new Map(
      canonical.map((thread, index) => [canonicalKeys[index]!, thread.pinOrderKey ?? null]),
    );
    const allAssignmentsLanded = [...optimisticPinnedOrder.assignedKeys].every(
      ([threadKey, orderKey]) => currentKeyByThreadKey.get(threadKey) === orderKey,
    );
    const orderConfirmed =
      !membershipChanged &&
      canonicalKeys.every((key, index) => key === optimisticPinnedOrder.order[index]);
    if (membershipChanged || foreignKeyLanded || allAssignmentsLanded || orderConfirmed) {
      setOptimisticPinnedOrder(null);
    }
  }, [optimisticPinnedOrder, pinnedThreads, reorderablePinnedKeys]);
  const attemptPin = useCallback(
    (threadRef: ScopedThreadRef) => {
      void (async () => {
        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
        // Drafts are not on the server yet — same belt-and-braces check the
        // settle/snooze attempts carry.
        if (draftIdByThreadKeyRef.current.has(scopedThreadKey(threadRef))) return;
        /* fork:end sidebar-v2-draft-rows */
        const result = await pinThread(threadRef);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to pin thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [pinThread],
  );
  const attemptUnpin = useCallback(
    (threadRef: ScopedThreadRef) => {
      void (async () => {
        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
        if (draftIdByThreadKeyRef.current.has(scopedThreadKey(threadRef))) return;
        /* fork:end sidebar-v2-draft-rows */
        const result = await confirmAndUnpinThread(threadRef);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to unpin thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [confirmAndUnpinThread],
  );

  const handlePinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeKey = String(event.active.id);
      const overKey = event.over === null ? null : String(event.over.id);
      if (overKey === null || activeKey === overKey) return;
      const reorderable = orderedPinnedThreads.filter((thread) =>
        reorderablePinnedKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
      );
      const keys = reorderable.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      const fromIndex = keys.indexOf(activeKey);
      const toIndex = keys.indexOf(overKey);
      if (fromIndex === -1 || toIndex === -1) return;
      const newOrder = arrayMove([...keys], fromIndex, toIndex);
      const threadByKey = new Map(reorderable.map((thread, index) => [keys[index]!, thread]));
      const keysAtDrop = new Map(
        reorderable.map((thread, index) => [keys[index]!, thread.pinOrderKey ?? null]),
      );
      const assignments = planPinnedReorder({
        orderedIds: newOrder,
        keysById: keysAtDrop,
        movedId: activeKey,
      });
      if (assignments.length === 0) return;
      setOptimisticPinnedOrder({
        order: newOrder,
        keysAtDrop,
        assignedKeys: new Map(
          assignments.map((assignment) => [assignment.id, assignment.orderKey]),
        ),
      });
      void (async () => {
        // Sequential, stop on first failure. There is deliberately no
        // rollback: every key write is a complete, valid placement on its
        // own, so a partial materialization leaves a sensible order (and
        // the next drag repairs the rest) — unwinding writes across
        // servers would trade that for real inconsistency windows.
        for (const assignment of assignments) {
          const thread = threadByKey.get(assignment.id);
          if (thread === undefined) continue;
          const result = await reorderPinnedThread(
            scopeThreadRef(thread.environmentId, thread.id),
            assignment.orderKey,
          );
          if (result._tag === "Failure") {
            // Any failure — interrupted included — releases the override:
            // a key that never lands would otherwise hold it until some
            // unrelated world change came along.
            setOptimisticPinnedOrder(null);
            if (isAtomCommandInterrupted(result)) return;
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to reorder pinned threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
            return;
          }
        }
      })();
    },
    [orderedPinnedThreads, reorderPinnedThread, reorderablePinnedKeys],
  );
  // One snooze per thread at a time — same double-dispatch guard as settle.
  const snoozingThreadKeysRef = useRef(new Set<string>());
  const performSnooze = useCallback(
    async (
      threadRef: ScopedThreadRef,
      preset: SnoozePreset,
      opts: { coSnoozingKeys?: ReadonlySet<string> } = {},
    ) => {
      const threadKey = scopedThreadKey(threadRef);
      /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
      if (draftIdByThreadKeyRef.current.has(threadKey)) {
        return { status: "skipped" } as const;
      }
      /* fork:end sidebar-v2-draft-rows */
      if (snoozingThreadKeysRef.current.has(threadKey)) {
        return { status: "skipped" } as const;
      }
      snoozingThreadKeysRef.current.add(threadKey);
      try {
        // Snoozing the open thread moves you forward, same as settle —
        // both park the thread you're done with for now.
        const navigateAfterSnooze = planForwardNavigation(threadKey, opts.coSnoozingKeys);
        const result = await snoozeThread(threadRef, preset.snoozedUntil);
        if (result._tag === "Failure") {
          // Never navigate away from a thread that did not snooze.
          return isAtomCommandInterrupted(result)
            ? ({ status: "interrupted" } as const)
            : ({ status: "failure", error: squashAtomCommandFailure(result) } as const);
        }
        // Only move forward if the user is still on the snoozed thread —
        // a navigation made during the await wins over ours.
        if (routeThreadKeyRef.current === threadKey) {
          navigateAfterSnooze?.();
        }
        return { status: "success" } as const;
      } finally {
        snoozingThreadKeysRef.current.delete(threadKey);
      }
    },
    [planForwardNavigation, snoozeThread],
  );
  const attemptSnooze = useCallback(
    (
      threadRef: ScopedThreadRef,
      preset: SnoozePreset,
      opts: { coSnoozingKeys?: ReadonlySet<string> } = {},
    ) => {
      void (async () => {
        const outcome = await performSnooze(threadRef, preset, opts);
        if (outcome.status === "failure") {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to snooze thread",
              description:
                outcome.error instanceof Error ? outcome.error.message : "An error occurred.",
            }),
          );
          return;
        }
        if (outcome.status !== "success") return;
        // Snooze hides the row, so the toast is the only confirmation —
        // and the Undo is the escape hatch for a mis-click.
        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Snoozed until ${snoozeWakeDescription(preset.snoozedUntil, new Date(), timestampFormat)}`,
            timeout: 5_000,
            actionProps: {
              children: "Undo",
              onClick: () => attemptUnsnooze(threadRef),
            },
          }),
        );
      })();
    },
    [attemptUnsnooze, performSnooze, timestampFormat],
  );

  const removeFromSelection = useThreadSelectionStore((s) => s.removeFromSelection);
  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      // One exact actionable set: keys whose rows are actually rendered
      // right now. Selections can outlive their rows (settled-tail paging,
      // thread deletion elsewhere) and the menu labels must count only what
      // the actions will touch.
      const threadKeys = sidebarServerActionThreadKeys({
        selectedThreadKeys: useThreadSelectionStore.getState().selectedThreadKeys,
        hasRenderedRow: (threadKey) => threadByKeyRef.current.has(threadKey),
        isDraft: (threadKey) => draftIdByThreadKeyRef.current.has(threadKey),
      });
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;
      // Snooze (N) is offered when every selected thread can actually take
      // it — a mixed selection with blocked-on-you work would half-apply.
      const selectionNow = new Date();
      const selectedThreads = threadKeys.flatMap((threadKey) => {
        const thread = threadByKeyRef.current.get(threadKey);
        return thread ? [thread] : [];
      });
      const canSnoozeSelection = selectedThreads.every(
        (thread) =>
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSnooze === true &&
          canSnooze(thread, { now: selectionNow.toISOString() }),
      );
      const titleRegenerationThreads = selectedThreads.filter(
        (thread) =>
          serverConfigs.get(thread.environmentId)?.environment.capabilities
            .threadTitleRegeneration === true,
      );
      const regeneratableTitleThreads = titleRegenerationThreads.filter(
        (thread) => thread.titleRegeneration == null,
      );
      const titleRegenerationMenuItem = buildBulkTitleRegenerationContextMenuItem({
        supportedCount: titleRegenerationThreads.length,
        actionableCount: regeneratableTitleThreads.length,
      });
      const snoozePresets = resolveSnoozePresets(new Date(), timestampFormat);
      const clicked = await settlePromise(() =>
        api.contextMenu.show(
          [
            { id: "settle", label: `Settle (${count})` },
            ...(canSnoozeSelection
              ? [
                  {
                    id: "snooze",
                    label: `Snooze (${count})`,
                    children: snoozePresets.map((preset) => ({
                      id: `snooze:${preset.id}`,
                      label: `${preset.label} (${preset.whenLabel})`,
                    })),
                  },
                ]
              : []),
            ...(titleRegenerationMenuItem ? [titleRegenerationMenuItem] : []),
            { id: "mark-unread", label: `Mark unread (${count})` },
            { id: "delete", label: `Delete (${count})`, destructive: true },
          ],
          position,
        ),
      );
      if (clicked._tag === "Failure") return;
      if (clicked.value?.startsWith("snooze:")) {
        const preset = snoozePresets.find(
          (candidate) => `snooze:${candidate.id}` === clicked.value,
        );
        if (preset) {
          // Post-snooze navigation must skip threads snoozing in this same
          // batch — they are all leaving the card block together.
          const coSnoozingKeys = new Set(threadKeys);
          clearSelection();
          const outcomes = await Promise.all(
            selectedThreads.map(async (thread) => {
              const threadRef = scopeThreadRef(thread.environmentId, thread.id);
              const outcome = await performSnooze(threadRef, preset, { coSnoozingKeys });
              return { outcome, threadRef };
            }),
          );
          const snoozedThreadRefs = outcomes.flatMap(({ outcome, threadRef }) =>
            outcome.status === "success" ? [threadRef] : [],
          );
          const failures = outcomes.flatMap(({ outcome }) =>
            outcome.status === "failure" ? [outcome.error] : [],
          );

          if (snoozedThreadRefs.length > 0) {
            const snoozedCount = snoozedThreadRefs.length;
            const failedCount = failures.length;
            toastManager.add(
              stackedThreadToast({
                type: failedCount > 0 ? "warning" : "success",
                title:
                  failedCount > 0
                    ? `Snoozed ${snoozedCount} of ${selectedThreads.length} threads`
                    : `Snoozed ${snoozedCount} thread${snoozedCount === 1 ? "" : "s"}`,
                description:
                  failedCount > 0
                    ? `${failedCount} thread${failedCount === 1 ? "" : "s"} couldn't be snoozed.`
                    : undefined,
                timeout: 5_000,
                actionProps: {
                  children: "Undo",
                  onClick: () => {
                    for (const threadRef of snoozedThreadRefs) attemptUnsnooze(threadRef);
                  },
                },
              }),
            );
          } else if (failures.length > 0) {
            const firstError = failures[0];
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to snooze threads",
                description:
                  firstError instanceof Error ? firstError.message : "An error occurred.",
              }),
            );
          }
        }
        return;
      }
      if (clicked.value === "regenerate-title") {
        for (const thread of regeneratableTitleThreads) {
          const result = await updateThreadMetadata({
            environmentId: thread.environmentId,
            input: { threadId: thread.id, regenerateTitle: true },
          });
          if (result._tag === "Success") continue;
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to regenerate thread titles",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        clearSelection();
        return;
      }
      if (clicked.value === "settle") {
        // Post-settle navigation must skip threads settling in this same
        // batch — they are all leaving the card block together. Rows that
        // are already explicitly settled are skipped: nothing to do on a
        // valid mixed selection. Pinned rows ARE included: the decider
        // clears the pin as part of settling, so they park like the rest.
        const coSettlingKeys = new Set(threadKeys);
        for (const threadKey of threadKeys) {
          const thread = threadByKeyRef.current.get(threadKey);
          if (!thread || thread.settledOverride === "settled") continue;
          attemptSettle(scopeThreadRef(thread.environmentId, thread.id), { coSettlingKeys });
        }
        clearSelection();
        return;
      }
      if (clicked.value === "mark-unread") {
        for (const threadKey of threadKeys) {
          const thread = threadByKeyRef.current.get(threadKey);
          markThreadUnread(threadKey, thread?.latestTurn?.completedAt);
        }
        clearSelection();
        return;
      }
      if (clicked.value !== "delete") return;
      if (confirmThreadDelete) {
        const confirmed = await settlePromise(() =>
          api.dialogs.confirm(
            [
              `Delete ${count} thread${count === 1 ? "" : "s"}?`,
              "This permanently clears conversation history for these threads.",
            ].join("\n"),
            { variant: "destructive" },
          ),
        );
        if (confirmed._tag === "Failure" || !confirmed.value) return;
      }
      // Grown as deletions actually land, never seeded with the whole batch:
      // orphaned-worktree detection must only discount threads that are
      // really gone, or the first delete would treat still-alive batch mates
      // as deleted and remove a worktree they still point at.
      const deletedThreadKeys = new Set<string>();
      for (const threadKey of threadKeys) {
        const thread = threadByKeyRef.current.get(threadKey);
        if (!thread) continue;
        const result = await deleteThread(scopeThreadRef(thread.environmentId, thread.id), {
          deletedThreadKeys,
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to delete threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        deletedThreadKeys.add(threadKey);
      }
      removeFromSelection(threadKeys);
    },
    [
      attemptSettle,
      attemptSnooze,
      clearSelection,
      confirmThreadDelete,
      deleteThread,
      markThreadUnread,
      performSnooze,
      removeFromSelection,
      serverConfigs,
      attemptUnsnooze,
      updateThreadMetadata,
      timestampFormat,
    ],
  );

  const handleThreadContextMenu = useCallback(
    (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const threadKey = scopedThreadKey(threadRef);
        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
        if (draftIdByThreadKeyRef.current.has(threadKey)) {
          const clicked = await settlePromise(() =>
            api.contextMenu.show(
              [{ id: "discard-draft", label: "Discard draft", destructive: true, icon: "trash" }],
              position,
            ),
          );
          if (clicked._tag === "Failure" || clicked.value !== "discard-draft") return;
          discardDraftThread(threadRef);
          return;
        }
        /* fork:end sidebar-v2-draft-rows */
        const selectionState = useThreadSelectionStore.getState();
        if (selectionState.hasSelection() && selectionState.selectedThreadKeys.has(threadKey)) {
          await handleMultiSelectContextMenu(position);
          return;
        }
        const thread = threadByKeyRef.current.get(threadKey);
        if (!thread) return;
        const threadWorkspacePath =
          thread.worktreePath ??
          projectCwdByKey.get(`${thread.environmentId}:${thread.projectId}`) ??
          null;
        // Un-settle pins the thread active until real activity clears the pin.
        // Environments without
        // the settlement capability get no lifecycle items at all.
        const supportsSettlement =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSettlement ===
          true;
        const supportsSnooze =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSnooze === true;
        const supportsPinning =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadPinning === true;
        const supportsTitleRegeneration =
          serverConfigs.get(thread.environmentId)?.environment.capabilities
            .threadTitleRegeneration === true;
        const isRegeneratingTitle = thread.titleRegeneration != null;
        const isSettled = settledThreadKeysRef.current.has(threadKey);
        const isSnoozed = snoozedThreadKeysRef.current.has(threadKey);
        const isPinned = thread.pinnedAt != null;
        // Presets resolve at menu-open time (same as the popover).
        const snoozePresets = resolveSnoozePresets(new Date(), timestampFormat);
        const clicked = await settlePromise(() =>
          api.contextMenu.show(
            buildThreadActionMenuItems({
              branch: thread.branch ?? null,
              isPinned,
              isSettled,
              isSnoozed,
              canSnoozeNow: canSnooze(thread, { now: new Date().toISOString() }),
              isRegeneratingTitle,
              isRunning:
                thread.session?.status === "running" && thread.session.activeTurnId != null,
              supports: {
                settlement: supportsSettlement,
                snooze: supportsSnooze,
                pinning: supportsPinning,
                titleRegeneration: supportsTitleRegeneration,
              },
              snoozePresets,
            }),
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value?.startsWith("snooze:")) {
          const preset = snoozePresets.find(
            (candidate) => `snooze:${candidate.id}` === clicked.value,
          );
          if (preset) attemptSnooze(threadRef, preset);
          return;
        }
        switch (clicked.value) {
          case "project-settings": {
            const projectGroup = projectGroupsRef.current.find((group) =>
              group.memberProjectRefs.some(
                (projectRef) =>
                  projectRef.environmentId === thread.environmentId &&
                  projectRef.projectId === thread.projectId,
              ),
            );
            if (projectGroup) openProjectSettings(projectGroup);
            return;
          }
          case "new-thread-on-branch": {
            // Explicit branch carry-over: reuse the thread's worktree when it
            // has one, otherwise its branch on the local checkout.
            const result = await settlePromise(() =>
              handleNewThreadRef.current(scopeProjectRef(thread.environmentId, thread.projectId), {
                branch: thread.branch,
                worktreePath: thread.worktreePath,
                envMode: thread.worktreePath ? "worktree" : "local",
                startFromOrigin: false,
              }),
            );
            if (result._tag === "Failure") {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Could not create thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
            return;
          }
          case "settle":
            attemptSettle(threadRef);
            return;
          case "unsettle":
            attemptUnsettle(threadRef);
            return;
          case "unsnooze":
            attemptUnsnooze(threadRef);
            return;
          case "pin":
            attemptPin(threadRef);
            return;
          case "unpin":
            attemptUnpin(threadRef);
            return;
          case "rename":
            startThreadRename(threadRef, thread.title);
            return;
          case "regenerate-title": {
            if (isRegeneratingTitle) return;
            const result = await updateThreadMetadata({
              environmentId: threadRef.environmentId,
              input: { threadId: threadRef.threadId, regenerateTitle: true },
            });
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to regenerate thread title",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
            return;
          }
          case "mark-unread":
            markThreadUnread(threadKey, thread.latestTurn?.completedAt);
            return;
          case "copy-path":
            if (!threadWorkspacePath) {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Path unavailable",
                  description: "This thread does not have a workspace path to copy.",
                }),
              );
              return;
            }
            copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
            return;
          case "copy-branch":
            if (thread.branch) {
              copyBranchToClipboard(thread.branch, { branch: thread.branch });
            }
            return;
          case "copy-thread-id":
            copyThreadIdToClipboard(thread.id, { threadId: thread.id });
            return;
          case "archive": {
            if (confirmThreadArchive) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(`Archive thread "${thread.title}"?`),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            let didArchive = false;
            const result = await archiveThread(threadRef, {
              onArchived: () => {
                didArchive = true;
              },
            });
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: didArchive
                    ? "Thread archived, but navigation failed"
                    : "Failed to archive thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
              return;
            }
            return;
          }
          case "delete": {
            if (confirmThreadDelete) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(
                  [
                    `Delete thread "${thread.title}"?`,
                    "This permanently clears conversation history for this thread.",
                  ].join("\n"),
                  { variant: "destructive" },
                ),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            const result = await deleteThread(threadRef);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to delete thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
              return;
            }
            return;
          }
          default:
            return;
        }
      })();
    },
    [
      archiveThread,
      attemptPin,
      attemptSettle,
      attemptSnooze,
      attemptUnpin,
      attemptUnsettle,
      attemptUnsnooze,
      confirmThreadArchive,
      /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
      discardDraftThread,
      /* fork:end sidebar-v2-draft-rows */
      confirmThreadDelete,
      copyBranchToClipboard,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      handleMultiSelectContextMenu,
      markThreadUnread,
      openProjectSettings,
      projectCwdByKey,
      serverConfigs,
      startThreadRename,
      updateThreadMetadata,
      timestampFormat,
    ],
  );

  // Thread jump (cmd+1..9) and prev/next traversal reuse the same commands as
  // v1 — the keybinding layer is shared, only the ordered list differs.
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeTerminalOpen,
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      const navigateToThreadKey = (targetThreadKey: string | null) => {
        if (!targetThreadKey) return false;
        const targetThread = threadByKey.get(targetThreadKey);
        if (!targetThread) return false;
        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return true;
      };
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        navigateToThreadKey(
          resolveAdjacentThreadId({
            threadIds: orderedThreadKeys,
            currentThreadId: routeThreadKey,
            direction: traversalDirection,
          }),
        );
        return;
      }
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) return;
      navigateToThreadKey(orderedThreadKeys[jumpIndex] ?? null);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    keybindings,
    navigateToThread,
    orderedThreadKeys,
    routeTerminalOpen,
    routeThreadKey,
    threadByKey,
  ]);

  // Same predicate as v1: hints show only while the held modifiers exactly
  // match a thread-jump binding. Adding Shift (screenshots) or Alt no
  // longer matches ⌘1..9, so the overlay hides for chords like ⌘⇧4.
  const shortcutModifiers = useShortcutModifierState();
  const terminalFocused = useTerminalFocus();
  const shouldShowJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform: navigator.platform,
      context: {
        terminalFocus: terminalFocused,
        terminalOpen: routeTerminalOpen,
        modelPickerOpen: isModelPickerOpen(),
      },
    },
  );
  useEffect(() => {
    updateThreadJumpHintsVisibility(shouldShowJumpHintsNow);
  }, [shouldShowJumpHintsNow, updateThreadJumpHintsVisibility]);

  const attachListAutoAnimateRef = useCallback((node: HTMLUListElement | null) => {
    if (!node) return;
    /* fork:begin sidebar-v2-list-animation — see .fork/customizations.yaml#sidebar-v2-list-animation */
    // Default AutoAnimate inserts hold at opacity 0 for half of a 1.5×
    // ease-in; removals keep the short ease-out. Expanding a project group
    // then feels unlike collapsing it. The plugin makes add the reverse of
    // remove so both directions share duration, easing, and scale/opacity.
    autoAnimate(node, sidebarV2ListAnimation);
    /* fork:end sidebar-v2-list-animation */
  }, []);

  // New thread defaults to the project you're in (active thread's project,
  // falling back to the top project) — same resolution the command palette
  // uses. The command palette already offers a "New thread in..." submenu
  // for multi-project setups.
  const handleNewThreadClick = useCallback(
    (event?: ReactMouseEvent) => {
      // One project: nothing to pick, create immediately. Shift+click creates
      // directly in the current project even with several projects, skipping
      // the palette picker.
      if (shouldCreateNewThreadInCurrentProject(event?.shiftKey ?? false, projectGroups.length)) {
        if (isMobile) setOpenMobile(false);
        void startNewThreadFromContext({
          activeDraftThread: newThreadContext.activeDraftThread,
          activeThread: newThreadContext.activeThread ?? undefined,
          defaultProjectRef: newThreadContext.defaultProjectRef,
          handleNewThread: newThreadContext.handleNewThread,
        });
        return;
      }
      if (isMobile) setOpenMobile(false);
      openCommandPalette({ open: "new-thread-in" });
    },
    [isMobile, newThreadContext, projectGroups.length, setOpenMobile],
  );

  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
  // The header's plus. The chrome row's "New thread" has to ask which project
  // when there are several — that is the "new-thread-in" palette above. A
  // grouped header has already answered it: the run of cards under it IS the
  // project, so the button starts there and skips the picker.
  //
  // Which environment it lands in is buildSidebarProjectPickerEntries' answer,
  // reached by calling it rather than by restating it. A logical project can
  // span environments, and that function prefers the member matching the thread
  // you are looking at, falling back to the group's canonical ref. An earlier
  // revision took the canonical ref directly and claimed in a comment that this
  // agreed with the palette; it does not. Reading a remote thread of a project
  // that also has a local member, the palette starts remote and the shortcut
  // would have started local — the same name on screen, two environments. Two
  // ways to open the same door must not disagree about which room they enter,
  // and a shared derivation is the only version of that which cannot rot.
  const handleNewThreadInProject = useCallback(
    (projectKey: string) => {
      const group = projectGroups.find((candidate) => candidate.projectKey === projectKey);
      if (!group) return;
      const [entry] = buildSidebarProjectPickerEntries({
        groups: [group],
        preferredProjectRef: resolveThreadActionProjectRef({
          activeDraftThread: newThreadContext.activeDraftThread,
          activeThread: newThreadContext.activeThread ?? undefined,
          defaultProjectRef: newThreadContext.defaultProjectRef,
          handleNewThread: newThreadContext.handleNewThread,
        }),
      });
      if (!entry) return;
      if (isMobile) setOpenMobile(false);
      void newThreadContext.handleNewThread(
        scopeProjectRef(entry.targetProject.environmentId, entry.targetProject.id),
      );
    },
    [isMobile, newThreadContext, projectGroups, setOpenMobile],
  );
  /* fork:end sidebar-v2-project-grouping */

  // The button mirrors chat.new: in multi-project setups both route through
  // the command palette's "New thread in..." picker, and in single-project
  // setups both create immediately. In multi-project setups the label is only
  // the picker's shortcut: falling back to chat.newLocal would advertise the
  // same shortcut for both the picker and direct create. In single-project
  // setups both commands create directly, so chat.newLocal is a valid
  // fallback. The second tooltip line (multi-project only) advertises
  // shift+click and its keyboard twin chat.newLocal for direct create.
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.new") ??
    (projectGroups.length <= 1 ? shortcutLabelForCommand(keybindings, "chat.newLocal") : undefined);
  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
     The chrome rows' Search is a CommandDialogTrigger, so it advertises the
     palette shortcut. */
  const commandPaletteShortcutLabel = shortcutLabelForCommand(keybindings, "commandPalette.toggle");
  /* fork:end fork-sidebar-chrome */
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="gap-0">
        {/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
            Control rows are fork-owned; only these call sites live here.
            See custom/SidebarV2ChromeRows.tsx. */}
        <SidebarV2ChromeActionRows
          commandPaletteShortcutLabel={commandPaletteShortcutLabel}
          newThreadShortcutLabel={newThreadShortcutLabel ?? null}
          newThreadDisabled={projects.length === 0}
          onNewThread={handleNewThreadClick}
          onAddProject={openAddProjectCommandPalette}
        />
        <SidebarV2ProjectScopeRow
          projectGroups={projectGroups}
          projectScopeKey={projectScopeKey}
          scopedProjectDisplayName={scopedProjectGroup?.displayName ?? null}
          onProjectScopeChange={setProjectScopeKey}
          menuOpen={projectScopeMenuState.open}
          onMenuOpenChange={(open) => dispatchProjectScopeMenu({ type: "open-changed", open })}
          onProjectActions={(event, project) => {
            void handleProjectSettings(event, project);
          }}
          groupByProject={groupByProject}
          onGroupByProjectChange={setGroupByProject}
          // A switch that visibly does nothing teaches nothing. Where headers
          // are suppressed — one project on screen, by scope or by having only
          // one — it says so instead of quietly ignoring the click.
          groupByProjectUnavailableReason={
            projectScopeKey !== null
              ? "Grouping applies when the sidebar shows more than one project"
              : projectGroups.length <= 1
                ? "Grouping applies once you have more than one project"
                : null
          }
        />
        {/* fork:end fork-sidebar-chrome */}
        {/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
            The list's two sides are padded to look equal, not to measure
            equal. scrollbar-gutter:stable reserves the scrollbar inside this
            padding box, so a symmetric px-2 spends 8px on the left and 8 plus
            the scrollbar on the right (Figma 113:3718 list `px-8`). The end
            padding gives that width back; the gutter still holds, so the
            scrollbar keeps its lane and the cards are 8px from both edges.

            One source for the 8: both sides read --sidebar-list-pad, so
            retuning the start padding cannot leave the end subtracting from a
            stale base. The width subtracted is measured rather than taken from
            --app-scrollbar-width, which is only true where ::-webkit-scrollbar
            applies — see custom/useScrollGutterWidth. */}
        <SidebarGroup
          ref={listScrollGutterRef}
          className="min-h-0 flex-1 overflow-y-auto pb-1 [--sidebar-list-pad:--spacing(2)] ps-(--sidebar-list-pad) pe-[calc(var(--sidebar-list-pad)-var(--sidebar-list-gutter,0px))] [scrollbar-gutter:stable]"
        >
          {/* fork:end fork-sidebar-chrome */}
          <TooltipProvider
            key="sidebar-thread-tooltips-150"
            delay={150}
            closeDelay={0}
            timeout={400}
          >
            {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                Rows carry no vertical padding of their own, so this gap is the
                only space between them and the project header's margins are
                derived from it — both live in custom/sidebarV2CardAlignment. */}
            <ul
              ref={attachListAutoAnimateRef}
              role="list"
              className={cn("flex flex-col", SIDEBAR_V2_CARD_ALIGNMENT.listGap)}
            >
              {/* fork:end sidebar-v2-card-rows */}
              {(() => {
                const renderThreadRow = (
                  thread: EnvironmentThreadShell,
                  section: "pinned" | "active" | "snoozed" | "settled",
                  /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
                  // Set by the one caller painting under a header; every other
                  // caller is in a headerless section and leaves it alone.
                  underProjectHeader = false,
                  /* fork:end sidebar-v2-project-grouping */
                  sortable?: SortablePinnedRowBag,
                ) => {
                  const threadKey = scopedThreadKey(
                    scopeThreadRef(thread.environmentId, thread.id),
                  );
                  /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                  // Drafts are not on the server yet — settle/snooze would fail.
                  const draftCaps = sidebarDraftRowCapabilities(draftIdByThreadKey.has(threadKey));
                  /* fork:end sidebar-v2-draft-rows */
                  // Settled and snoozed are the ONLY things that collapse a
                  // row: every other thread is a full card. Density comes
                  // from users (or the auto rules) actually parking work,
                  // not from the sidebar second-guessing what still matters.
                  const isCard = section === "active" || section === "pinned";
                  const rowVariant = isCard ? "card" : "slim";
                  return (
                    <SidebarThreadRow
                      // Keyed per variant on purpose: when a thread settles,
                      // the card fades out in place and the slim row fades
                      // in at its settled position instead of one element
                      // FLIP-sliding through every row in between (rows here
                      // are translucent, so a crossing row reads as text
                      // painted over text).
                      key={`${threadKey}:${rowVariant}`}
                      thread={thread}
                      variant={rowVariant}
                      // Snoozed rows wake, settled rows un-settle, and cards settle.
                      variantAction={
                        section === "snoozed"
                          ? "unsnooze"
                          : section === "settled"
                            ? "unsettle"
                            : "settle"
                      }
                      settlementSupported={
                        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                        draftCaps.canSettle &&
                        /* fork:end sidebar-v2-draft-rows */
                        serverConfigs.get(thread.environmentId)?.environment.capabilities
                          .threadSettlement === true
                      }
                      snoozeSupported={
                        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                        draftCaps.canSnooze &&
                        /* fork:end sidebar-v2-draft-rows */
                        serverConfigs.get(thread.environmentId)?.environment.capabilities
                          .threadSnooze === true
                      }
                      isPinned={thread.pinnedAt != null}
                      sortable={sortable}
                      /* fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area */
                      pinningSupported={
                        /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                        draftCaps.canPin &&
                        /* fork:end sidebar-v2-draft-rows */
                        isCard &&
                        serverConfigs.get(thread.environmentId)?.environment.capabilities
                          .threadPinning === true
                      }
                      onPin={attemptPin}
                      onUnpin={attemptUnpin}
                      /* fork:end sidebar-v2-row-action-hit-area */
                      snoozeWakeLabelText={
                        section === "snoozed" && thread.snoozedUntil != null
                          ? snoozeWakeLabel(thread.snoozedUntil, {
                              now: new Date().toISOString(),
                            })
                          : null
                      }
                      // All sections: a woken thread can classify straight
                      // into the settled tail (PR merged while snoozed), and
                      // the wake signal must survive the trip. Still-snoozed
                      // rows resolve to null on their own.
                      wokeAt={threadWokeAt(thread, { now: snoozeNow })}
                      isActive={routeThreadKey === threadKey}
                      openPullRequestsInRightPanel={routeThreadRef !== null}
                      jumpLabel={
                        showThreadJumpHints ? (jumpLabelByKey.get(threadKey) ?? null) : null
                      }
                      currentEnvironmentId={primaryEnvironmentId}
                      environmentLabel={environmentLabelById.get(thread.environmentId) ?? null}
                      projectCwd={
                        projectCwdByKey.get(`${thread.environmentId}:${thread.projectId}`) ?? null
                      }
                      projectFaviconPath={
                        projectFaviconPathByKey.get(
                          `${thread.environmentId}:${thread.projectId}`,
                        ) ?? null
                      }
                      projectTitle={
                        projectDisplayNameByKey.get(
                          `${thread.environmentId}:${thread.projectId}`,
                        ) ?? null
                      }
                      /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
                      // Under a project header the card's repo line would only
                      // repeat the header two rows up, once per card, so the
                      // branch — what actually tells two threads on one project
                      // apart — takes the whole line. Hidden rather than
                      // dropped: assistive tech has no "two rows up".
                      projectTitleHidden={underProjectHeader}
                      /* fork:end sidebar-v2-project-grouping */
                      providerEntryByInstanceId={
                        providerEntriesByEnvironment.get(thread.environmentId) ??
                        EMPTY_PROVIDER_ENTRIES
                      }
                      timestampFormat={timestampFormat}
                      onThreadClick={handleThreadClick}
                      onThreadActivate={navigateToThread}
                      onStartRename={startThreadRename}
                      onRenameTitleChange={setRenamingTitle}
                      onCommitRename={commitThreadRename}
                      onCancelRename={cancelThreadRename}
                      isRenaming={renamingThreadKey === threadKey}
                      renamingTitle={renamingThreadKey === threadKey ? renamingTitle : ""}
                      onContextMenu={handleThreadContextMenu}
                      /* fork:begin sidebar-v2-draft-rows — see .fork/customizations.yaml#sidebar-v2-draft-rows */
                      onDiscardDraft={draftCaps.showDiscard ? discardDraftThread : null}
                      /* fork:end sidebar-v2-draft-rows */
                      onSettle={attemptSettle}
                      onUnsettle={attemptUnsettle}
                      onSnooze={attemptSnooze}
                      onUnsnooze={attemptUnsnooze}
                      onAcknowledgeWoke={acknowledgeWoke}
                      changeRequestSnapshot={changeRequestSnapshotByKey.get(threadKey) ?? null}
                      onChangeRequestSnapshot={setThreadChangeRequestSnapshot}
                    />
                  );
                };
                // Pinned block: full cards above the inbox, closed by a
                // thin divider (the pin glyphs carry the meaning, so no
                // header text). Vanishes entirely at count 0. Pinned cards
                // stay flat above the grouped sections — a pin freezes
                // prominence across projects.
                const items: ReactNode[] = [
                  pinnedThreads.length > 0 ? (
                    <li key="pinned-dnd" className="list-none">
                      <DndContext
                        sensors={pinnedDndSensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                        onDragEnd={handlePinnedDragEnd}
                      >
                        <SortableContext
                          items={orderedPinnedThreads
                            .map((thread) =>
                              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
                            )
                            .filter((threadKey) => reorderablePinnedKeys.has(threadKey))}
                          strategy={verticalListSortingStrategy}
                        >
                          {/* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                              Same gap as the outer list so pinned cards sit 2px apart
                              like every other card. */}
                          <ul
                            role="list"
                            aria-label="Pinned threads"
                            className={cn("flex flex-col", SIDEBAR_V2_CARD_ALIGNMENT.listGap)}
                          >
                            {/* fork:end sidebar-v2-card-rows */}
                            {orderedPinnedThreads.map((thread) => {
                              const threadKey = scopedThreadKey(
                                scopeThreadRef(thread.environmentId, thread.id),
                              );
                              if (!reorderablePinnedKeys.has(threadKey)) {
                                return renderThreadRow(thread, "pinned");
                              }
                              return (
                                <SortablePinnedThreadRow key={threadKey} id={threadKey}>
                                  {(bag) => renderThreadRow(thread, "pinned", false, bag)}
                                </SortablePinnedThreadRow>
                              );
                            })}
                          </ul>
                        </SortableContext>
                      </DndContext>
                    </li>
                  ) : null,
                ];
                if (pinnedThreads.length > 0) {
                  items.push(
                    <li
                      key="pinned-divider"
                      aria-hidden
                      data-testid="sidebar-v2-pinned-divider"
                      /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                         Margin derived off the list gap so halving that gap did
                         not quietly tighten this hairline too. */
                      className={cn(
                        "mx-2.5 h-px list-none bg-sidebar-border/60",
                        SIDEBAR_V2_CARD_ALIGNMENT.pinnedDividerMargin,
                      )}
                      /* fork:end sidebar-v2-card-rows */
                    />,
                  );
                }
                /* fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping */
                // Only the active cards sectionize. The two shelves below are
                // time-ordered tails whose value is that they stay short.
                // Flat is the one-headerless-section case, so this is the only
                // path either way — and it is the same sequence
                // orderedActiveThreads flattens.
                items.push(
                  ...visibleActiveSections.flatMap((section, sectionIndex) => {
                    // Bound here rather than read off `section.header` inside the
                    // callback below: the narrowing does not survive into a
                    // closure, and the key the plus starts a thread from must be
                    // the one this header was drawn for.
                    const header = section.header;
                    return [
                      ...(header
                        ? [
                            <SidebarV2ProjectGroupHeader
                              key={`project-group-header:${header.projectKey}`}
                              label={header.displayName}
                              isFirst={sectionIndex === 0}
                              collapsed={section.collapsed}
                              onToggleCollapsed={() =>
                                toggleProjectGroupCollapsed(header.projectKey)
                              }
                              // The unresolved-project section names no project,
                              // so there is nowhere for its plus to start a
                              // thread. Keyed off the bucket's own identity
                              // rather than off its label being null: the label
                              // is a rendering detail that happens to correlate
                              // today, and one signal carrying two meanings is
                              // how it stops correlating later.
                              onNewThread={
                                header.projectKey === UNGROUPED_PROJECT_KEY
                                  ? undefined
                                  : () => handleNewThreadInProject(header.projectKey)
                              }
                            />,
                          ]
                        : []),
                      ...section.threads.map((thread) =>
                        renderThreadRow(thread, "active", header !== null),
                      ),
                    ];
                  }),
                );
                /* fork:end sidebar-v2-project-grouping */
                // Snoozed shelf: between the inbox and Settled — out of the
                // way, never gone. The header always renders while anything
                // is snoozed (the count is the whole footprint when
                // collapsed); rows only when expanded. Vanishes entirely at
                // count 0.
                if (snoozedThreads.length > 0) {
                  items.push(
                    <li key="snoozed-shelf-header" data-thread-selection-safe className="list-none">
                      <button
                        type="button"
                        onClick={toggleSnoozedShelf}
                        aria-expanded={snoozedShelfExpanded}
                        data-testid="sidebar-v2-snoozed-shelf-toggle"
                        /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                           Margins derived off the list gap, so halving that
                           gap left this shelf's spacing where it was. */
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-2.5 text-left",
                          SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderLead,
                          SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderTrail,
                        )}
                        /* fork:end sidebar-v2-card-rows */
                      >
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {snoozedShelfExpanded ? "Snoozed" : `Snoozed (${snoozedThreads.length})`}
                        </span>
                        <span className="h-px flex-1 bg-blue-500/20 dark:bg-blue-400/15" />
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            // fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area
                            // On the trailing column's axis with nothing owed:
                            // px-2.5 over the list's 8px inset is 18, and a
                            // flush 12px chevron centres 6px further — the
                            // column's 24. The offset constant carries the
                            // derivation.
                            // fork:end sidebar-v2-row-action-hit-area
                            SIDEBAR_V2_TRAILING_OFFSET.shelfChevron,
                            "size-3 text-blue-600 transition-transform dark:text-blue-400",
                            snoozedShelfExpanded && "rotate-180",
                          )}
                        />
                      </button>
                    </li>,
                  );
                  for (const thread of visibleSnoozedThreads) {
                    items.push(renderThreadRow(thread, "snoozed"));
                  }
                }
                if (settledThreads.length > 0) {
                  items.push(
                    <li key="settled-shelf-header" data-thread-selection-safe className="list-none">
                      <button
                        type="button"
                        onClick={toggleSettledShelf}
                        aria-expanded={settledShelfExpanded}
                        data-testid="sidebar-v2-settled-shelf-toggle"
                        /* fork:begin sidebar-v2-card-rows — see .fork/customizations.yaml#sidebar-v2-card-rows
                           Margins derived off the list gap, so halving that
                           gap left this shelf's spacing where it was. */
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-2.5 text-left",
                          SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderLead,
                          SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderTrail,
                        )}
                        /* fork:end sidebar-v2-card-rows */
                      >
                        <span className="text-xs font-medium text-muted-foreground/50">
                          {settledShelfExpanded ? "Settled" : `Settled (${settledThreads.length})`}
                        </span>
                        <span className="h-px flex-1 bg-sidebar-border/60" />
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            // fork:begin sidebar-v2-row-action-hit-area — see .fork/customizations.yaml#sidebar-v2-row-action-hit-area
                            // Same derivation as the snoozed shelf above.
                            // fork:end sidebar-v2-row-action-hit-area
                            SIDEBAR_V2_TRAILING_OFFSET.shelfChevron,
                            "size-3 text-muted-foreground/50 transition-transform",
                            settledShelfExpanded && "rotate-180",
                          )}
                        />
                      </button>
                    </li>,
                  );
                }
                for (const thread of renderedSettledThreads) {
                  items.push(renderThreadRow(thread, "settled"));
                }
                return items;
              })()}
              {settledShelfExpanded && hiddenSettledCount > 0 ? (
                <li className="list-none">
                  <button
                    type="button"
                    onClick={showMoreSettled}
                    className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-sidebar-muted-foreground/55 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                  >
                    <PlusIcon aria-hidden className="size-4 shrink-0" />
                    Show {Math.min(hiddenSettledCount, SETTLED_TAIL_PAGE_COUNT)} more
                  </button>
                </li>
              ) : null}
            </ul>
          </TooltipProvider>
          {pinnedThreads.length +
            activeThreads.length +
            snoozedThreads.length +
            settledThreads.length ===
          0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground/60">
              {projects.length === 0 ? (
                <>
                  <span>No projects yet</span>
                  <button
                    type="button"
                    onClick={openAddProjectCommandPalette}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sidebar-border px-2.5 py-1 text-[11px] font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                  >
                    <PlusIcon className="-mx-0.5 size-3" />
                    Add project
                  </button>
                </>
              ) : scopedProjectGroup ? (
                `No threads in ${scopedProjectGroup.displayName} yet`
              ) : (
                "No threads yet"
              )}
            </div>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
