/** Collapsed-sidebar thread tabs: Needs input, Completed and Working threads above the chat
 * column, filtered by project, the overflow behind More, New agent last. See
 * `.fork/customizations.yaml#fork-collapsed-thread-tabs`. Renders only while collapsed. */
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import {
  resolveThreadCurrentPullRequestLink,
  resolveThreadPullRequestBadge,
} from "@t3tools/client-runtime/thread-pull-requests";
import { useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import {
  filterSidebarV2VisibleThreads,
  resolveThreadLastVisitedAt,
} from "~/components/Sidebar.logic";
import {
  ThreadPullRequestBadgeControl,
  prStatusIndicator,
  useLinkedThreadPullRequest,
} from "~/components/ThreadStatusIndicators";
import { InlineButton } from "~/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import { useSidebar, useSidebarVisibility } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useSupportsMultiplePullRequests } from "~/hooks/useSupportsMultiplePullRequests";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { useRightPanelStore } from "~/rightPanelStore";
import { useSnoozeWakeClock } from "~/components/Sidebar.logic";
import { useSidebarProjectGroups } from "~/hooks/useSidebarProjectGroups";
import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { releaseComposerDraftUploads } from "~/lib/composerDraftUploads";
import { shortcutLabelForCommand } from "~/keybindings";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import {
  useDelegatedUnderParent,
  useProjects,
  useQuietThreadShells,
  useServerConfigs,
} from "~/state/entities";
import { useEnvironmentProviders } from "~/state/environments";
import {
  deriveProviderEntriesByEnvironment,
  NO_PROVIDER_MODEL_SELECTION,
  type ProviderInstanceEntry,
} from "~/providerInstances";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { settleAndAdvance } from "~/settleAndAdvance";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useUiStateStore } from "~/uiStateStore";
import { useThreadSelectionStore } from "~/threadSelectionStore";
import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";

import {
  buildCollapsedThreadTabs,
  collapsedDraftTabKey,
  collapsedFilterSwitchTarget,
  COLLAPSED_TAB_STATUSES,
  DEFAULT_COLLAPSED_TAB_STATUSES,
  fitCollapsedThreadTabs,
  type CollapsedThreadTab,
  type CollapsedThreadTabStatus,
} from "./collapsedThreadTabsModel";
import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  LayersIcon,
  PlusIcon,
  XIcon,
} from "./icons/lucide-phosphor";
import { ModelPickerProviderGlyph } from "./icons/ModelPickerProviderGlyph";
import { SegmentedTab, SegmentedTabs } from "./SegmentedTabs";
import { ScopeCheckboxItem } from "./SidebarV2ChromeRows";
import { openSidebarThreadMenu, startSidebarThreadInProject } from "./sidebarActionsBridge";
import { SIDEBAR_V2_ICON_BUTTON_CLASS } from "./sidebarV2TrailingColumn";
import { resolveSidebarV2CardStatus } from "./sidebarV2CardStatus";
import { SidebarV2StatusMark } from "./SidebarV2StatusIndicator";
import { sidebarDraftModelSelection, sidebarDraftTitleFromPrompt } from "./sidebarV2DraftRows";
import type { SidebarV2GroupableProject } from "./sidebarV2ProjectGrouping";
import {
  createSidebarV2CompletedHoldTracker,
  SIDEBAR_V2_STATUS_SECTION_LABELS,
} from "./sidebarV2StatusGrouping";
import { useStartNewAgentDraft } from "./useNewAgentDraft";

const PROJECT_STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-project:v1";
const STATUSES_STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-statuses:v1";
const StoredStatuses = Schema.Array(Schema.Literals(COLLAPSED_TAB_STATUSES));
const ALL_PROJECTS = "all";
const TRAILING_CONTROLS_GAP = 8;
const TAB_ACTION_CLASS = cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "size-5 rounded-full");

