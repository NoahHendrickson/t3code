import type { ReactNode } from "react";

import { ComposerSurface } from "~/components/chat/ComposerSurface";

import type { PendingBackgroundWorkPresentation } from "@t3tools/client-runtime/state/thread-execution";
import type { ThreadId } from "@t3tools/contracts";

import {
  ComposerBackgroundLivenessPill,
  type ComposerBackgroundLivenessPillProps,
} from "./ComposerMonitoringPill";

/** The read-only chip look in the context row: a locked BranchToolbar
 * readout and ThreadContextReadout share it. Layout (width, flex) stays at
 * each call site. */
export const READ_ONLY_CONTEXT_CHIP_CLASS_NAME =
  "inline-flex h-7 min-w-0 items-center gap-1 border border-transparent px-1.75 font-normal text-muted-foreground/70 text-xs sm:h-6";

/** Build pill props from upstream's pending-work presentation. `waiting` is
 * upstream's "this work will wake the agent" (subagents, monitors); a dev
 * server that merely outlives the turn is monitoring-only, so it does not
 * rain. The roster rides along as is for the pill's list. */
export function resolveComposerLivenessPillProps(input: {
  readonly presentation: PendingBackgroundWorkPresentation;
  readonly seed: string;
  readonly stopping: boolean;
  readonly canStop: boolean;
  readonly onStop: () => void;
  readonly onOpenThread: (threadId: ThreadId) => void;
}): ComposerBackgroundLivenessPillProps {
  const shared = {
    stopping: input.stopping,
    canStop: input.canStop,
    onStop: input.onStop,
    tasks: input.presentation.items,
    onOpenThread: input.onOpenThread,
  };
  if (!input.presentation.waiting) {
    return { kind: "monitoring", ...shared };
  }
  return {
    kind: "working",
    seed: input.seed,
    liveCount: input.presentation.items.filter((item) => item.kind === "subagent").length,
    ...shared,
  };
}

export function renderComposerLivenessPill(props: ComposerBackgroundLivenessPillProps): ReactNode {
  return <ComposerBackgroundLivenessPill {...props} />;
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
