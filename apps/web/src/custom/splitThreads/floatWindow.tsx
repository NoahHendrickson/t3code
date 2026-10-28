/**
 * The floating window's gestures and Glass hole — see
 * `.fork/customizations.yaml#fork-split-threads`.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "~/terminalUiStateStore";

import {
  moveFloatFrame,
  resizeFloatFrame,
  resolveFloatFrame,
  type FloatContainer,
  type FloatFrame,
  type FloatResizeEdges,
} from "./floatFrame";
import { useSplitThreadStore } from "./splitThreadStore";

/** ChatView's title header drags the window, except where a control sits. */
const DRAG_HANDLE_SELECTOR = "[data-chat-header]";
const HEADER_CONTROL_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [role='menuitem'], [contenteditable='true']";

/** The window's own class: the header shows it can be dragged. */
export const FLOAT_WINDOW_CLASS =
  "absolute z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border shadow-2xl [contain:layout] [&_[data-chat-header]]:cursor-grab";

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
    per pointer move. The hook stays mounted in every pane, so the wrapper
    element survives a float or dock. */
export function useFloatWindow(active: boolean) {
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
  // Keyed on the numbers: the frame is a fresh object every render, and
  // measuring forces a layout.
  const frameX = frame?.x;
  const frameY = frame?.y;
  const frameWidth = frame?.width;
  const frameHeight = frame?.height;
  useLayoutEffect(() => {
    const parent = element?.offsetParent;
    if (
      frameX === undefined ||
      frameY === undefined ||
      frameWidth === undefined ||
      frameHeight === undefined ||
      !(parent instanceof HTMLElement)
    ) {
      return;
    }
    cutFloatHoles(measureFloatBehind(parent), {
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
    });
  }, [element, frameX, frameY, frameWidth, frameHeight]);

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
        target.closest(DRAG_HANDLE_SELECTOR) === null ||
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

/** The window has no room for the right panel or the terminal, so opening
    either while the user works in it (a diff link, a file, a shortcut) docks
    it beside the column, where they show. `floatRef` is null while the
    column has the user's attention: a panel opening for the floated thread
    then waits, shut, until it docks. */
export function useDockOnPanelOpen(floatRef: ScopedThreadRef | null, dock: () => void) {
  const dockRef = useRef(dock);
  useLayoutEffect(() => {
    dockRef.current = dock;
  });
  useEffect(() => {
    if (floatRef === null) return;
    const unsubscribePanel = useRightPanelStore.subscribe((next, previous) => {
      const now = selectThreadRightPanelState(next.byThreadKey, floatRef);
      const before = selectThreadRightPanelState(previous.byThreadKey, floatRef);
      if (now.isOpen && (!before.isOpen || now.activeSurfaceId !== before.activeSurfaceId)) {
        dockRef.current();
      }
    });
    const unsubscribeTerminal = useTerminalUiStateStore.subscribe((next, previous) => {
      const now = selectThreadTerminalUiState(next.terminalUiStateByThreadKey, floatRef);
      const before = selectThreadTerminalUiState(previous.terminalUiStateByThreadKey, floatRef);
      if (now.terminalOpen && !before.terminalOpen) dockRef.current();
    });
    return () => {
      unsubscribePanel();
      unsubscribeTerminal();
    };
  }, [floatRef]);
}
