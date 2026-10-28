/**
 * The split chat column — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * ThreadRouteView hands every chat view through here, split or not, so the
 * route's ChatView keeps its tree position when a partner pane opens or
 * closes beside it. Outside a split both wrappers are `display: contents`.
 *
 * The route's thread is the focused pane and arrives as ThreadRouteView's own
 * element, so its promotion and redirects stay upstream's; the slot latch
 * (splitPaneSlots) alone decides keys. Focus is a URL change: pressing into a
 * pane navigates to its thread (replace), so the right panel, sidebar
 * highlight and global shortcuts follow focus with no changes of their own.
 *
 * A floated thread is one more pane in its own slot, drawn as a window over
 * the column, so floating and docking move one ChatView between layouts
 * without remounting it. Pressing into it does not take the route.
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
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";

import ChatView from "~/components/ChatView";
import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { ComposerHandleContext, useComposerHandleContext } from "~/composerHandleContext";
import { threadShellHasStarted } from "~/components/ChatView.logic";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { useQuietThreadShell } from "~/state/entities";
import { useEnvironmentShellStatus } from "~/state/shell";
import { useEnvironmentThread } from "~/state/threads";
import {
  buildThreadRouteParams,
  isThreadRouteSnapshotAuthoritative,
  resolveThreadRouteRenderState,
} from "~/threadRoutes";

import {
  moveFloatFrame,
  resizeFloatFrame,
  resolveFloatFrame,
  type FloatContainer,
  type FloatFrame,
  type FloatResizeEdges,
} from "./floatFrame";
import { SINGLE_PANE, SplitPaneContext, type SplitPaneState } from "./splitPaneContext";
import {
  EMPTY_SPLIT_PANE_SLOTS,
  assignSplitPaneSlots,
  type SplitPaneSlot,
  type SplitPaneSlots,
} from "./splitPaneSlots";
import {
  noteRouteThread,
  useRouteThreadHistoryStore,
  useSplitThreadStore,
  type PaneRoute,
  type SplitLayout,
} from "./splitThreadStore";

/** Below this the column is too narrow for two transcripts, so only the
    focused pane shows. The pair (or float) is kept and returns on a wider window. */
const SPLIT_THREADS_MIN_WIDTH_QUERY = "lg";

/** What the unfocused pane renders. Whether its thread exists is upstream's
    rule (resolveThreadRouteRenderState, as ThreadRouteView applies it); which
    route it shows is the pane's own: an unsent draft until its promoted thread
    has started. Keys are left to the slot latch (splitPaneSlots). */
function usePartnerPane(ref: ScopedThreadRef | null): {
  readonly view: ReactNode;
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
  if (ref === null) return { view: null, route: null, missing: false };
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete: isThreadRouteSnapshotAuthoritative(shellStatus),
    serverThreadExists: shell !== null,
    serverThreadDeleted: shell?.deletedAt != null,
    unlistedThreadDetail,
    draftThreadExists: draftId !== null,
  });
  if (draftId !== null && !threadShellHasStarted(shell)) {
    return {
      route: { kind: "draft", draftId },
      missing: false,
      view: (
        <ChatView
          draftId={draftId}
          environmentId={ref.environmentId}
          threadId={ref.threadId}
          routeKind="draft"
          forceExpandedMobileComposer
        />
      ),
    };
  }
  if (renderState !== "ready" && !(renderState === "loading" && shell !== null)) {
    return { view: null, route: null, missing: renderState === "missing" };
  }
  return {
    route: { kind: "server" },
    missing: false,
    view: <ChatView environmentId={ref.environmentId} threadId={ref.threadId} routeKind="server" />,
  };
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

const sameThread = (a: ScopedThreadRef | null, b: ScopedThreadRef | null) =>
  a !== null && b !== null && scopedThreadKey(a) === scopedThreadKey(b);

/** Controls that act on their own pane (close, float) must not first focus it. */
const PANE_ACTION_SELECTOR = "[data-split-pane-action]";
/** The header drags the floating window, except where a control sits. */
const HEADER_CONTROL_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [role='menuitem'], [contenteditable='true']";

/** Edges and corners. The window's rounded clip also clips hit-testing, so
    the corners are big enough to reach in past the curve. */
