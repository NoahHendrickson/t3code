/**
 * The split chat column — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * ThreadRouteView hands every chat view through here, split or not, so the
 * route's ChatView keeps its tree position when a partner pane opens or
 * closes beside it. Outside a split both wrappers are `display: contents`.
 *
 * The route's thread arrives as ThreadRouteView's own element, so its
 * promotion and redirects stay upstream's; the slot latch (splitPaneSlots)
 * alone decides keys. Focus is a URL change: pressing into a pane navigates
 * to its thread (replace), so the right panel, sidebar highlight and global
 * shortcuts follow focus with no changes of their own.
 *
 * A floated thread is one more pane in its own slot, drawn as a window over
 * the column (floatWindow), so floating and docking move one ChatView between
 * layouts without remounting it. Pressing into it does not take the route,
 * only window-level input.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";

import ChatView from "~/components/ChatView";
import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { ComposerHandleContext, useComposerHandleContext } from "~/composerHandleContext";
import { threadShellHasStarted } from "~/components/ChatView.logic";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useQuietThreadShell } from "~/state/entities";
import { useEnvironmentShellStatus } from "~/state/shell";
import { useEnvironmentThread } from "~/state/threads";
import {
  buildThreadRouteParams,
  isThreadRouteSnapshotAuthoritative,
  resolveThreadRouteRenderState,
} from "~/threadRoutes";

import { SplitSpaceTabRow } from "~/custom/spaces/SpaceThreadTabs";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { FLOAT_WINDOW_CLASS, useDockOnPanelOpen, useFloatWindow } from "./floatWindow";
import {
  SINGLE_PANE,
  SplitPaneContext,
  type PaneWindowAction,
  type SplitPaneState,
} from "./splitPaneContext";
import {
  EMPTY_SPLIT_PANE_SLOTS,
  assignSplitPaneSlots,
  type SplitPaneSlot,
  type SplitPaneSlots,
} from "./splitPaneSlots";
import { sameThread } from "./splitThreadPairs";
import { useSplitThreadStore, type PaneRoute, type SplitLayout } from "./splitThreadStore";

/** Below this the column is too narrow for two transcripts, so only the
    focused pane shows. The pair (or float) is kept and returns on a wider window. */
const SPLIT_THREADS_MIN_WIDTH_QUERY = "lg";

/** What a pane shows for a thread that is not the route's. Whether the
    thread exists is upstream's rule (resolveThreadRouteRenderState, as
    ThreadRouteView applies it); which route it shows is the pane's own: an
    unsent draft until its promoted thread has started. Null while it loads. */
function usePaneRoute(ref: ScopedThreadRef | null): {
  readonly route: PaneRoute | null;
  readonly missing: boolean;
} {
  const shell = useQuietThreadShell(ref);
  const draftId = useComposerDraftStore((store) =>
    ref === null ? null : store.getDraftIdByRef(ref),
  );
  const shellStatus = useEnvironmentShellStatus(ref?.environmentId ?? null);
  const unlistedRef = shell === null && draftId === null ? ref : null;
  const unlistedThreadDetail = useEnvironmentThread(
    unlistedRef?.environmentId ?? null,
    unlistedRef?.threadId ?? null,
  );
  if (ref === null) return { route: null, missing: false };
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete: isThreadRouteSnapshotAuthoritative(shellStatus),
    serverThreadExists: shell !== null,
    serverThreadDeleted: shell?.deletedAt != null,
    unlistedThreadDetail,
    draftThreadExists: draftId !== null,
  });
  if (draftId !== null && !threadShellHasStarted(shell)) {
    return { route: { kind: "draft", draftId }, missing: false };
  }
  if (renderState !== "ready" && !(renderState === "loading" && shell !== null)) {
    return { route: null, missing: renderState === "missing" };
  }
  return { route: SERVER_ROUTE, missing: false };
}

const SERVER_ROUTE: PaneRoute = { kind: "server" };

/** Keys are left to the slot latch (splitPaneSlots). */
function paneView(ref: ScopedThreadRef | null, route: PaneRoute | null): ReactNode {
  if (ref === null || route === null) return null;
  return route.kind === "draft" ? (
    <ChatView
      draftId={route.draftId}
      environmentId={ref.environmentId}
      threadId={ref.threadId}
      routeKind="draft"
      forceExpandedMobileComposer
    />
  ) : (
    <ChatView environmentId={ref.environmentId} threadId={ref.threadId} routeKind="server" />
  );
}

/** An unkeyed view gets one fixed key, so upstream's reuse of a single
    ChatView across server threads is unchanged while a key can be latched. */
const UNKEYED_VIEW = "chat-view";

