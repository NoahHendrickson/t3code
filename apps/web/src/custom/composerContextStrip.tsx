import type { ReactNode } from "react";

import { ComposerSurface } from "~/components/chat/ComposerSurface";

import {
  ComposerBackgroundLivenessPill,
  type ComposerBackgroundLivenessPillProps,
} from "./ComposerMonitoringPill";

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
 * pill in the same strip chrome (upstream's ComposerSurface.ContextStrip, which
 * fork CSS flattens under `[data-fork-composer-context-row]`) so stop stays
 * reachable. */
export function renderComposerLivenessStripFallback(livenessPill: ReactNode): ReactNode {
  if (!livenessPill) {
    return null;
  }
  return <ComposerSurface.ContextStrip>{livenessPill}</ComposerSurface.ContextStrip>;
}
