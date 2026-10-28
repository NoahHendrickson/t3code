/**
 * Where the floating thread window sits in the chat column — see
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * The stored frame is the user's last drag or resize. It is clamped into the
 * column on every layout instead of being written back, so a window that
 * narrows for a moment does not lose the size the user chose.
 */

export interface FloatFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FloatContainer {
  readonly width: number;
  readonly height: number;
  /** The column's title bar, which the window stays below: in Electron it
      is a window-drag strip that would take presses meant for the window. */
  readonly top: number;
}

/** -1 pulls that edge toward the origin (west/north), 1 away from it, 0 leaves it. */
export interface FloatResizeEdges {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

export const FLOAT_EDGE_GAP = 12;
const MIN_SIZE = { width: 320, height: 240 } as const;
const DEFAULT_SIZE = { width: 440, height: 560 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const ceiling = (container: FloatContainer) => container.top + FLOAT_EDGE_GAP;

function clampSize(
  size: { readonly width: number; readonly height: number },
  container: FloatContainer,
) {
  return {
    width: clamp(size.width, MIN_SIZE.width, container.width - FLOAT_EDGE_GAP * 2),
    height: clamp(
      size.height,
      MIN_SIZE.height,
      container.height - FLOAT_EDGE_GAP - ceiling(container),
    ),
  };
}

function clampPosition(frame: FloatFrame, container: FloatContainer): FloatFrame {
  return {
    ...frame,
    x: clamp(frame.x, FLOAT_EDGE_GAP, container.width - FLOAT_EDGE_GAP - frame.width),
    y: clamp(frame.y, ceiling(container), container.height - FLOAT_EDGE_GAP - frame.height),
  };
}

/** A fresh window opens at the column's top right, under its title bar. */
export function resolveFloatFrame(frame: FloatFrame | null, container: FloatContainer): FloatFrame {
  const size = clampSize(frame ?? DEFAULT_SIZE, container);
  const origin = frame ?? {
    x: container.width - FLOAT_EDGE_GAP - size.width,
    y: ceiling(container),
  };
  return clampPosition({ x: origin.x, y: origin.y, ...size }, container);
}

export function moveFloatFrame(
  start: FloatFrame,
  delta: { readonly x: number; readonly y: number },
  container: FloatContainer,
): FloatFrame {
  return clampPosition({ ...start, x: start.x + delta.x, y: start.y + delta.y }, container);
}

/** The edges opposite the dragged ones stay put. */
export function resizeFloatFrame(
  start: FloatFrame,
  edges: FloatResizeEdges,
  delta: { readonly x: number; readonly y: number },
  container: FloatContainer,
): FloatFrame {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const maxWidth =
    edges.x < 0 ? right - FLOAT_EDGE_GAP : container.width - FLOAT_EDGE_GAP - start.x;
  const maxHeight =
    edges.y < 0 ? bottom - ceiling(container) : container.height - FLOAT_EDGE_GAP - start.y;
  const width = clamp(start.width + edges.x * delta.x, MIN_SIZE.width, maxWidth);
  const height = clamp(start.height + edges.y * delta.y, MIN_SIZE.height, maxHeight);
  return {
    x: edges.x < 0 ? right - width : start.x,
    y: edges.y < 0 ? bottom - height : start.y,
    width,
    height,
  };
}