/** The slot is the pane's identity; see splitPaneSlots. */
const PANE_SLOT_KEYS = ["slot-a", "slot-b", "slot-c"] as const;

function viewKey(view: ReactNode): string | null {
  return isValidElement(view) ? (view.key ?? UNKEYED_VIEW) : null;
}

type ComposerRef = RefObject<ChatComposerHandle | null>;

/** Puts a pane's thread on the route (replace): how focus moves between panes. */
function navigateToPane(
  navigate: ReturnType<typeof useNavigate>,
  threadRef: ScopedThreadRef,
  route: PaneRoute,
): Promise<void> {
  return route.kind === "draft"
    ? navigate({ to: "/draft/$draftId", params: { draftId: route.draftId }, replace: true })
    : navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        replace: true,
      });
}

/** Controls that act on their own pane (close, float) must not first focus it. */
const PANE_ACTION_SELECTOR = "[data-split-pane-action]";

function SplitPane(props: {
  readonly state: SplitPaneState;
  /** CSS order: left and right are drawn, not slotted. */
  readonly order: number;
  readonly composerRef: ComposerRef;
  /** A column pane while a window floats over it: it gets a box of its own,
      as a split pane does, so the hole under the window has one to cut. */
  readonly behindFloat: boolean;
  /** A press or focus coming into the pane, before its target sees it. */
  readonly onEnter: (() => void) | null;
  readonly children: ReactNode;
}) {
  const { state, onEnter } = props;
  const {
    setElement: setFloatElement,
    style: floatStyle,
    onPointerDown: onFloatPointerDown,
    resizeHandles,
  } = useFloatWindow(state.floating);
  const enter =
    onEnter === null
      ? undefined
      : (event: SyntheticEvent) => {
          if (event.target instanceof Element && event.target.closest(PANE_ACTION_SELECTOR)) return;
          onEnter();
        };
  return (
    <div
      ref={setFloatElement}
      data-fork-split-pane={
        state.floating
          ? "floating"
          : state.split
            ? state.focused
              ? "focused"
              : "background"
            : undefined
      }
      // The floating window's look (Glass: theme.custom.palettes.css, the
      // rest: theme.custom.css) and its header's drag strip live in CSS.
      data-fork-float-behind={props.behindFloat || undefined}
      // Layout containment makes the pane the containing block for ChatView's
      // fixed-position pieces (the header's panel toggles, the Glass frost),
      // so each pane's sit on that pane rather than both on the window.
      className={
        state.floating
          ? FLOAT_WINDOW_CLASS
          : state.split || props.behindFloat
            ? "relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col [contain:layout]"
            : "contents"
      }
      style={state.floating ? floatStyle : state.split ? { order: props.order } : undefined}
      onPointerDown={state.floating ? onFloatPointerDown : undefined}
      onPointerDownCapture={enter}
      onFocusCapture={enter}
    >
      <ComposerHandleContext value={props.composerRef}>
        <SplitPaneContext.Provider value={state}>{props.children}</SplitPaneContext.Provider>
      </ComposerHandleContext>
      {state.floating ? resizeHandles : null}
    </div>
  );
}

