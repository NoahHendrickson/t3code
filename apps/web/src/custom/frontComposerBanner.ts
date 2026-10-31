import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";

/**
 * The composer shows one notice at a time: the one ComposerBannerStack would
 * draw first (machine notices, then the rest in list order). The others wait
 * their turn, since acting on them is moot while the front one stands — no
 * point compacting while the usage limit is still hit.
 */
export function frontComposerBanner(
  items: ReadonlyArray<ComposerBannerStackItem>,
): ReadonlyArray<ComposerBannerStackItem> {
  const front = items.find((item) => item.group === "environment") ?? items[0];
  return front === undefined ? [] : [front];
}
