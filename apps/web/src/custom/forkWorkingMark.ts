/**
 * Working indicator choice — see `.fork/customizations.yaml#fork-working-mark`.
 *
 * Which mark a running agent draws everywhere the fork shows one: the pixel
 * rain or the DNA helix. Device-local, like the palette: a contracts field
 * would put a fork key in a schema upstream owns.
 */
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

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

// One module-level store rather than `useLocalStorage` per mark: every working
// row, the transcript row and the composer pill each mount one, and the latter
// two re-render on every streamed chunk. This decodes storage once per change
// and holds one window listener however many marks are mounted.
const listeners = new Set<() => void>();
let snapshot: ForkWorkingMark | undefined;

function readWorkingMark(): ForkWorkingMark {
  try {
    return getLocalStorageItem(STORAGE_KEY, ForkWorkingMarkSchema) ?? DEFAULT_FORK_WORKING_MARK;
  } catch {
    return DEFAULT_FORK_WORKING_MARK;
  }
}

function getSnapshot(): ForkWorkingMark {
  snapshot ??= readWorkingMark();
  return snapshot;
}

function notify(): void {
  snapshot = undefined;
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY || event.key === null) notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

function setForkWorkingMark(mark: ForkWorkingMark): void {
  try {
    setLocalStorageItem(STORAGE_KEY, mark, ForkWorkingMarkSchema);
  } catch (error) {
    console.error("[fork-working-mark] Could not store the working indicator.", error);
  }
  // Re-read rather than trusting `mark`: a failed write must not show a choice
  // that a reload would drop.
  notify();
}

export function useForkWorkingMark(): [ForkWorkingMark, (mark: ForkWorkingMark) => void] {
  const mark = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_FORK_WORKING_MARK);
  return [mark, setForkWorkingMark];
}
