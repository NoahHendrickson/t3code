/** Collapsed-sidebar thread tabs: Needs input, Completed and Working threads above the chat
 * column, filtered by project, the overflow behind More, New agent last. See
 * `.fork/customizations.yaml#fork-collapsed-thread-tabs`. Renders only while collapsed. */
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useState } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import {
  filterSidebarV2VisibleThreads,
  resolveThreadLastVisitedAt,
} from "~/components/Sidebar.logic";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { useSidebar, useSidebarVisibility } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useSidebarProjectGroups } from "~/hooks/useSidebarProjectGroups";
import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { shortcutLabelForCommand } from "~/keybindings";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { useDelegatedUnderParent, useQuietThreadShells, useServerConfigs } from "~/state/entities";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { settleAndAdvance } from "~/settleAndAdvance";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useUiStateStore } from "~/uiStateStore";

import {
  buildCollapsedThreadTabs,
  fitCollapsedThreadTabs,
  type CollapsedThreadTab,
} from "./collapsedThreadTabsModel";
import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  LayersIcon,
  PlusIcon,
} from "./icons/lucide-phosphor";
import { SegmentedTab, SegmentedTabs } from "./SegmentedTabs";
import { openSidebarThreadMenu, startSidebarThreadInProject } from "./sidebarActionsBridge";
import { SIDEBAR_V2_ICON_BUTTON_CLASS } from "./sidebarV2TrailingColumn";
import { resolveSidebarV2CardStatus } from "./sidebarV2CardStatus";
import { SidebarV2StatusMark } from "./SidebarV2StatusIndicator";
import type { SidebarV2GroupableProject } from "./sidebarV2ProjectGrouping";
import { createSidebarV2CompletedHoldTracker } from "./sidebarV2StatusGrouping";
import { useStartNewAgentDraft } from "./useNewAgentDraft";

const PROJECT_STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-project:v1";
const ALL_PROJECTS = "all";
const TAB_ACTION_CLASS = cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "size-5 rounded-full");

// Its own tracker: the sidebar's resets whenever status grouping is off.
const completedHolds = createSidebarV2CompletedHoldTracker();
const NO_PROJECT_GROUPS: readonly SidebarV2GroupableProject[] = [];

type TabStatus = ReturnType<typeof resolveSidebarV2CardStatus>["topStatus"];

export function CollapsedThreadTabs(props: {
  /** The window's panel controls float over this row's right end. */
  readonly reserveTrailingControls: boolean;
}) {
  const { isMobile } = useSidebar();
  const sidebarVisible = useSidebarVisibility();
  if (isMobile) return null;
  // The tracker keeps watching under an open sidebar, so a thread that comes to rest
  // there is still held in Completed when the sidebar collapses.
  if (sidebarVisible) return <CompletedHoldObserver />;
  return <CollapsedThreadTabsStrip reserveTrailingControls={props.reserveTrailingControls} />;
}

/** The tab pipeline's inputs, shared by the strip and the observer that feeds its tracker. */
function useTabSource() {
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const localLastVisitedAtById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const now = useNowMinute();
  const routeTarget = useThreadRouteTarget();
  return {
    threads: filterSidebarV2VisibleThreads(threads, null, delegatedUnderParent),
    localLastVisitedAtById,
    now,
    openThreadKey: routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null,
    holds: completedHolds,
  };
}

function CompletedHoldObserver() {
  buildCollapsedThreadTabs({ ...useTabSource(), projectGroups: NO_PROJECT_GROUPS });
  return null;
}

