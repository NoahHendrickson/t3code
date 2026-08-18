import type { ReactNode } from "react";

import {
  ComposerBackgroundLivenessPill,
  type ComposerBackgroundLivenessPillProps,
} from "./ComposerMonitoringPill";

/** Upstream BranchToolbar strip className — fork CSS flattens the geometry
 * under `[data-fork-composer-context-row]`, so fallbacks must reuse this string
 * rather than a hand-copied subset. */
export const COMPOSER_CONTEXT_STRIP_CLASSNAME =
  "chat-composer-context-strip group/composer-context -mt-4 mx-auto flex w-[calc(100%-2.75rem)] max-w-[calc(48rem-2.75rem)] items-center gap-2 overflow-x-clip overflow-y-visible ps-1 pe-2 pt-5 pb-1";

export type ComposerBackgroundLiveness =
  | { readonly kind: "monitoring" }
  | { readonly kind: "working"; readonly liveCount: number; readonly rainSeed: string };

/** Build pill props from shell liveness, or null when nothing is live. */
export function resolveComposerLivenessPillProps(input: {
  readonly liveness: "monitoring" | "working" | null;
  readonly rainSeed: string;
  readonly liveCount: number;
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ComposerBackgroundLivenessPillProps | null {
  if (input.liveness === "monitoring") {
    return {
      kind: "monitoring",
      stopping: input.stopping,
      onStop: input.onStop,
    };
  }
  if (input.liveness === "working") {
    return {
      kind: "working",
      rainSeed: input.rainSeed,
      liveCount: input.liveCount,
      stopping: input.stopping,
      onStop: input.onStop,
    };
  }
  return null;
}

export function renderComposerLivenessPill(
  props: ComposerBackgroundLivenessPillProps | null,
): ReactNode {
  return props ? <ComposerBackgroundLivenessPill {...props} /> : null;
}

/** When the BranchToolbar is absent (non-repo) but liveness remains, mount the
 * pill in the same strip chrome so stop stays reachable. */
export function renderComposerLivenessStripFallback(livenessPill: ReactNode): ReactNode {
  if (!livenessPill) {
    return null;
  }
  return <div className={COMPOSER_CONTEXT_STRIP_CLASSNAME}>{livenessPill}</div>;
}
