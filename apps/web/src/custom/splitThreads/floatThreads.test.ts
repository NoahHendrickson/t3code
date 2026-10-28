import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { FLOAT_EDGE_GAP, moveFloatFrame, resizeFloatFrame, resolveFloatFrame } from "./floatFrame";
import { findSplitPair } from "./splitThreadPairs";
import {
  noteRouteThread,
  useRouteThreadHistoryStore,
  useSplitThreadStore,
} from "./splitThreadStore";

const ref = (id: string) => scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id));
const column = { width: 1000, height: 800, top: 52 };

describe("float frame", () => {
  it("opens at the column's top right, under its title bar", () => {
    const fresh = resolveFloatFrame(null, column);
    expect(fresh.x + fresh.width).toBe(column.width - FLOAT_EDGE_GAP);
    expect(fresh.y).toBe(column.top + FLOAT_EDGE_GAP);
  });

  it("clamps a stored frame into the column instead of losing it", () => {
    const stored = { x: 900, y: 700, width: 440, height: 560 };
    expect(resolveFloatFrame(stored, column)).toEqual({
      x: column.width - FLOAT_EDGE_GAP - 440,
      y: column.height - FLOAT_EDGE_GAP - 560,
      width: 440,
      height: 560,
    });
  });

  it("drags without leaving the column or reaching its title bar", () => {
    const start = resolveFloatFrame(null, column);
    const downLeft = moveFloatFrame(start, { x: -5000, y: 5000 }, column);
    expect(downLeft.x).toBe(FLOAT_EDGE_GAP);
    expect(downLeft.y + downLeft.height).toBe(column.height - FLOAT_EDGE_GAP);
    expect(moveFloatFrame(start, { x: 0, y: -5000 }, column).y).toBe(column.top + FLOAT_EDGE_GAP);
  });

  it("resizes from a corner or an edge while the opposite sides stay put", () => {
    const start = { x: 400, y: 100, width: 440, height: 560 };
    expect(resizeFloatFrame(start, { x: -1, y: 1 }, { x: -100, y: 50 }, column)).toEqual({
      x: 300,
      y: 100,
      width: 540,
      height: 610,
    });
    // An edge moves one axis only.
    expect(resizeFloatFrame(start, { x: 1, y: 0 }, { x: -60, y: 300 }, column)).toEqual({
      ...start,
      width: 380,
    });
    // Never below the minimum, and the far corner does not drift.
    const shrunk = resizeFloatFrame(start, { x: -1, y: -1 }, { x: 1000, y: 1000 }, column);
    expect(shrunk.x + shrunk.width).toBe(start.x + start.width);
    expect(shrunk.y + shrunk.height).toBe(start.y + start.height);
    expect(shrunk.width).toBe(320);
    // Growing north stops under the title bar.
    const tall = resizeFloatFrame(start, { x: 0, y: -1 }, { x: 0, y: -1000 }, column);
    expect(tall.y).toBe(column.top + FLOAT_EDGE_GAP);
  });
});

describe("floating a thread", () => {
  beforeEach(() => {
    useSplitThreadStore.setState({ pairs: [], floating: null, floatFrame: null });
    useRouteThreadHistoryStore.setState({ current: null, previous: null });
  });

  it("takes a paired thread out of its pair, and docking pairs it again", () => {
    const store = useSplitThreadStore.getState();
    store.pair(ref("a"), ref("b"));
    store.float(ref("b"));
    expect(useSplitThreadStore.getState().floating).toEqual(ref("b"));
    expect(findSplitPair(useSplitThreadStore.getState().pairs, ref("a"))).toBeNull();
    // Dock: pairing the floated thread lands it, so it is never both.
    store.pair(ref("a"), ref("b"));
    expect(useSplitThreadStore.getState().floating).toBeNull();
    expect(findSplitPair(useSplitThreadStore.getState().pairs, ref("b"))).toEqual({
      a: ref("a"),
      b: ref("b"),
    });
  });

  it("remembers the route's previous thread, not a re-visit of the current one", () => {
    noteRouteThread({ ref: ref("p"), route: { kind: "server" } });
    noteRouteThread({ ref: ref("f"), route: { kind: "server" } });
    // The same thread changing route (a draft's promotion) is not a new visit.
    noteRouteThread({ ref: ref("f"), route: { kind: "server" } });
    expect(useRouteThreadHistoryStore.getState().previous?.ref).toEqual(ref("p"));
  });
});
