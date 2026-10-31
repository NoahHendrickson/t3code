/* Open-thread tabs above a space's chat column, see `.fork/customizations.yaml#fork-spaces`.
   One device-local list of thread keys in opened order; each space's strip reads its slice
   and draws it by status (`rankSpaceTabs`). Which tabs are open is about this screen. */
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import type { SidebarV2CardStatusKind } from "../sidebarV2CardStatus";

const SPACE_TABS_STORAGE_KEY = "t3code:fork:space-tabs:v1";

/** Keys are only pruned when their thread is seen settled, so a thread deleted
    elsewhere would linger forever; the cap bounds that, dropping the oldest. */
export const SPACE_TABS_LIMIT = 50;

const OpenTabKeys = Schema.Array(Schema.String);
const EMPTY_KEYS: readonly string[] = [];

export function openSpaceTab(keys: readonly string[], key: string): readonly string[] {
  if (keys.includes(key)) return keys;
  const next = [...keys, key];
  return next.length > SPACE_TABS_LIMIT ? next.slice(next.length - SPACE_TABS_LIMIT) : next;
}

export function closeSpaceTabs(
  keys: readonly string[],
  closing: ReadonlySet<string>,
): readonly string[] {
  return keys.some((key) => closing.has(key)) ? keys.filter((key) => !closing.has(key)) : keys;
}

/** Stores what is on screen as a tab and drops the tabs whose thread left
    the space. The same list when nothing changes, so a caller can compare
    by identity and write only when it must. */
export function reconcileSpaceTabs(
  keys: readonly string[],
  change: { readonly opened: readonly string[]; readonly closed: ReadonlySet<string> },
): readonly string[] {
  return change.opened.reduce(openSpaceTab, closeSpaceTabs(keys, change.closed));
}

export interface SpaceTabThread {
  readonly key: string;
  /** Settled or archived: either way the thread has left the space's
      working set, so its tab closes. */
  readonly closed: boolean;
}

/** The tabs one space's strip draws and the stored keys it drops. A stored key missing
    from `threads` belongs to another space (or has not loaded), so it is kept. Threads
    on screen (`activeKeys`) are always drawn, settled or not, but a settled one is not
    stored, so it leaves once you move away. */
export function resolveSpaceTabs<T extends SpaceTabThread>(input: {
  readonly openKeys: readonly string[];
  readonly activeKeys: readonly string[];
  readonly threads: readonly T[];
}): { readonly tabs: readonly T[]; readonly closedKeys: ReadonlySet<string> } {
  const active = new Set(input.activeKeys);
  const byKey = new Map(input.threads.map((thread) => [thread.key, thread] as const));
  const tabs: T[] = [];
  const closedKeys = new Set<string>();
  for (const key of input.openKeys) {
    const thread = byKey.get(key);
    if (thread === undefined) continue;
    if (thread.closed) {
      closedKeys.add(key);
      if (!active.has(key)) continue;
    }
    tabs.push(thread);
  }
  for (const key of input.activeKeys) {
    if (input.openKeys.includes(key)) continue;
    const thread = byKey.get(key);
    if (thread !== undefined) tabs.push(thread);
  }
  return { tabs, closedKeys };
}

/** The tab to land on when the open one closes: its right neighbour, else its
    left, else none. */
export function neighbourAfterClose<T extends { readonly key: string }>(
  tabs: readonly T[],
  closingKey: string,
): T | null {
  const index = tabs.findIndex((tab) => tab.key === closingKey);
  if (index === -1) return null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

export function useSpaceTabKeys() {
  return useLocalStorage(SPACE_TABS_STORAGE_KEY, EMPTY_KEYS, OpenTabKeys);
}

/** A tab's place in the strip by its card's status: what needs you first,
    then what finished, what is working, what is monitoring, what is idle. A
    failed thread or a message request needs you too; a woken one is back
    like a finished one. */
const TAB_RANK_BY_KIND: Record<SidebarV2CardStatusKind, number> = {
  approval: 0,
  input: 0,
  request: 0,
  limited: 0,
  failed: 0,
  done: 1,
  woke: 1,
  working: 2,
  waiting: 3,
  monitoring: 3,
};
const IDLE_TAB_RANK = 4;

/** Orders tabs by status rank, keeping the opened order within a rank. */
export function rankSpaceTabs<T>(
  tabs: readonly T[],
  kindOf: (tab: T) => SidebarV2CardStatusKind | null,
): readonly T[] {
  const rank = (tab: T) => {
    const kind = kindOf(tab);
    return kind === null ? IDLE_TAB_RANK : TAB_RANK_BY_KIND[kind];
  };
  return tabs
    .map((tab, index) => ({ tab, index, rank: rank(tab) }))
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.tab);
}

/** One slot in the strip: a lone tab, or a split's two threads side by side. */
export type SpaceTabSlot<T> =
  | { readonly kind: "tab"; readonly tab: T }
  | { readonly kind: "pair"; readonly tabs: readonly [T, T] };

/** Groups a split's two threads into one slot, where the first of them
    would stand in the ranked order, so the pair reads as one place. Inside
    it they keep `pairKeys`' order, the panes' left to right. */
export function pairSpaceTabs<T extends { readonly key: string }>(
  tabs: readonly T[],
  pairKeys: readonly string[],
): ReadonlyArray<SpaceTabSlot<T>> {
  const paired = pairKeys.length === 2 ? new Set(pairKeys) : null;
  const left = paired === null ? undefined : tabs.find((tab) => tab.key === pairKeys[0]);
  const right = paired === null ? undefined : tabs.find((tab) => tab.key === pairKeys[1]);
  if (left === undefined || right === undefined) return tabs.map((tab) => ({ kind: "tab", tab }));
  const slots: Array<SpaceTabSlot<T>> = [];
  let placed = false;
  for (const tab of tabs) {
    if (!paired!.has(tab.key)) slots.push({ kind: "tab", tab });
    else if (!placed) {
      slots.push({ kind: "pair", tabs: [left, right] });
      placed = true;
    }
  }
  return slots;
}
