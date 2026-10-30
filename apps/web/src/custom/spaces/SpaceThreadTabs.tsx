/**
 * A space's tab row — see `.fork/customizations.yaml#fork-spaces`.
 *
 * Only under the Spaces grouping. A row of its own at the top of the chat
 * column, above each pane's header, so the tabs never share a row with the
 * header's title, panel and split controls. A single thread draws it inside
 * its chat view (ChatView); a split draws one row over both panes
 * (SplitThreadPanes), with the two threads on screen side by side as a pair.
 * A floating window keeps its own header and draws none.
 *
 * The row starts with the space's Home tab (its new-thread draft, with the
 * overview under the composer — `SpaceOverview`), then the threads opened in
 * the space ordered by status (`rankSpaceTabs`), then a plus. Each tab leads
 * with its thread's provider (`ProviderMarks.tsx`) and ends with its card's
 * status mark; its close and ⋯ buttons take no width until it is hovered or
 * focused. A tab on screen wears the sidebar's selected-row glass
 * (theme.custom.css). Which tabs are open is `spaceTabs.ts`'s business.
 *
 * The row subscribes to its own space's thread shells only, so a busy thread
 * in another project never re-renders it.
 */
import {
  AuthOrchestrationOperateScope,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { resolveRenameCommit } from "~/components/chat/ChatHeader";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useSplitThreadStore } from "~/custom/splitThreads/splitThreadStore";
import {
  filterSidebarV2VisibleThreads,
  resolveThreadLastVisitedAt,
} from "~/components/Sidebar.logic";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { cn } from "~/lib/utils";
import {
  readThreadShell,
  useProject,
  useQuietThreadShell,
  useThreadShellsForProjectRefs,
} from "~/state/entities";
import { useEnvironmentProviders } from "~/state/environments";
import { readEnvironmentScope } from "~/state/session";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { useUiStateStore } from "~/uiStateStore";
import { buildThreadRouteParams } from "~/threadRoutes";

import { EllipsisVerticalIcon, Home, PlusIcon, XIcon } from "../icons/lucide-phosphor";
import { ProviderMark } from "../icons/ProviderMarks";
import { resolveSidebarV2CardStatus } from "../sidebarV2CardStatus";
import { SidebarV2StatusMark } from "../SidebarV2StatusIndicator";
import { useSidebarV2Grouping } from "../sidebarV2ProjectGrouping";
import { useSpaceOfProject } from "./spaceProjects";
import { useOpenSpaceHome } from "./spaceHome";
import {
  closeSpaceTabs,
  neighbourAfterClose,
  openSpaceTab,
  pairSpaceTabs,
  rankSpaceTabs,
  resolveSpaceTabs,
  useSpaceTabKeys,
} from "./spaceTabs";

/** True when a view should draw the tab row: Spaces grouping, in a project. */
export function useSpaceTabsEnabled(activeProject: EnvironmentProject | null): boolean {
  const [grouping] = useSidebarV2Grouping();
  return grouping === "spaces" && activeProject !== null;
}

type ThreadShell = ReturnType<typeof useThreadShellsForProjectRefs>[number];

/** The provider a thread runs on, for its mark: its instance resolved to a
    driver, falling back to the instance id, which a default instance shares
    with its driver. */
export function useThreadProvider() {
  const providersByEnvironment = useEnvironmentProviders();
  return (shell: ThreadShell) => {
    const instanceId = shell.runtime?.providerInstanceId ?? shell.modelSelection.instanceId;
    const provider = providersByEnvironment
      .get(shell.environmentId)
      ?.find((entry) => entry.instanceId === instanceId);
    return {
      driverKind: provider?.driver ?? instanceId,
      displayName: provider?.displayName ?? instanceId,
    };
  };
}

/** A thread's status as its card draws it: the same ladder, read state and
    wake, in the cards' 14px slot. */
export function ThreadStatusMark(props: { readonly shell: ThreadShell }) {
  const { shell } = props;
  const key = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
  const localLastVisitedAt = useUiStateStore((store) => store.threadLastVisitedAtById[key]);
  return (
    <span className="flex h-[14px] shrink-0 items-center">
      <SidebarV2StatusMark
        status={
          resolveSidebarV2CardStatus(shell, {
            lastVisitedAt: resolveThreadLastVisitedAt(shell.lastVisitedAt, localLastVisitedAt),
            wokeAt: threadWokeAt(shell, { now: new Date().toISOString() }),
          }).topStatus
        }
        seed={key}
        idle="dot"
      />
    </span>
  );
}