function CollapsedThreadTabsStrip(props: { readonly reserveTrailingControls: boolean }) {
  const router = useRouter();
  const serverConfigs = useServerConfigs();
  const projectGroups = useSidebarProjectGroups();
  const source = useTabSource();
  const { localLastVisitedAtById, now: nowMinute, openThreadKey } = source;
  const [storedProjectKey, setStoredProjectKey] = useLocalStorage(
    PROJECT_STORAGE_KEY,
    ALL_PROJECTS,
    Schema.String,
  );
  // The sidebar's New agent row: the unassigned draft, its project picked in the column.
  const startNewAgentDraft = useStartNewAgentDraft();
  const newAgentShortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "chat.new",
  );
  const [navWidth, setNavWidth] = useState(0);
  // Created once so the ref never re-subscribes.
  const [measureNav] = useState(
    () => (node: HTMLElement | null) =>
      node === null
        ? undefined
        : observeResize(node, (entries) => setNavWidth(entries.at(-1)?.contentRect.width ?? 0)),
  );

  const { tabs, projects } = buildCollapsedThreadTabs({ ...source, projectGroups });
  // A project that drops out of the strip falls back to All without forgetting the choice.
  const projectKey = projects.some((project) => project.projectKey === storedProjectKey)
    ? storedProjectKey
    : ALL_PROJECTS;
  const shownTabs =
    projectKey === ALL_PROJECTS ? tabs : tabs.filter((tab) => tab.projectKey === projectKey);
  // Filtered to a project, the plus starts in it through the sidebar's own in-project path.
  const filteredProject = projects.find((project) => project.projectKey === projectKey) ?? null;
  const newAgentLabel = filteredProject
    ? `New agent in ${filteredProject.displayName}`
    : "New agent";
  const startNewAgent = () => {
    if (filteredProject && startSidebarThreadInProject(filteredProject.projectKey)) return;
    void startNewAgentDraft();
  };
  const fit = fitCollapsedThreadTabs({
    count: shownTabs.length,
    width: navWidth,
    activeIndex: shownTabs.findIndex((tab) => tab.threadKey === openThreadKey),
  });
  const overflowTabs = fit.overflow.flatMap((index) => shownTabs[index] ?? []);

  const statusOf = ({ thread, threadKey }: CollapsedThreadTab): TabStatus =>
    resolveSidebarV2CardStatus(thread, {
      lastVisitedAt: resolveThreadLastVisitedAt(
        thread.lastVisitedAt,
        localLastVisitedAtById[threadKey],
      ),
      wokeAt: threadWokeAt(thread, { now: nowMinute }),
    }).topStatus;
  const openThread = ({ thread }: CollapsedThreadTab) =>
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });

  return (
    <div
      data-fork-thread-tabs=""
      className={cn(
        "drag-region flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3",
        // Clears the window controls and the floating sidebar toggle.
        "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+var(--workspace-titlebar-control-gap))]",
        // The chat header's pr-24, for the same floating panel controls.
        props.reserveTrailingControls
          ? "pr-[calc(var(--workspace-gutter-end)+6rem)] wco:pr-[calc(var(--workspace-native-controls-inset)+6rem)]"
          : "pr-(--workspace-gutter-end)",
      )}
    >
      <SegmentedTabs
        aria-label="Filter threads by project"
        value={[projectKey]}
        onValueChange={(value) => {
          const next = value[0];
          if (typeof next === "string") setStoredProjectKey(next);
        }}
        className="shrink-0"
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
      {/* px-1 and py-1 keep the selected tab's glass halo inside the clip. */}
      <nav
        ref={measureNav}
        aria-label="Active threads"
        className="-mx-1 -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-1 py-1"
      >
        {shownTabs.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">No active threads</span>
        ) : null}
        {fit.visible.map((index) => {
          const tab = shownTabs[index];
          if (tab === undefined) return null;
          return (
            <ThreadTab
              key={tab.threadKey}
              tab={tab}
              active={tab.threadKey === openThreadKey}
              status={statusOf(tab)}
              canSettle={
                serverConfigs.get(tab.thread.environmentId)?.environment.capabilities
                  .threadSettlement === true
              }
              onOpen={() => openThread(tab)}
            />
          );
        })}
        {overflowTabs.length === 0 ? null : (
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`${overflowTabs.length} more active threads`}
                  className="flex h-7 w-[72px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full text-xs font-medium text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-black/5 data-popup-open:text-foreground dark:hover:bg-white/8 dark:data-popup-open:bg-white/8"
                />
              }
            >
              {overflowTabs.length} more
              <ChevronDownIcon className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end" className="max-w-72">
              {overflowTabs.map((tab) => (
                <MenuItem key={tab.threadKey} onClick={() => openThread(tab)}>
                  <SidebarV2StatusMark status={statusOf(tab)} seed={tab.threadKey} idle="dot" />
                  <span className="min-w-0 truncate">{tab.thread.title}</span>
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        )}
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
      </nav>
    </div>
  );
}

function ThreadTab(props: {
  readonly tab: CollapsedThreadTab;
  readonly active: boolean;
  readonly status: TabStatus;
  readonly canSettle: boolean;
  readonly onOpen: () => void;
}) {
  const { thread, threadKey } = props.tab;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const openMenu = (position: { x: number; y: number }) =>
    openSidebarThreadMenu(threadRef, position);
  return (
    <div
      data-fork-thread-tab=""
      data-active={props.active ? "true" : undefined}
      className={cn(
        // Shrinks from its title's width to the minimum fitCollapsedThreadTabs counts on.
        "group/tab relative flex h-7 max-w-56 min-w-[112px] shrink items-center rounded-full text-xs font-medium",
        props.active
          ? "bg-black/10 text-foreground dark:bg-white/16"
          : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button
        type="button"
        aria-current={props.active ? "page" : undefined}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={props.onOpen}
      >
        <SidebarV2StatusMark status={props.status} seed={threadKey} idle="dot" />
        {/* Fades out under the hover actions rather than sliding them in, so no tab moves. */}
        <span className="min-w-0 flex-1 truncate text-start group-focus-within/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-3.25rem),#0000_calc(100%-2.5rem))] group-hover/tab:[mask-image:linear-gradient(to_right,#000_calc(100%-3.25rem),#0000_calc(100%-2.5rem))]">
          {thread.title}
        </span>
      </button>
      <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 [@media(any-hover:none)]:hidden">
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
    </div>
  );
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
