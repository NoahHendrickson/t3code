import { memo } from "react";

import { SidebarV2WorkingRain } from "./SidebarV2StatusIndicator";

export type ComposerBackgroundLivenessKind = "monitoring" | "working";

type ComposerBackgroundLivenessPillProps = {
  readonly kind: ComposerBackgroundLivenessKind;
  /** Stable seed for the working rain so remounts keep the same phase. */
  readonly rainSeed: string;
  readonly liveCount?: number;
  readonly stopping: boolean;
  readonly onStop: () => void;
};

function resolveLivenessLabel(
  kind: ComposerBackgroundLivenessKind,
  liveCount: number | undefined,
  stopping: boolean,
): string {
  if (stopping) {
    return "Stopping...";
  }
  if (kind === "monitoring") {
    return "Monitoring";
  }
  if (liveCount != null && liveCount > 0) {
    return `${liveCount} ${liveCount === 1 ? "agent" : "agents"}`;
  }
  return "Working";
}

/**
 * Context-row chip for background liveness (monitoring watch or working
 * fleets). Sits to the right of the branch pill: leading mark + label + a
 * small stop square. Working uses the sidebar rain; monitoring uses the
 * duty-cycled pulse. See `.fork/customizations.yaml#fork-composer-shell`.
 */
export const ComposerBackgroundLivenessPill = memo(function ComposerBackgroundLivenessPill({
  kind,
  rainSeed,
  liveCount,
  stopping,
  onStop,
}: ComposerBackgroundLivenessPillProps) {
  const label = resolveLivenessLabel(kind, liveCount, stopping);
  return (
    <span data-fork-monitoring-pill role="status" className="inline-flex shrink-0 items-center">
      <span
        data-fork-liveness-mark
        className="flex size-[14px] shrink-0 items-center justify-center"
      >
        {kind === "working" ? (
          <SidebarV2WorkingRain seed={rainSeed} />
        ) : (
          <span data-fork-monitoring-pulse className="size-1.5 rounded-full" aria-hidden />
        )}
      </span>
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        data-fork-monitoring-stop
        aria-label={stopping ? "Stopping background work" : "Stop background work"}
        disabled={stopping}
        onClick={onStop}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
        </svg>
      </button>
    </span>
  );
});