// Its own tracker: the sidebar's resets whenever status grouping is off.
const completedHolds = createSidebarV2CompletedHoldTracker();
const NO_PROJECT_GROUPS: readonly SidebarV2GroupableProject[] = [];
const DEFAULT_STATUS_SET = new Set(DEFAULT_COLLAPSED_TAB_STATUSES);
const STATUS_MENU_LABEL = "Choose which threads show as tabs";

const clearSidebarSelection = () => {
  const selection = useThreadSelectionStore.getState();
  if (selection.hasSelection()) selection.clearSelection();
};

type TabStatus = ReturnType<typeof resolveSidebarV2CardStatus>["topStatus"];

export function CollapsedThreadTabs(props: {
  /** The window's panel controls float over this row's right end. */
  readonly reserveTrailingControls: boolean;
  /** The thread (or draft thread) this pane shows, which in a split can differ from the
      route's. Its header's breadcrumb hides while it has a visible tab. */
  readonly paneThreadKey: string | null;
}) {
  const { isMobile } = useSidebar();
  const sidebarVisible = useSidebarVisibility();
  if (isMobile) return null;
  // The tracker keeps watching under an open sidebar, so a thread that comes to rest
  // there is still held in Completed when the sidebar collapses.
  if (sidebarVisible) return <CompletedHoldObserver />;
  return (
    <CollapsedThreadTabsStrip
      reserveTrailingControls={props.reserveTrailingControls}
      paneThreadKey={props.paneThreadKey}
    />
  );
}

/** The tab pipeline's inputs, shared by the strip and the observer that feeds its tracker. */
function useTabSource() {
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const serverConfigs = useServerConfigs();
  const localLastVisitedAtById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const routeTarget = useThreadRouteTarget();
  return {
    threads: filterSidebarV2VisibleThreads(threads, null, delegatedUnderParent),
    localLastVisitedAtById,
    // The minute re-reads it for hold expiry, the wake clock at each snooze deadline.
    now: preciseNow(useNowMinute(), useSnoozeWakeClock(threads)),
    openThreadKey: routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null,
    holds: completedHolds,
    supports: (environmentId: EnvironmentId) => {
      const capabilities = serverConfigs.get(environmentId)?.environment.capabilities;
      return {
        settlement: capabilities?.threadSettlement === true,
        snooze: capabilities?.threadSnooze === true,
      };
    },
  };
}

/** The real time as ISO, for snooze checks: the minute clock carries no zone. Its
    arguments are only the clocks that should re-read it. */
function preciseNow(_minute: string, _wakeClockMs: number): string {
  return new Date().toISOString();
}

function CompletedHoldObserver() {
  buildCollapsedThreadTabs({
    ...useTabSource(),
    projectGroups: NO_PROJECT_GROUPS,
    statuses: DEFAULT_STATUS_SET,
  });
  return null;
}

type StripEntry =
  | {
      readonly kind: "draft";
      readonly draftId: DraftId;
      readonly threadKey: string;
      readonly environmentId: EnvironmentId;
      readonly defaultModelSelection: ModelSelection;
    }
  | { readonly kind: "thread"; readonly tab: CollapsedThreadTab };

