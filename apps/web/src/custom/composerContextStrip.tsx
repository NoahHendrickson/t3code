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

/** When the BranchToolbar is absent (non-repo, or a draft with no project yet)
 * but a chip remains — the liveness stop, or a draft's project chip passed as
 * `leading` — mount it in the same strip chrome (upstream's
 * ComposerSurface.ContextStrip, which fork CSS flattens under
 * `[data-fork-composer-context-row]`) so it sits where the chips would. */
export function renderComposerLivenessStripFallback(
  livenessPill: ReactNode,
  leading?: ReactNode,
): ReactNode {
  if (!livenessPill && !leading) {
    return null;
  }
  return (
    <ComposerSurface.ContextStrip>
      {leading ?? null}
      {livenessPill}
    </ComposerSurface.ContextStrip>
  );
}