const RESIZE_HANDLES: readonly { readonly edges: FloatResizeEdges; readonly className: string }[] =
  [
    { edges: { x: 0, y: -1 }, className: "inset-x-4 top-0 h-1.5 cursor-ns-resize" },
    { edges: { x: 0, y: 1 }, className: "inset-x-4 bottom-0 h-1.5 cursor-ns-resize" },
    { edges: { x: -1, y: 0 }, className: "inset-y-4 left-0 w-1.5 cursor-ew-resize" },
    { edges: { x: 1, y: 0 }, className: "inset-y-4 right-0 w-1.5 cursor-ew-resize" },
    { edges: { x: -1, y: -1 }, className: "top-0 left-0 size-4 cursor-nwse-resize" },
    { edges: { x: 1, y: -1 }, className: "top-0 right-0 size-4 cursor-nesw-resize" },
    { edges: { x: -1, y: 1 }, className: "bottom-0 left-0 size-4 cursor-nesw-resize" },
    { edges: { x: 1, y: 1 }, className: "bottom-0 right-0 size-4 cursor-nwse-resize" },
  ];

type FloatBehind = readonly {
  readonly el: HTMLElement;
  readonly left: number;
  readonly top: number;
}[];

/** On Glass the window shows the stage through it, as the docked details
    card does, so nothing of the column may paint under it. Each pane behind
    it gets the window's frame in its own coordinates as custom properties,
    which theme.custom.palettes.css turns into a rounded hole on Glass only.
    Offsets are read once per layout or gesture, so a drag only writes. */
function measureFloatBehind(parent: HTMLElement): FloatBehind {
  const origin = parent.getBoundingClientRect();
  return [...parent.querySelectorAll<HTMLElement>("[data-fork-float-behind]")].map((el) => {
    const box = el.getBoundingClientRect();
    return { el, left: box.left - origin.left, top: box.top - origin.top };
  });
}

function cutFloatHoles(behind: FloatBehind, frame: FloatFrame) {
  for (const { el, left, top } of behind) {
    el.style.setProperty("--fork-float-hole-x", `${frame.x - left}px`);
    el.style.setProperty("--fork-float-hole-y", `${frame.y - top}px`);
    el.style.setProperty("--fork-float-hole-w", `${frame.width}px`);
    el.style.setProperty("--fork-float-hole-h", `${frame.height}px`);
  }
}

/** The floating window's frame in the column (its offset parent), clamped on
    every layout. A drag or resize writes the element's style directly and
    stores the frame once, on release, so the ChatView inside never re-renders
    per pointer move. */
function useFloatWindow(active: boolean) {
  const storedFrame = useSplitThreadStore((state) => state.floatFrame);
  const setFloatFrame = useSplitThreadStore((state) => state.setFloatFrame);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<FloatContainer | null>(null);
  useLayoutEffect(() => {
    const parent = active ? element?.offsetParent : null;
    if (!(parent instanceof HTMLElement)) return;
    const read = () =>
      setContainer({
        width: parent.clientWidth,
        height: parent.clientHeight,
        top:
          Number.parseFloat(
            getComputedStyle(parent).getPropertyValue("--workspace-topbar-height"),
          ) || 0,
      });
    read();
    return observeResize(parent, read);
  }, [active, element]);
  const frame = active && container ? resolveFloatFrame(storedFrame, container) : null;
  useLayoutEffect(() => {
    const parent = element?.offsetParent;
    if (frame !== null && parent instanceof HTMLElement) {
      cutFloatHoles(measureFloatBehind(parent), frame);
    }
  }, [element, frame]);

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    next: (
      start: FloatFrame,
      delta: { x: number; y: number },
      bounds: FloatContainer,
    ) => FloatFrame,
  ) => {
    if (element === null || frame === null || container === null || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY };
    const parent = element.offsetParent;
    const behind = parent instanceof HTMLElement ? measureFloatBehind(parent) : [];
    let latest = frame;
    const onMove = (move: PointerEvent) => {
      latest = next(frame, { x: move.clientX - origin.x, y: move.clientY - origin.y }, container);
      element.style.left = `${latest.x}px`;
      element.style.top = `${latest.y}px`;
      element.style.width = `${latest.width}px`;
      element.style.height = `${latest.height}px`;
      cutFloatHoles(behind, latest);
    };
    const onEnd = (end: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
      // The release's own position settles the frame: under load Chromium
      // coalesces moves, and the up can arrive before the last of them. A
      // cancel carries no position, so it keeps the last move.
      if (end.type === "pointerup") onMove(end);
      setFloatFrame(latest);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };

  const style: CSSProperties | undefined = !active
    ? undefined
    : frame === null
      ? { visibility: "hidden" }
      : { left: frame.x, top: frame.y, width: frame.width, height: frame.height };
  return {
    setElement,
    style,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest("header") === null ||
        target.closest(HEADER_CONTROL_SELECTOR) !== null
      ) {
        return;
      }
      beginGesture(event, moveFloatFrame);
    },
    resizeHandles: RESIZE_HANDLES.map((handle) => (
      <div
        key={handle.className}
        aria-hidden
        className={cn("absolute z-[60]", handle.className)}
        onPointerDown={(event) =>
          beginGesture(event, (start, delta, bounds) =>
            resizeFloatFrame(start, handle.edges, delta, bounds),
          )
        }
      />
    )),
  };
}

