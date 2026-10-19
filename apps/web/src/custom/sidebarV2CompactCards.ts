/**
 * The compact card preference — see
 * `.fork/customizations.yaml#sidebar-v2-compact-cards`.
 *
 * Device-local (localStorage) like the grouping switches beside it: a density
 * choice is about the screen in front of you, and a contracts field would put
 * a fork-shaped key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

const SIDEBAR_V2_COMPACT_CARDS_STORAGE_KEY = "t3code:fork:sidebar-v2-compact-cards:v1";

export function useSidebarV2CompactCards(): [boolean, (value: boolean) => void] {
  return useLocalStorage(SIDEBAR_V2_COMPACT_CARDS_STORAGE_KEY, false, Schema.Boolean);
}
