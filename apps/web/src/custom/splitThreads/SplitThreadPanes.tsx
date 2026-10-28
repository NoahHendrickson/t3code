/**
 * The split chat column — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * ThreadRouteView hands every chat view through here, split or not, so the
 * route's ChatView keeps its tree position when a partner pane opens or
 * closes beside it. Outside a split both wrappers are `display: contents`.
 *
 * The route's thread is the focused pane and arrives as ThreadRouteView's own
 * element, so its promotion, redirects and keying stay upstream's. The other
 * pane is built here with the same element type and key rule. That keeps
 * both ChatViews mounted when focus moves, which is a URL change: pressing
 * into a pane navigates to its thread (replace), so the right panel, sidebar
 * highlight and global shortcuts follow focus with no changes of their own.
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
} from "react";

import ChatView from "~/components/ChatView";
import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { ComposerHandleContext, useComposerHandleContext } from "~/composerHandleContext";
import { threadShellHasStarted } from "~/components/ChatView.logic";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useQuietThreadShell } from "~/state/entities";
import { useEnvironmentShellStatus } from "~/state/shell";
import { buildThreadRouteParams, isThreadRouteSnapshotAuthoritative } from "~/threadRoutes";

import { SINGLE_PANE, SplitPaneContext, type SplitPaneState } from "./splitPaneContext";
import {
  EMPTY_SPLIT_PANE_SLOTS,
  assignSplitPaneSlots,
  type SplitPaneSlot,
  type SplitPaneSlots,
} from "./splitPaneSlots";
import { useSplitThreadStore, type SplitLayout } from "./splitThreadStore";

/** Below this the column is too narrow for two transcripts, so only the
    focused pane shows. The pair is kept and returns on a wider window. */
export const SPLIT_THREADS_MIN_WIDTH_QUERY = "lg";

type PaneRoute =
  | { readonly kind: "server" }
  | { readonly kind: "draft"; readonly draftId: DraftId };

/** What the unfocused pane renders, resolved the way ThreadRouteView resolves
    a route: an unsent draft until its promoted thread has started. */
function usePartnerPane(ref: ScopedThreadRef | null): {
  readonly view: ReactNode;
  readonly route: PaneRoute | null;
} {
  const shell = useQuietThreadShell(ref);
  const draftId = useComposerDraftStore((store) =>
    ref === null ? null : store.getDraftIdByRef(ref),
  );
  if (ref === null) return { view: null, route: null };
  if (draftId !== null && !threadShellHasStarted(shell)) {
    return {
      route: { kind: "draft", draftId },
      view: (
        <ChatView
          key={draftId}
          draftId={draftId}
          environmentId={ref.environmentId}
          threadId={ref.threadId}
          routeKind="draft"
          forceExpandedMobileComposer
        />
      ),
    };
  }
  if (shell === null || shell.archivedAt != null) return { view: null, route: null };
  return {
    route: { kind: "server" },
    view: (
      <ChatView
        // ThreadRouteView's key rule: a thread promoted from a draft this
        // session keeps the draft's element, so focus moving to it later
        // does not remount it.
        key={draftId ?? undefined}
        environmentId={ref.environmentId}
        threadId={ref.threadId}
        routeKind="server"
      />
    ),
  };
}

/** An unkeyed view gets one fixed key, so upstream's reuse of a single
    ChatView across server threads is unchanged while a key can be latched. */
const UNKEYED_VIEW = "chat-view";

/** The slot is the pane's identity; see splitPaneSlots. */
const PANE_SLOT_KEYS = ["slot-a", "slot-b"] as const;

function viewKey(view: ReactNode): string | null {
  return isValidElement(view) ? (view.key ?? UNKEYED_VIEW) : null;
}