function CollapsedThreadTabsStrip(props: {
  readonly reserveTrailingControls: boolean;
  readonly paneThreadKey: string | null;
}) {
  const router = useRouter();
  const serverConfigs = useServerConfigs();
  const providersByEnvironment = useEnvironmentProviders();
  const projectGroups = useSidebarProjectGroups();
  const allProjects = useProjects();
  const source = useTabSource();
  const { localLastVisitedAtById, now, openThreadKey } = source;
  const [storedProjectKey, setStoredProjectKey] = useLocalStorage(
    PROJECT_STORAGE_KEY,
    ALL_PROJECTS,
    Schema.String,
  );
  const [storedStatuses, setStoredStatuses] = useLocalStorage(
    STATUSES_STORAGE_KEY,
    DEFAULT_COLLAPSED_TAB_STATUSES,
    StoredStatuses,
  );
  const statuses = new Set(storedStatuses);
  const toggleStatus = (status: CollapsedThreadTabStatus) =>
    setStoredStatuses((previous) =>
      COLLAPSED_TAB_STATUSES.filter((option) =>
        option === status ? !previous.includes(option) : previous.includes(option),
      ),
    );
  // The sidebar's New agent row: the unassigned draft, its project picked in the column.
  const startNewAgentDraft = useStartNewAgentDraft();
  const newAgentShortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "chat.new",
  );
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const trailingInset = useTrailingControlsInset(props.reserveTrailingControls ? strip : null);
  const [navWidth, setNavWidth] = useState(0);
  // Created once so the ref never re-subscribes.
  const [measureNav] = useState(
    () => (node: HTMLElement | null) =>
      node === null
        ? undefined
        : observeResize(node, (entries) => setNavWidth(entries.at(-1)?.contentRect.width ?? 0)),
  );

  const { tabs, projects } = buildCollapsedThreadTabs({ ...source, projectGroups, statuses });
  // A project that drops out of the strip falls back to All without forgetting the choice.
  const projectKey = projects.some((project) => project.projectKey === storedProjectKey)
    ? storedProjectKey
    : ALL_PROJECTS;
  const tabsIn = (key: string) =>
    key === ALL_PROJECTS ? tabs : tabs.filter((tab) => tab.projectKey === key);
  const shownTabs = tabsIn(projectKey);
  // Filtered to a project, the plus starts in it through the sidebar's own in-project path.
  const filteredProject = projects.find((project) => project.projectKey === projectKey) ?? null;
  const newAgentLabel = filteredProject
    ? `New agent in ${filteredProject.displayName}`
    : "New agent";
  const startNewAgent = () => {
    if (filteredProject && startSidebarThreadInProject(filteredProject.projectKey)) return;
    void startNewAgentDraft();
  };
  // The open draft (the plus lands on one) gets the first tab until its first send turns it into
  // a thread, whatever the project filter.
  const routeTarget = useThreadRouteTarget();
  const openDraftId = routeTarget?.kind === "draft" ? routeTarget.draftId : null;
  const openDraft = useComposerDraftStore((store) =>
    openDraftId === null ? null : store.getDraftSession(openDraftId),
  );
  const draftThreadKey = collapsedDraftTabKey({ draft: openDraft, tabs });
  const draftEntry: StripEntry | null =
    openDraftId !== null && openDraft !== null && draftThreadKey !== null
      ? {
          kind: "draft",
          draftId: openDraftId,
          threadKey: draftThreadKey,
          environmentId: openDraft.environmentId,
          // The sidebar's draft card falls back to the project's default model.
          defaultModelSelection:
            allProjects.find(
              (project) =>
                project.environmentId === openDraft.environmentId &&
                project.id === openDraft.projectId,
            )?.defaultModelSelection ?? NO_PROVIDER_MODEL_SELECTION,
        }
      : null;
  // The draft leads the row; thread tabs follow it.
  const entries: StripEntry[] = [
    ...(draftEntry === null ? [] : [draftEntry]),
    ...shownTabs.map((tab): StripEntry => ({ kind: "thread", tab })),
  ];
  const entryKey = (entry: StripEntry) =>
    entry.kind === "draft" ? entry.threadKey : entry.tab.threadKey;
  const fit = fitCollapsedThreadTabs({
    count: entries.length,
    width: navWidth,
    activeIndex: entries.findIndex(
      (entry) => entry.kind === "draft" || entry.tab.threadKey === openThreadKey,
    ),
  });
  const visibleEntries = fit.visible.flatMap((index) => entries[index] ?? []);
  const overflowEntries = fit.overflow.flatMap((index) => entries[index] ?? []);
  const paneThreadTabbed =
    props.paneThreadKey !== null &&
    visibleEntries.some((entry) => entryKey(entry) === props.paneThreadKey);
  const discardDraft = (draftId: DraftId) => {
    // Home would start a fresh draft, so fall back to the most recent thread.
    const next =
      shownTabs[0]?.thread ??
      source.threads.reduce<(typeof source.threads)[number] | null>(
        (latest, thread) =>
          latest === null || thread.updatedAt > latest.updatedAt ? thread : latest,
        null,
      );
    void (async () => {
      // Leave first, then clear: clearing while still on /draft/$id races the
      // missing-session redirect into a fresh draft (the sidebar's discard does the same).
      if (next) {
        clearSidebarSelection();
        await router.navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(next.environmentId, next.id)),
          replace: true,
        });
      } else {
        await router.navigate({ to: "/", replace: true });
      }
      releaseComposerDraftUploads(draftId);
      useComposerDraftStore.getState().clearDraftThread(draftId);
    })();
  };

  const statusOf = ({ thread, threadKey }: CollapsedThreadTab): TabStatus =>
    resolveSidebarV2CardStatus(thread, {
      lastVisitedAt: resolveThreadLastVisitedAt(
        thread.lastVisitedAt,
        localLastVisitedAtById[threadKey],
      ),
      wokeAt: threadWokeAt(thread, { now }),
    }).topStatus;
  // The sidebar's per-environment lookup: default instance ids collide across environments.
  const providerEntries = deriveProviderEntriesByEnvironment(
    [...serverConfigs].map(
      ([environmentId, config]) =>
        [environmentId, providersByEnvironment.get(environmentId) ?? [], config.settings] as const,
    ),
  );
  const providerOf = ({ thread }: CollapsedThreadTab) =>
    providerEntries
      .get(thread.environmentId)
      ?.get(thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId) ?? null;
  const openThread = ({ thread }: CollapsedThreadTab) => {
    clearSidebarSelection();
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  };

  return (
    <div
      ref={setStrip}
      data-fork-thread-tabs=""
      // The open thread's tab names it, so the chat header drops its breadcrumb (theme.custom.css).
      data-open-thread-tabbed={paneThreadTabbed ? "" : undefined}
      // Shared by both panes of a split: a press here must not first focus the left one.
      data-split-pane-action=""
      className={cn(
        "drag-region flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3",
        // Clears the window controls and the floating sidebar toggle.
        "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+var(--workspace-titlebar-control-gap))]",
        // The chat header's pr-24 until the floating panel controls are measured.
        props.reserveTrailingControls
          ? "pr-[calc(var(--workspace-gutter-end)+6rem)] wco:pr-[calc(var(--workspace-native-controls-inset)+6rem)]"
          : "pr-(--workspace-gutter-end)",
      )}
      style={trailingInset === null ? undefined : { paddingRight: trailingInset }}
    >
      <SegmentedTabs
        aria-label="Filter threads by project"
        value={[projectKey]}
        onValueChange={(value) => {
          const next = value[0];
          if (typeof next !== "string") return;
          setStoredProjectKey(next);
          const target = collapsedFilterSwitchTarget({
            before: shownTabs,
            after: tabsIn(next),
            openThreadKey,
            draftOpen: draftEntry !== null,
          });
          if (target) openThread(target);
        }}
        // Scrolls sideways before it can squeeze out More.
        className="min-w-0 shrink overflow-x-auto [scrollbar-width:none]"
      >
        <ProjectTab value={ALL_PROJECTS} label="All projects">
          <LayersIcon className="size-3.5" />
        </ProjectTab>
        {projects.map((project) => (
          <ProjectTab
            key={project.projectKey}
            value={project.projectKey}
            label={project.displayName}
          >
            <ProjectFavicon project={project} className="size-3.5 shrink-0" />
          </ProjectTab>
        ))}
      </SegmentedTabs>
      <span className="flex shrink-0 items-center gap-1">
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={STATUS_MENU_LABEL}
                      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-black/5 data-popup-open:text-foreground dark:hover:bg-white/8 dark:data-popup-open:bg-white/8"
                    />
                  }
                />
              }
            >
              <EllipsisIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">{STATUS_MENU_LABEL}</TooltipPopup>
          </Tooltip>
          <MenuPopup align="start" className="min-w-40">
            <MenuGroup>
              <MenuGroupLabel>Show as tabs</MenuGroupLabel>
              {COLLAPSED_TAB_STATUSES.map((status) => (
                <ScopeCheckboxItem
                  key={status}
                  checked={statuses.has(status)}
                  onCheckedChange={() => toggleStatus(status)}
                >
                  {SIDEBAR_V2_STATUS_SECTION_LABELS[status]}
                </ScopeCheckboxItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={newAgentLabel}
                disabled={projectGroups.length === 0}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-64 dark:hover:bg-white/8"
                onClick={startNewAgent}
              />
            }
          >
            <PlusIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {filteredProject === null && newAgentShortcutLabel
              ? `${newAgentLabel} (${newAgentShortcutLabel})`
              : newAgentLabel}
          </TooltipPopup>
        </Tooltip>
      </span>
      {/* px-1 and py-1 keep the selected tab's glass halo inside the clip. */}
      <nav
        ref={measureNav}
        aria-label="Active threads"
        // The min width keeps More (72px) and the halo padding on screen.
        className="-mx-1 -my-1 flex min-w-[80px] flex-1 items-center gap-1.5 overflow-hidden px-1 py-1"
      >
        {entries.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">
            {statuses.size === 0 ? "No statuses selected" : "No active threads"}
          </span>
        ) : null}
        {visibleEntries.map((entry) => {
          if (entry.kind === "draft") {
            return (
              <DraftTab
                key={entry.threadKey}
                draftId={entry.draftId}
                defaultModelSelection={entry.defaultModelSelection}
                providerOf={(instanceId) =>
                  providerEntries.get(entry.environmentId)?.get(instanceId) ?? null
                }
                onDiscard={() => discardDraft(entry.draftId)}
              />
            );
          }
          const { tab } = entry;
          return (
            <ThreadTab
              key={tab.threadKey}
              tab={tab}
              active={tab.threadKey === openThreadKey}
              status={statusOf(tab)}
              provider={providerOf(tab)}
              pullRequestsInRightPanel={openThreadKey !== null}
              canSettle={
                serverConfigs.get(tab.thread.environmentId)?.environment.capabilities
                  .threadSettlement === true
              }
              onOpen={() => openThread(tab)}
            />
          );
        })}
        {overflowEntries.length === 0 ? null : (
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`${overflowEntries.length} more active threads`}
                  className="flex h-7 w-[72px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full text-xs font-medium text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-black/5 data-popup-open:text-foreground dark:hover:bg-white/8 dark:data-popup-open:bg-white/8"
                />
              }
            >
              {overflowEntries.length} more
              <ChevronDownIcon className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end" className="max-w-72">
              {overflowEntries.map((entry) =>
                entry.kind === "draft" ? (
                  // The open draft, so there is nowhere to go; its X is on the draft itself.
                  <MenuItem key={entry.threadKey}>
                    <SidebarV2StatusMark status={null} seed={entry.threadKey} idle="draft" />
                    <DraftTitle draftId={entry.draftId} />
                  </MenuItem>
                ) : (
                  <MenuItem key={entry.tab.threadKey} onClick={() => openThread(entry.tab)}>
                    <SidebarV2StatusMark
                      status={statusOf(entry.tab)}
                      seed={entry.tab.threadKey}
                      idle="dot"
                    />
                    <span className="min-w-0 truncate">{entry.tab.thread.title}</span>
                  </MenuItem>
                ),
              )}
            </MenuPopup>
          </Menu>
        )}
      </nav>
    </div>
  );
}