function SplitPane(props: {
  readonly state: SplitPaneState;
  /** CSS order: left and right are drawn, not slotted. */
  readonly order: number;
  readonly threadRef: ScopedThreadRef | null;
  readonly route: PaneRoute | null;
  readonly composerRef: ComposerRef;
  /** A column pane while a window floats over it: it gets a box of its own,
      as a split pane does, so the hole under the window has one to cut. */
  readonly behindFloat: boolean;
  readonly children: ReactNode;
}) {
  const { state, threadRef, route } = props;
  const navigate = useNavigate();
  const {
    setElement: setFloatElement,
    style: floatStyle,
    onPointerDown: onFloatPointerDown,
    resizeHandles,
  } = useFloatWindow(state.floating);
  const focusPane = (event: SyntheticEvent) => {
    if (state.focused || threadRef === null || route === null) return;
    if (event.target instanceof Element && event.target.closest(PANE_ACTION_SELECTOR)) return;
    void navigateToPane(navigate, threadRef, route);
  };
  const pending = state.split && !state.focused;
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
          ? "absolute z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border shadow-2xl [contain:layout] [&_header]:cursor-grab"
          : state.split || props.behindFloat
            ? "relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col [contain:layout]"
            : "contents"
      }
      style={state.floating ? floatStyle : state.split ? { order: props.order } : undefined}
      onPointerDown={state.floating ? onFloatPointerDown : undefined}
      onPointerDownCapture={pending ? focusPane : undefined}
      onFocusCapture={pending ? focusPane : undefined}
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
  readonly focusedRoute: PaneRoute | null;
  readonly focusedView: ReactNode;
}) {
  const { layout, focusedRef, focusedRoute, focusedView } = props;
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

  // The column falls back to the route's previous thread when its own floats.
  // noteRouteThread ignores a repeat, so this may run on every render.
  const focusedKey = focusedRef === null ? null : scopedThreadKey(focusedRef);
  useEffect(() => {
    if (focusedRef !== null && focusedRoute !== null) {
      noteRouteThread({ ref: focusedRef, route: focusedRoute });
    }
  }, [focusedRef, focusedRoute]);
  const previousRouteThread = useRouteThreadHistoryStore((state) => state.previous);

  const split = layout !== null && focusedRef !== null && wide;
  const leftFocused = !split || scopedThreadKey(layout.left) === scopedThreadKey(focusedRef);
  const partnerRef = !split ? null : leftFocused ? layout.right : layout.left;
  const partner = usePartnerPane(partnerRef);

  const floatingRef = useSplitThreadStore((state) => state.floating);
  const floatShown =
    wide &&
    focusedRef !== null &&
    floatingRef !== null &&
    !sameThread(floatingRef, focusedRef) &&
    !sameThread(floatingRef, partnerRef);
  const floating = usePartnerPane(floatShown ? floatingRef : null);

  // A partner that is gone for good (deleted, or a discarded draft) dissolves
  // the pair, and a floated one closes its window. "missing" waits for the
  // environment's snapshot, so a cold start does not mistake "not loaded yet"
  // for "gone".
  const partnerMissing = partner.missing;
  const floatingMissing = floating.missing;
  const unpair = useSplitThreadStore((state) => state.unpair);
  const pair = useSplitThreadStore((state) => state.pair);
  const floatThread = useSplitThreadStore((state) => state.float);
  const unfloat = useSplitThreadStore((state) => state.unfloat);
  useEffect(() => {
    if (partnerMissing && partnerRef !== null) unpair(partnerRef);
  }, [partnerMissing, partnerRef, unpair]);
  useEffect(() => {
    if (floatingMissing) unfloat();
  }, [floatingMissing, unfloat]);
  // Opening the floated thread in the column ends its float, so leaving it
  // later does not pop it back up. Only arriving counts: floating the route's
  // own thread holds it on the route for a render before the column moves.
  const arrivedKeyRef = useRef(focusedKey);
  useEffect(() => {
    const arrived = arrivedKeyRef.current !== focusedKey;
    arrivedKeyRef.current = focusedKey;
    if (arrived && sameThread(floatingRef, focusedRef)) unfloat();
  }, [focusedKey, floatingRef, focusedRef, unfloat]);

  /** Floating a pane's thread. In a split the column keeps the partner: from
      the focused pane the route moves there first, so the thread floats out
      of the background slot it already holds. Alone, it floats first and the
      route goes back to the previous thread, so its ChatView never leaves its
      slot. */
  const floatAction = (paneRef: ScopedThreadRef | null, paneFocused: boolean) => {
    if (!wide || paneRef === null) return null;
    if (split) {
      if (!paneFocused) return () => floatThread(paneRef);
      if (partnerRef === null || partner.route === null) return null;
      const partnerRoute = partner.route;
      return () => {
        void navigateToPane(navigate, partnerRef, partnerRoute).then(() => floatThread(paneRef));
      };
    }
    const behind = previousRouteThread;
    if (behind === null || sameThread(behind.ref, paneRef)) return null;
    return () => {
      floatThread(paneRef);
      void navigateToPane(navigate, behind.ref, behind.route);
    };
  };

  const floatingKey = floatShown ? scopedThreadKey(floatingRef) : null;
  const shown: SplitPaneSlot[] = [];
  if (focusedKey !== null) shown.push({ threadKey: focusedKey, elementKey: viewKey(focusedView) });
  if (partnerRef !== null) {
    shown.push({ threadKey: scopedThreadKey(partnerRef), elementKey: viewKey(partner.view) });
  }
  if (floatingKey !== null) {
    shown.push({ threadKey: floatingKey, elementKey: viewKey(floating.view) });
  }
  const [previousSlots, setSlots] = useState<SplitPaneSlots>(EMPTY_SPLIT_PANE_SLOTS);
  const slots = assignSplitPaneSlots(previousSlots, shown);
  if (slots !== previousSlots) setSlots(slots);
  const focusedSlot = slots.findIndex((slot) => slot !== null && slot.threadKey === focusedKey);
  useLayoutEffect(() => {
    focusedSlotRef.current = focusedSlot === -1 ? null : focusedSlot;
  }, [focusedSlot]);

  const panes = slots.map((slot, index) => {
    if (slot === null) return null;
    const focused = slot.threadKey === focusedKey;
    const isFloating = !focused && slot.threadKey === floatingKey;
    const view = focused ? focusedView : isFloating ? floating.view : partner.view;
    const paneRef = focused ? focusedRef : isFloating ? floatingRef : partnerRef;
    const left = !split || slot.threadKey === scopedThreadKey(layout.left);
    const state: SplitPaneState = isFloating
      ? {
          ...SINGLE_PANE,
          focused: false,
          leading: false,
          floating: true,
          dock: () => {
            if (focusedRef !== null && floatingRef !== null) pair(focusedRef, floatingRef);
          },
        }
      : split
        ? {
            ...SINGLE_PANE,
            split: true,
            focused,
            leading: left,
            canSplit: true,
            focusPartner: async () => {
              if (focused && partnerRef !== null && partner.route !== null) {
                await navigateToPane(navigate, partnerRef, partner.route);
              }
            },
            float: floatAction(paneRef, focused),
          }
        : { ...SINGLE_PANE, canSplit: wide, float: floatAction(paneRef, true) };
    return (
      <SplitPane
        key={PANE_SLOT_KEYS[index]}
        state={state}
        order={left ? 0 : 2}
        threadRef={paneRef}
        route={focused ? null : isFloating ? floating.route : partner.route}
        composerRef={slotComposerRefs[index] ?? firstSlotComposerRef}
        behindFloat={floatShown && !isFloating}
      >
        {isValidElement(view) && slot.elementKey !== null
          ? cloneElement(view, { key: slot.elementKey })
          : view}
      </SplitPane>
    );
  });
  return (
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
  );
}
