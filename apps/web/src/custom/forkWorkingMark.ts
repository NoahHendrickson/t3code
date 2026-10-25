/**
 * Working indicator choice — see `.fork/customizations.yaml#fork-working-mark`.
 *
 * Which mark a running agent draws everywhere the fork shows one: the pixel
 * rain or the DNA helix. Device-local, like the palette: a contracts field
 * would put a fork key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "t3code:fork:working-mark:v1";

export const FORK_WORKING_MARKS = ["helix", "rain"] as const;
export type ForkWorkingMark = (typeof FORK_WORKING_MARKS)[number];

export const DEFAULT_FORK_WORKING_MARK: ForkWorkingMark = "helix";

export const FORK_WORKING_MARK_LABELS: Record<ForkWorkingMark, string> = {
  helix: "DNA helix",
  rain: "Pixel rain",
};

const ForkWorkingMarkSchema = Schema.Literals(FORK_WORKING_MARKS);

export const isForkWorkingMark = Schema.is(ForkWorkingMarkSchema);

export function useForkWorkingMark(): [ForkWorkingMark, (mark: ForkWorkingMark) => void] {
  return useLocalStorage(STORAGE_KEY, DEFAULT_FORK_WORKING_MARK, ForkWorkingMarkSchema);
}