/** How far the window's floating panel controls reach into the row from its right end, plus a
    gap, so the tabs and New agent stop short of them however many buttons they hold. */
function useTrailingControlsInset(strip: HTMLElement | null): number | null {
  const [inset, setInset] = useState<number | null>(null);
  const subscription = useRef<{
    readonly strip: HTMLElement;
    readonly controls: Element;
    readonly dispose: () => void;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds a ResizeObserver on the floating controls, which ChatView remounts (root or header) outside this component, so each render re-finds them
  useLayoutEffect(() => {
    // This pane's own controls: they sit at its workspace root or in its chat header.
    const controls =
      strip
        ?.closest("[data-chat-column]")
        ?.parentElement?.querySelector("[data-workspace-titlebar-controls]") ?? null;
    const current = subscription.current;
    if (current?.strip === strip && current.controls === controls) return;
    current?.dispose();
    subscription.current = null;
    if (strip === null || controls === null) {
      if (current) setInset(null);
      return;
    }
    const measure = () =>
      setInset(
        Math.max(
          0,
          Math.ceil(strip.getBoundingClientRect().right - controls.getBoundingClientRect().left),
        ) + TRAILING_CONTROLS_GAP,
      );
    // Measured now as well: the observer reports a frame later, and never in a hidden window.
    measure();
    subscription.current = { strip, controls, dispose: observeResize([strip, controls], measure) };
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases that observer on unmount
  useEffect(() => () => subscription.current?.dispose(), []);
  return strip === null ? null : inset;
}

function ThreadTab(props: {
  readonly tab: CollapsedThreadTab;
  readonly active: boolean;
  readonly status: TabStatus;
  readonly provider: ProviderInstanceEntry | null;
  /** As the sidebar card does: with a thread open, a PR opens in the right panel. */
  readonly pullRequestsInRightPanel: boolean;
  readonly canSettle: boolean;
  readonly onOpen: () => void;
}) {
  const { thread, threadKey } = props.tab;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  // The sidebar card's PR badge: same resolution, same click routing.
  const openPrLink = useOpenPrLink();
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  const linkedPullRequest = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
    true,
    thread.pullRequests,
    thread.branchPullRequest,
  );
  const pr = linkedPullRequest?.pr ?? null;
  const currentLinkedPr = supportsMultiplePullRequests
    ? resolveThreadCurrentPullRequestLink(thread.pullRequests)
    : null;
  const prBadge = supportsMultiplePullRequests
    ? resolveThreadPullRequestBadge(thread.pullRequests)
    : null;
  const openPullRequest = (event: MouseEvent<HTMLElement>, targetUrl?: string) => {
    const url = targetUrl ?? pr?.url ?? currentLinkedPr?.url;
    if (!url) return;
    const inRightPanel = targetUrl !== undefined || props.pullRequestsInRightPanel;
    if (openPrLink(event, url, inRightPanel ? threadRef : undefined) && inRightPanel) {
      if (!props.active) props.onOpen();
    }
  };
  const openPullRequestList = () => {
    useRightPanelStore.getState().open(threadRef, "pull-requests");
    if (!props.active) props.onOpen();
  };
  // A tab's menu is for its one thread, never a selection made in the sidebar.
  const openMenu = (position: { x: number; y: number }) => {
    clearSidebarSelection();
    openSidebarThreadMenu(threadRef, position);
  };
  return (
    <div
      data-fork-thread-tab=""
      data-active={props.active ? "true" : undefined}
      className={cn(
        // Shrinks from its title's width to the minimum fitCollapsedThreadTabs counts on.
        "group/tab relative flex h-7 max-w-56 min-w-[132px] shrink items-center rounded-full text-xs font-medium",
        props.active
          ? "bg-black/10 text-foreground dark:bg-white/16"
          : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {/* Stretched under the content so the PR badge can be its own link: the content
          ignores the pointer, and every press but the badge's reaches this button. */}
      <button
        type="button"
        aria-current={props.active ? "page" : undefined}
        className="absolute inset-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={props.onOpen}
      >
        <span className="sr-only">{thread.title}</span>
      </button>
      <span className="pointer-events-none flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5">
        {/* The hover actions cover the end of the mark and title, which fade under them
            rather than sliding them in, so no tab moves and the PR badge and status stay
            clickable. On a minimum-width tab they reach over the mark. */}
        <span className="relative flex h-full min-w-0 flex-1 items-center">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 group-focus-within/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-3.5rem),#0000_calc(100%-2.75rem))] group-hover/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-3.5rem),#0000_calc(100%-2.75rem))]">
            {/* The model picker's marks: the Claude Code mascot, the Codex cloud. */}
            {props.provider ? (
              <ModelPickerProviderGlyph entry={props.provider} showBadge={false} />
            ) : null}
            <span aria-hidden className="min-w-0 flex-1 truncate text-start">
              {thread.title}
            </span>
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 [@media(any-hover:none)]:hidden">
            {props.canSettle ? (
              <button
                type="button"
                aria-label="Settle thread"
                className={TAB_ACTION_CLASS}
                onClick={() => settleAndAdvance(threadRef)}
              >
                <CheckIcon className="size-3" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="More thread actions"
              className={TAB_ACTION_CLASS}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          </span>
        </span>
        {prBadge?.kind === "stack" || pr || currentLinkedPr ? (
          <ThreadPullRequestBadgeControl
            render={
              <InlineButton
                className="pointer-events-auto relative flex items-center gap-1 [&>span]:text-[0.75rem] [&>span]:leading-4"
                data-fork-sidebar-pr-badge
              />
            }
            badge={prBadge}
            pullRequests={thread.pullRequests}
            number={pr?.number ?? currentLinkedPr?.number}
            url={pr?.url ?? currentLinkedPr?.url}
            status={prStatusIndicator(pr, linkedPullRequest?.sourceControlProvider)}
            onOpenList={openPullRequestList}
            onOpenPullRequest={openPullRequest}
          />
        ) : null}
        <SidebarV2StatusMark status={props.status} seed={threadKey} idle="dot" />
      </span>
    </div>
  );
}

/** The open draft's tab: its prompt as the title (the sidebar's draft label), the composer's
    provider, the draft pencil, and an X that discards it. */
function DraftTab(props: {
  readonly draftId: DraftId;
  readonly defaultModelSelection: ModelSelection;
  readonly providerOf: (instanceId: string) => ProviderInstanceEntry | null;
  readonly onDiscard: () => void;
}) {
  const instanceId = useComposerDraftStore(
    (store) =>
      sidebarDraftModelSelection({
        composerDraft: store.getComposerDraft(props.draftId),
        fallback: props.defaultModelSelection,
      }).instanceId,
  );
  const provider = props.providerOf(instanceId);
  return (
    <div
      data-fork-thread-tab=""
      data-active="true"
      className="group/tab relative flex h-7 max-w-56 min-w-[132px] shrink items-center rounded-full bg-black/10 text-xs font-medium text-foreground dark:bg-white/16"
    >
      <span aria-current="page" className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5">
        {provider ? <ModelPickerProviderGlyph entry={provider} showBadge={false} /> : null}
        {/* Fades out under the discard button rather than sliding it in, so no tab moves. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 group-focus-within/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),#0000_calc(100%-1.25rem))] group-hover/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),#0000_calc(100%-1.25rem))]">
          <DraftTitle draftId={props.draftId} />
          <SidebarV2StatusMark status={null} seed={props.draftId} idle="draft" />
        </span>
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center opacity-0 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 [@media(any-hover:none)]:pointer-events-auto [@media(any-hover:none)]:opacity-100">
        <button
          type="button"
          aria-label="Discard draft"
          className={TAB_ACTION_CLASS}
          onClick={props.onDiscard}
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </div>
  );
}

/** The sidebar's draft label: the prompt with attachment chips read as their labels. */
function DraftTitle(props: { readonly draftId: DraftId }) {
  const title = useComposerDraftStore((store) =>
    sidebarDraftTitleFromPrompt(
      replaceComposerContextReferences(
        store.getComposerDraft(props.draftId)?.prompt ?? "",
        (occurrence) => occurrence.label,
      ),
    ),
  );
  return <span className="min-w-0 flex-1 truncate text-start">{title}</span>;
}

function ProjectTab(props: {
  readonly value: string;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<SegmentedTab value={props.value} aria-label={props.label} className="w-7 px-0" />}
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}
