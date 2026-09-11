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

/** The chips that must still show when BranchToolbar is not painting a visible
 * strip (non-repo, a draft with no project yet, or a thread whose shell has
 * not resolved): `leading` is a draft's project chip, `trailing` the liveness
 * stop pill. They mount in the same strip chrome (upstream's
 * ComposerSurface.ContextStrip, which fork CSS flattens under
 * `[data-fork-composer-context-row]`) so they sit where the toolbar's chips
 * would. Nothing to show renders nothing. */
export function renderComposerContextStripFallback({
  leading,
  trailing,
}: {
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}): ReactNode {
  if (!leading && !trailing) {
    return null;
  }
  return (
    <ComposerSurface.ContextStrip>
      {leading ?? null}
      {trailing ?? null}
    </ComposerSurface.ContextStrip>
  );
}