function SplitPane(props: {
  readonly state: SplitPaneState;
  /** CSS order: left and right are drawn, not slotted. */
  readonly order: number;
  readonly threadRef: ScopedThreadRef | null;
  readonly route: PaneRoute | null;
  readonly children: ReactNode;
}) {
  const { state, threadRef, route } = props;
  const navigate = useNavigate();
  // ChatView takes its composer handle from the command palette's context, so
  // two panes would write one ref and each would send, attach and focus
  // through whichever composer mounted last. Each pane gives its ChatView a
  // ref of its own that never changes, since a send holds it across awaits;
  // the palette, which only reads, sees the focused pane's through a getter.
  const paletteComposerRef = useComposerHandleContext();
  const composerRef = useRef<ChatComposerHandle | null>(null);
  useLayoutEffect(() => {
    if (!state.focused || paletteComposerRef === null) return;
    Object.defineProperty(paletteComposerRef, "current", {
      configurable: true,
      get: () => composerRef.current,
      set: () => {},
    });
    return () => {
      Object.defineProperty(paletteComposerRef, "current", {
        configurable: true,
        writable: true,
        value: null,
      });
    };
  }, [paletteComposerRef, state.focused]);
  const focusPane = () => {
    if (state.focused || threadRef === null || route === null) return;
    if (route.kind === "draft") {
      void navigate({ to: "/draft/$draftId", params: { draftId: route.draftId }, replace: true });
    } else {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        replace: true,
      });
    }
  };
  const pending = state.split && !state.focused;
  return (
    <div
      data-fork-split-pane={state.split ? (state.focused ? "focused" : "background") : undefined}
      // Layout containment makes the pane the containing block for ChatView's
      // fixed-position pieces (the header's panel toggles, the Glass frost),
      // so each pane's sit on that pane rather than both on the window.
      className={
        state.split
          ? "relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col [contain:layout]"
          : "contents"
      }
      style={state.split ? { order: props.order } : undefined}
      onPointerDownCapture={pending ? focusPane : undefined}
      onFocusCapture={pending ? focusPane : undefined}
    >
      <ComposerHandleContext value={composerRef}>
        <SplitPaneContext.Provider value={state}>{props.children}</SplitPaneContext.Provider>
      </ComposerHandleContext>
    </div>
  );
}

export function SplitThreadPanes(props: {
  readonly layout: SplitLayout | null;
  readonly focusedRef: ScopedThreadRef | null;
  readonly focusedView: ReactNode;
}) {
  const { layout, focusedRef, focusedView } = props;
  const wide = useMediaQuery(SPLIT_THREADS_MIN_WIDTH_QUERY);
  const split = layout !== null && focusedRef !== null && wide;
  const leftFocused = !split || scopedThreadKey(layout.left) === scopedThreadKey(focusedRef);
  const partnerRef = !split ? null : leftFocused ? layout.right : layout.left;
  const partner = usePartnerPane(partnerRef);

  // A partner that is gone for good (deleted, archived, a discarded draft)
  // dissolves the pair; the check waits for the environment's snapshot so a
  // cold start does not mistake "not loaded yet" for "gone".
  const partnerShellStatus = useEnvironmentShellStatus(partnerRef?.environmentId ?? null);
  const partnerMissing =
    partnerRef !== null &&
    partner.route === null &&
    isThreadRouteSnapshotAuthoritative(partnerShellStatus);
  const unpair = useSplitThreadStore((state) => state.unpair);
  useEffect(() => {
    if (partnerMissing && partnerRef !== null) unpair(partnerRef);
  }, [partnerMissing, partnerRef, unpair]);

  const focusedKey = focusedRef === null ? null : scopedThreadKey(focusedRef);
  const shown: SplitPaneSlot[] = [];
  if (focusedKey !== null) shown.push({ threadKey: focusedKey, elementKey: viewKey(focusedView) });
  if (partnerRef !== null) {
    shown.push({ threadKey: scopedThreadKey(partnerRef), elementKey: viewKey(partner.view) });
  }
  const [previousSlots, setSlots] = useState<SplitPaneSlots>(EMPTY_SPLIT_PANE_SLOTS);
  const slots = assignSplitPaneSlots(previousSlots, shown);
  if (slots !== previousSlots) setSlots(slots);

  const panes = slots.map((slot, index) => {
    if (slot === null) return null;
    const focused = slot.threadKey === focusedKey;
    const view = focused ? focusedView : partner.view;
    const left = !split || slot.threadKey === scopedThreadKey(layout.left);
    const state: SplitPaneState = split ? { split: true, focused, leading: left } : SINGLE_PANE;
    return (
      <SplitPane
        key={PANE_SLOT_KEYS[index]}
        state={state}
        order={left ? 0 : 2}
        threadRef={focused ? focusedRef : partnerRef}
        route={focused ? null : partner.route}
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
      {split ? <div aria-hidden className="order-1 w-px shrink-0 bg-border" /> : null}
    </div>
  );
}
