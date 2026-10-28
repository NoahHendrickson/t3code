/**
 * Which of the two pane slots each shown thread's ChatView lives in — see
 * `.fork/customizations.yaml#fork-split-threads`.
 *
 * A thread keeps its slot, and its element key, for as long as it stays on
 * screen, so nothing remounts when focus moves, a partner opens or closes, or
 * the window narrows to one pane. Left and right are drawn with CSS order,
 * not by slot. A thread arriving takes the slot the departing thread just
 * left, which is upstream's own reuse of one ChatView across thread switches.
 *
 * The key is latched on arrival. ThreadRouteView keys a thread promoted from
 * a draft by that draft's id only while it is the route, so a latched key is
 * what keeps a sent split draft mounted when focus leaves and returns.
 */

export interface SplitPaneSlot {
  readonly threadKey: string;
  /** The ChatView element's key; null until the thread first has a view. */
  readonly elementKey: string | null;
}

export type SplitPaneSlots = readonly [SplitPaneSlot | null, SplitPaneSlot | null];

export const EMPTY_SPLIT_PANE_SLOTS: SplitPaneSlots = [null, null];

/** `shown` lists the focused thread first. `elementKey` is the key its view
    would carry now, or null when it has no view yet. */
export function assignSplitPaneSlots(
  previous: SplitPaneSlots,
  shown: readonly SplitPaneSlot[],
): SplitPaneSlots {
  const next: [SplitPaneSlot | null, SplitPaneSlot | null] = [null, null];
  previous.forEach((slot, index) => {
    const stays = slot && shown.find((entry) => entry.threadKey === slot.threadKey);
    if (slot && stays) next[index] = { ...slot, elementKey: slot.elementKey ?? stays.elementKey };
  });
  for (const entry of shown) {
    if (next.some((slot) => slot?.threadKey === entry.threadKey)) continue;
    const vacated = next.findIndex((slot, index) => slot === null && previous[index] !== null);
    next[vacated !== -1 ? vacated : next.indexOf(null)] = entry;
  }
  const same = next.every(
    (slot, index) =>
      slot?.threadKey === previous[index]?.threadKey &&
      slot?.elementKey === previous[index]?.elementKey,
  );
  return same ? previous : next;
}