export function SplitThreadPanes(props: {
  readonly layout: SplitLayout | null;
  readonly focusedRef: ScopedThreadRef | null;
  /** The route's draft, or null on a thread's own route. */
  readonly focusedDraftId: DraftId | null;
  readonly focusedView: ReactNode;
}) {
  const { layout, focusedRef, focusedDraftId, focusedView } = props;
  const wide = useMediaQuery(SPLIT_THREADS_MIN_WIDTH_QUERY);
  const navigate = useNavigate();
  // ChatView takes its composer handle from the command palette's context, so
  // two panes sharing it would send, attach and focus through whichever
  // composer mounted last. Each slot gives its ChatView a ref of its own that
  // never changes (a send holds it across awaits), and the palette, which only
  // reads its ref, is pointed once at whichever slot is focused.
  const paletteComposerRef = useComposerHandleContext();
  // One statement per ref: React Compiler caches an array literal on first
  // render, hook calls and all, so later renders would skip the useRefs.
  const firstSlotComposerRef = useRef<ChatComposerHandle | null>(null);
  const secondSlotComposerRef = useRef<ChatComposerHandle | null>(null);
  const thirdSlotComposerRef = useRef<ChatComposerHandle | null>(null);
  const slotComposerRefs = [firstSlotComposerRef, secondSlotComposerRef, thirdSlotComposerRef];
  const focusedSlotRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (paletteComposerRef === null) return;
    const refs = slotComposerRefs;
    // A write from outside the panes is kept, and read when no slot is focused.
    let assigned = paletteComposerRef.current;
    Object.defineProperty(paletteComposerRef, "current", {
      configurable: true,
      get: () => {
        const slot = focusedSlotRef.current;
        return (slot === null ? null : refs[slot]?.current) ?? assigned;
      },
      set: (value: ChatComposerHandle | null) => {
        assigned = value;
      },
    });
    return () => {
      Object.defineProperty(paletteComposerRef, "current", {
        configurable: true,
        writable: true,
        value: assigned,
      });
    };
    // The slot refs are stable for this component's life.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [paletteComposerRef]);

  const focusedKey = focusedRef === null ? null : scopedThreadKey(focusedRef);
  const focusedRoute: PaneRoute =
    focusedDraftId === null ? SERVER_ROUTE : { kind: "draft", draftId: focusedDraftId };
  const arrive = useSplitThreadStore((state) => state.arrive);
  // A draft's route ref is rebuilt every render; arrive ignores a repeat.
  useEffect(() => {
    if (focusedRef === null) return;
    arrive({
      ref: focusedRef,
      route: focusedDraftId === null ? SERVER_ROUTE : { kind: "draft", draftId: focusedDraftId },
    });
  }, [arrive, focusedRef, focusedDraftId]);

  const split = layout !== null && focusedRef !== null && wide;
  const leftFocused = !split || scopedThreadKey(layout.left) === scopedThreadKey(focusedRef);
  const partnerRef = !split ? null : leftFocused ? layout.right : layout.left;
  const partner = usePaneRoute(partnerRef);
  const partnerView = paneView(partnerRef, partner.route);

  const storedFloatingRef = useSplitThreadStore((state) => state.floating);
  const pendingFloat = useSplitThreadStore((state) => state.pendingFloat);
  // The route's thread floats from the render the route leaves it, before
  // the arrival is stored; see floatOnLeave.
  const floatingRef =
    pendingFloat !== null && !sameThread(pendingFloat, focusedRef)
      ? pendingFloat
      : storedFloatingRef;
  const floatShown =
    wide &&
    focusedRef !== null &&
    floatingRef !== null &&
    !sameThread(floatingRef, focusedRef) &&
    !sameThread(floatingRef, partnerRef);
  const floating = usePaneRoute(floatShown ? floatingRef : null);
  const floatingView = paneView(floatShown ? floatingRef : null, floating.route);
  const floatingKey = floatShown ? scopedThreadKey(floatingRef) : null;

  // Where the column goes when its own thread floats away, if it still exists.
  const routePrevious = useSplitThreadStore((state) => state.routePrevious);
  const behindRef =
    wide && !split && routePrevious !== null && !sameThread(routePrevious.ref, focusedRef)
      ? routePrevious.ref
      : null;
  const behind = usePaneRoute(behindRef);

  // A pane gone for good (deleted, or a discarded draft) dissolves its pair,
  // and a floated one closes its window. "missing" waits for the
  // environment's snapshot, so a cold start does not mistake "not loaded
  // yet" for "gone".
  const partnerMissing = partner.missing;
  const floatingMissing = floating.missing;
  const unpair = useSplitThreadStore((state) => state.unpair);
  const pair = useSplitThreadStore((state) => state.pair);
  const floatThread = useSplitThreadStore((state) => state.float);
  const floatOnLeave = useSplitThreadStore((state) => state.floatOnLeave);
  const unfloat = useSplitThreadStore((state) => state.unfloat);
  useEffect(() => {
    if (partnerMissing && partnerRef !== null) unpair(partnerRef);
  }, [partnerMissing, partnerRef, unpair]);
  useEffect(() => {
    if (floatingMissing) unfloat();
  }, [floatingMissing, unfloat]);

  // A press in the floating window gives it window-level input until a press
  // back in the column, or until either side changes thread.
  const [floatInput, setFloatInput] = useState<{
    readonly floatKey: string;
    readonly routeKey: string;
  } | null>(null);
  const floatOwnsInput =
    floatingKey !== null &&
    floatInput?.floatKey === floatingKey &&
    floatInput.routeKey === focusedKey;
  const dockFloat =
    floatShown && focusedRef !== null && floatingRef !== null
      ? () => pair(focusedRef, floatingRef)
      : null;
  useDockOnPanelOpen(floatOwnsInput ? floatingRef : null, () => dockFloat?.());

  /** Floating a started pane's thread (a draft's promotion runs on its
      route, which the window never holds). The background pane of a split
      floats at once. The route's own thread floats once the route has moved
      to the split partner, or alone, back to the previous thread. */
  const floatAction = (
    paneRef: ScopedThreadRef | null,
    paneRoute: PaneRoute | null,
    holdsRoute: boolean,
  ): PaneWindowAction | null => {
    if (!wide || paneRef === null || paneRoute?.kind !== "server") return null;
    if (split && !holdsRoute) return { kind: "float", run: () => floatThread(paneRef) };
    const [targetRef, targetRoute] = split
      ? [partnerRef, partner.route]
      : [behindRef, behind.route];
    if (targetRef === null || targetRoute === null) return null;
    return {
      kind: "float",
      run: () => {
        floatOnLeave(paneRef);
        void navigateToPane(navigate, targetRef, targetRoute);
      },
    };
  };

  const shown: SplitPaneSlot[] = [];
  if (focusedKey !== null) shown.push({ threadKey: focusedKey, elementKey: viewKey(focusedView) });
  if (partnerRef !== null) {
    shown.push({ threadKey: scopedThreadKey(partnerRef), elementKey: viewKey(partnerView) });
  }
  if (floatingKey !== null) {
    shown.push({ threadKey: floatingKey, elementKey: viewKey(floatingView) });
  }
  const [previousSlots, setSlots] = useState<SplitPaneSlots>(EMPTY_SPLIT_PANE_SLOTS);
  const slots = assignSplitPaneSlots(previousSlots, shown);
  if (slots !== previousSlots) setSlots(slots);
  const inputKey = floatOwnsInput ? floatingKey : focusedKey;
  const inputSlot = slots.findIndex((slot) => slot !== null && slot.threadKey === inputKey);
  useLayoutEffect(() => {
    focusedSlotRef.current = inputSlot === -1 ? null : inputSlot;
  }, [inputSlot]);

  const panes = slots.map((slot, index) => {
    if (slot === null) return null;
    const holdsRoute = slot.threadKey === focusedKey;
    const isFloating = !holdsRoute && slot.threadKey === floatingKey;
    const view = holdsRoute ? focusedView : isFloating ? floatingView : partnerView;
    const paneRef = holdsRoute ? focusedRef : isFloating ? floatingRef : partnerRef;
    const left = !split || slot.threadKey === scopedThreadKey(layout.left);
    let state: SplitPaneState;
    let onEnter: (() => void) | null;
    if (isFloating) {
      state = {
        ...SINGLE_PANE,
        focused: floatOwnsInput,
        leading: false,
        floating: true,
        windowAction: dockFloat === null ? null : { kind: "dock", run: dockFloat },
      };
      onEnter =
        floatOwnsInput || floatingKey === null || focusedKey === null
          ? null
          : () => setFloatInput({ floatKey: floatingKey, routeKey: focusedKey });
    } else {
      const focused = holdsRoute && !floatOwnsInput;
      const paneRoute = holdsRoute ? focusedRoute : partner.route;
      const windowAction = floatAction(paneRef, paneRoute, holdsRoute);
      state = split
        ? {
            ...SINGLE_PANE,
            split: true,
            focused,
            leading: left,
            canSplit: true,
            focusPartner: async () => {
              if (!holdsRoute) return true;
              if (partnerRef === null || partner.route === null) return false;
              await navigateToPane(navigate, partnerRef, partner.route);
              return true;
            },
            windowAction,
          }
        : { ...SINGLE_PANE, focused, canSplit: wide, windowAction };
      onEnter = !holdsRoute
        ? paneRef === null || paneRoute === null
          ? null
          : () => void navigateToPane(navigate, paneRef, paneRoute)
        : floatOwnsInput
          ? () => setFloatInput(null)
          : null;
    }
    return (
      <SplitPane
        key={PANE_SLOT_KEYS[index]}
        state={state}
        order={left ? 0 : 2}
        composerRef={slotComposerRefs[index] ?? firstSlotComposerRef}
        behindFloat={floatShown && !isFloating}
        onEnter={onEnter}
      >
        {isValidElement(view) && slot.elementKey !== null
          ? cloneElement(view, { key: slot.elementKey })
          : view}
      </SplitPane>
    );
  });
  return (
    <>
      {/* fork-spaces: one tab row over both panes. Drawn as a sibling before
          the panes, never around them, so they keep their place in the tree
          as a split opens and closes; a single pane draws its own row inside
          its chat view instead. */}
      {split && partnerRef !== null ? (
        <SplitSpaceTabRow
          focusedRef={focusedRef}
          partnerRef={partnerRef}
          focusedIsDraft={focusedDraftId !== null}
          focusedLeads={leftFocused}
          className={cn(
            "px-3 sm:px-5",
            isElectron && "drag-region",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        />
      ) : null}
      <div
        data-fork-split-threads={split ? "" : undefined}
        className={split ? "flex min-h-0 flex-1 flex-row" : "contents"}
      >
        {panes}
        {split ? (
          <div
            aria-hidden
            data-fork-float-behind={floatShown || undefined}
            className="order-1 w-px shrink-0 bg-border"
          />
        ) : null}
      </div>
    </>
  );
}