/** The row's own height, which the Glass card starts below (theme.custom.css). */
const ROW_CLASS =
  "flex h-11 min-h-11 shrink-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]";

/** A tab's buttons take no width at rest and open as the tab is hovered or
    holds focus; always open on a coarse pointer. */
const TAB_ACTIONS_REVEAL = cn(
  "relative z-[1] grid grid-cols-[0fr] transition-[grid-template-columns] duration-150 ease-out motion-reduce:transition-none",
  "pointer-coarse:grid-cols-[1fr] group-hover/tab:grid-cols-[1fr] group-focus-within/tab:grid-cols-[1fr]",
);

const ICON_BUTTON =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const SMALL_BUTTON =
  "relative flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const NO_PROJECT_REFS: ReadonlyArray<ScopedProjectRef> = [];

const PAIR_CLASS =
  "flex min-w-0 shrink items-center gap-0.5 rounded-full bg-black/[0.04] p-0.5 dark:bg-white/[0.07]";

export function SpaceTabRow(props: {
  /** The project of the thread (or draft) on screen. */
  readonly project: EnvironmentProject;
  /** The threads on screen: the open one, and its split partner. */
  readonly selectedKeys: readonly string[];
  /** The view is the space's draft, its Home: Home is the lit tab. */
  readonly homeActive: boolean;
  /** In a split, the pane the route is on; alone, the one selected key. */
  readonly focusedKey?: string | undefined;
  /** Opens the space's Home, its draft (the plus does the same). */
  readonly onOpenHome: () => void;
  readonly className?: string | undefined;
}) {
  const navigate = useNavigate();
  const space = useSpaceOfProject(scopeProjectRef(props.project.environmentId, props.project.id));
  const shells = useThreadShellsForProjectRefs(space?.memberProjectRefs ?? NO_PROJECT_REFS);
  const [openKeys, setOpenKeys] = useSpaceTabKeys();
  const providerFor = useThreadProvider();
  const lastVisitedAtById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const { selectedKeys } = props;
  const openSpaceHome = useOpenSpaceHome();
  const onOpenHome = () =>
    space === null ? props.onOpenHome() : openSpaceHome(space.key, props.onOpenHome);
  const spaceLabel = space?.label ?? props.project.title;

  // The tabs hold what the sidebar would show (no subagents, no automation
  // runs) plus the threads on screen, whatever they are.
  const visible = new Set(filterSidebarV2VisibleThreads(shells, null));
  const threads = shells
    .map((shell) => ({
      key: scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)),
      closed: shell.settledOverride === "settled" || shell.archivedAt !== null,
      shell,
    }))
    .filter((thread) => visible.has(thread.shell) || selectedKeys.includes(thread.key));
  const resolved = resolveSpaceTabs({ openKeys, activeKeys: selectedKeys, threads });
  // Drawn by status, as each tab's mark reads it: what needs you leftmost.
  const tabs = rankSpaceTabs(
    resolved.tabs,
    (tab) =>
      resolveSidebarV2CardStatus(tab.shell, {
        lastVisitedAt: resolveThreadLastVisitedAt(
          tab.shell.lastVisitedAt,
          lastVisitedAtById[tab.key],
        ),
        wokeAt: threadWokeAt(tab.shell, { now: new Date().toISOString() }),
      }).kind,
  );

  // Store what is on screen as a tab, and drop tabs whose thread settled.
  const openable = threads
    .filter((thread) => selectedKeys.includes(thread.key) && !thread.closed)
    .map((thread) => thread.key)
    .join("\n");
  useEffect(() => {
    if (openable === "") return;
    setOpenKeys((keys) => openable.split("\n").reduce(openSpaceTab, keys));
  }, [openable, setOpenKeys]);
  const closedSignature = [...resolved.closedKeys].join("\n");
  useEffect(() => {
    if (closedSignature === "") return;
    setOpenKeys((keys) => closeSpaceTabs(keys, new Set(closedSignature.split("\n"))));
  }, [closedSignature, setOpenKeys]);

  const openTab = (key: string) => {
    const ref = parseScopedThreadKey(key);
    if (ref === null) return;
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  // Closing half of a split on screen ends the split and keeps the other
  // pane; the pair would otherwise draw the closed thread straight back.
  // Closing a lone tab on screen lands on its neighbour, else on Home.
  const closeTab = (key: string) => {
    setOpenKeys((keys) => closeSpaceTabs(keys, new Set([key])));
    if (!selectedKeys.includes(key)) return;
    const partnerKey = selectedKeys.find((selected) => selected !== key);
    if (partnerKey !== undefined) {
      const ref = parseScopedThreadKey(key);
      if (ref !== null) useSplitThreadStore.getState().unpair(ref);
      if (props.focusedKey !== key) return;
      // The partner may be in another space (docked beside), so it is read
      // from its own ref, not this space's tabs.
      const partnerRef = parseScopedThreadKey(partnerKey);
      const partnerDraftId =
        partnerRef === null ? null : useComposerDraftStore.getState().getDraftIdByRef(partnerRef);
      if (partnerRef !== null && readThreadShell(partnerRef) !== null) openTab(partnerKey);
      else if (partnerDraftId !== null) {
        void navigate({ to: "/draft/$draftId", params: { draftId: partnerDraftId } });
      } else onOpenHome();
      return;
    }
    const next = neighbourAfterClose(tabs, key);
    if (next !== null) openTab(next.key);
    else onOpenHome();
  };

  // A split of the Home and a thread pairs them at the Home's place.
  const homePartner = props.homeActive
    ? (tabs.find((tab) => selectedKeys.includes(tab.key)) ?? null)
    : null;
  const homeTab = (
    <SpaceHomeTab spaceLabel={spaceLabel} active={props.homeActive} onOpen={onOpenHome} />
  );

  const renderTab = (tab: (typeof tabs)[number], inPair: boolean) => (
    <SpaceTab
      key={tab.key}
      shell={tab.shell}
      selected={selectedKeys.includes(tab.key)}
      inPair={inPair}
      provider={providerFor(tab.shell)}
      projectCwd={props.project.workspaceRoot ?? null}
      onOpen={() => openTab(tab.key)}
      onClose={() => closeTab(tab.key)}
    />
  );

  return (
    <div
      role="tablist"
      aria-label={`${spaceLabel} tabs`}
      data-fork-space-tab-row={props.homeActive ? "draft" : "thread"}
      className={cn(ROW_CLASS, props.className)}
    >
      {homePartner === null ? (
        homeTab
      ) : (
        <div data-fork-space-tab-pair="" className={PAIR_CLASS}>
          {homeTab}
          {renderTab(homePartner, true)}
        </div>
      )}
      {pairSpaceTabs(
        tabs.filter((tab) => tab !== homePartner),
        selectedKeys,
      ).map((slot) =>
        slot.kind === "tab" ? (
          renderTab(slot.tab, false)
        ) : (
          // A split's two threads, side by side in one clear capsule.
          <div key={`pair:${slot.tabs[0].key}`} data-fork-space-tab-pair="" className={PAIR_CLASS}>
            {renderTab(slot.tabs[0], true)}
            {renderTab(slot.tabs[1], true)}
          </div>
        ),
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`New thread in ${spaceLabel}`}
              onClick={onOpenHome}
              className={ICON_BUTTON}
            />
          }
        >
          <PlusIcon aria-hidden className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">New thread in {spaceLabel}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

/** One thread's tab. Clicking opens it; double-clicking an open one renames
    it in place, as the header's title does; ⋯ opens the thread's menu. */
function SpaceTab(props: {
  readonly shell: ThreadShell;
  readonly selected: boolean;
  readonly inPair: boolean;
  readonly provider: { readonly driverKind: string; readonly displayName: string };
  readonly projectCwd: string | null;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}) {
  const { shell, selected } = props;
  const threadRef = scopeThreadRef(shell.environmentId, shell.id);
  const [renaming, setRenaming] = useState(false);
  const startRename = () => {
    if (readEnvironmentScope(shell.environmentId, AuthOrchestrationOperateScope)) setRenaming(true);
  };
  const { openMenu } = useThreadActionMenu({
    threadRef,
    projectCwd: props.projectCwd,
    onStartRename: startRename,
  });
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const commitRename = (title: string) => {
    setRenaming(false);
    const resolution = resolveRenameCommit({ title, originalTitle: shell.title });
    if (resolution.action === "reject-empty") {
      toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
      return;
    }
    if (resolution.action === "noop") return;
    void updateThreadMetadata({
      environmentId: shell.environmentId,
      input: { threadId: shell.id, title: resolution.title },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    });
  };
  return (
    <div
      role="tab"
      aria-selected={selected}
      data-fork-space-tab-selected={selected ? "" : undefined}
      className={cn(
        "group/tab relative flex h-7 min-w-0 shrink items-center gap-1.5 rounded-[10px] pe-1 ps-2.5 text-sm",
        // A pair shares the row's width, so its tabs truncate sooner.
        props.inPair ? "max-w-40 hover:max-w-48" : "max-w-48 hover:max-w-56",
        "focus-within:max-w-56",
        selected ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      {renaming ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={props.onOpen}
                onDoubleClick={selected ? startRename : undefined}
                onAuxClick={(event) => {
                  if (event.button === 1) props.onClose();
                }}
                data-fork-space-tab-hit=""
                className={cn(
                  "absolute inset-0 cursor-pointer rounded-[10px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  !selected && "hover:bg-accent/60",
                )}
              />
            }
          >
            <span className="sr-only">{shell.title}</span>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{shell.title}</TooltipPopup>
        </Tooltip>
      )}
      <span
        className={cn(
          "pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-1.5",
          !selected && "group-hover/tab:text-foreground",
        )}
      >
        <ProviderMark {...props.provider} />
        {renaming ? (
          <input
            autoFocus
            aria-label="Thread title"
            defaultValue={shell.title}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => commitRename(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenaming(false);
            }}
            className="pointer-events-auto min-w-0 flex-1 rounded-sm bg-transparent text-sm text-foreground outline-none ring-1 ring-inset ring-ring/50 focus:ring-ring"
          />
        ) : (
          <span className="min-w-0 truncate">{shell.title}</span>
        )}
        <ThreadStatusMark shell={shell} />
      </span>
      <span className={TAB_ACTIONS_REVEAL}>
        <span className="flex min-w-0 items-center gap-0.5 overflow-clip [overflow-clip-margin:4px]">
          <button
            type="button"
            aria-label={`Actions for ${shell.title}`}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className={SMALL_BUTTON}
          >
            <EllipsisVerticalIcon aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Close ${shell.title}`}
            onClick={props.onClose}
            className={SMALL_BUTTON}
          >
            <XIcon aria-hidden className="size-3" />
          </button>
        </span>
      </span>
    </div>
  );
}

/** The space's Home tab: an icon, lit on the space's draft. */
function SpaceHomeTab(props: {
  readonly spaceLabel: string;
  readonly active: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="tab"
            aria-selected={props.active}
            aria-label={`${props.spaceLabel} home`}
            onClick={() => {
              if (!props.active) props.onOpen();
            }}
            data-fork-space-tab-selected={props.active ? "" : undefined}
            data-fork-space-tab-hit={props.active ? undefined : ""}
            className={cn(
              "relative",
              ICON_BUTTON,
              props.active && "cursor-default bg-accent text-foreground hover:bg-accent",
            )}
          />
        }
      >
        <Home aria-hidden className="relative z-[1] size-4" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.spaceLabel} home</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The one row over a split's two panes (SplitThreadPanes draws it before the
 * panes, so they keep their place in the tree). The space is the focused
 * pane's; the two threads on screen sit together as a pair.
 */
export function SplitSpaceTabRow(props: {
  readonly focusedRef: ScopedThreadRef;
  readonly partnerRef: ScopedThreadRef;
  /** The focused pane is the space's draft, its Home. */
  readonly focusedIsDraft: boolean;
  /** The focused pane is the left one; the pair reads in pane order. */
  readonly focusedLeads: boolean;
  readonly className?: string | undefined;
}) {
  const focusedShell = useQuietThreadShell(props.focusedRef);
  const partnerShell = useQuietThreadShell(props.partnerRef);
  // An unsent draft in the other pane is the space's Home too.
  const partnerDraftId = useComposerDraftStore((store) => store.getDraftIdByRef(props.partnerRef));
  const partnerIsDraft = partnerShell === null && partnerDraftId !== null;
  const shell = focusedShell ?? partnerShell;
  const project = useProject(
    shell === null ? null : scopeProjectRef(shell.environmentId, shell.projectId),
  );
  const enabled = useSpaceTabsEnabled(project);
  const handleNewThread = useNewThreadHandler();
  if (!enabled || project === null) return null;
  return (
    <SpaceTabRow
      project={project}
      selectedKeys={
        props.focusedLeads
          ? [scopedThreadKey(props.focusedRef), scopedThreadKey(props.partnerRef)]
          : [scopedThreadKey(props.partnerRef), scopedThreadKey(props.focusedRef)]
      }
      homeActive={props.focusedIsDraft || partnerIsDraft}
      focusedKey={scopedThreadKey(props.focusedRef)}
      onOpenHome={() => void handleNewThread(scopeProjectRef(project.environmentId, project.id))}
      className={props.className}
    />
  );
}
