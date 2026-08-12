import { type ReactNode } from "react";

import { SidebarV2MonitoringMark, SidebarV2WorkingRain } from "./SidebarV2StatusIndicator";
import { StopSquareIcon } from "./StopSquareIcon";

export type ComposerBackgroundLivenessKind = "monitoring" | "working";

type ComposerBackgroundLivenessPillBase = {
  readonly stopping: boolean;
  readonly onStop: () => void;
};

export type ComposerBackgroundLivenessPillProps = ComposerBackgroundLivenessPillBase &
  (
    | { readonly kind: "monitoring" }
    | {
        readonly kind: "working";
        /** Stable seed for the working rain so remounts keep the same phase. */
        readonly rainSeed: string;
        readonly liveCount: number;
      }
  );

function resolveLivenessLabel(props: ComposerBackgroundLivenessPillProps): string {
  if (props.stopping) {
    return "Stopping...";
  }
  if (props.kind === "monitoring") {
    return "Monitoring";
  }
  if (props.liveCount > 0) {
    return `${props.liveCount} ${props.liveCount === 1 ? "agent" : "agents"}`;
  }
  return "Working";
}

/**
 * Context-row chip for background liveness (monitoring watch or working
 * fleets). Sits to the right of the branch pill: leading mark + label + a
 * small stop square. Working uses the sidebar rain (accepted always-on
 * composer repaint — same SVG opacity contract as the sidebar mark, but the
 * composer has no content-visibility escape); monitoring reuses
 * `SidebarV2MonitoringMark`. See `.fork/customizations.yaml#fork-composer-shell`.
 */
export function ComposerBackgroundLivenessPill(props: ComposerBackgroundLivenessPillProps) {
  const label = resolveLivenessLabel(props);
  const mark: ReactNode =
    props.kind === "working" ? (
      <SidebarV2WorkingRain seed={props.rainSeed} />
    ) : (
      <SidebarV2MonitoringMark />
    );

  return (
    <span data-fork-monitoring-pill className="inline-flex shrink-0 items-center">
      <span
        data-fork-liveness-mark
        className="flex size-[14px] shrink-0 items-center justify-center"
      >
        {mark}
      </span>
      <span role="status" className="min-w-0 truncate">
        {label}
      </span>
      <button
        type="button"
        data-fork-monitoring-stop
        aria-label={props.stopping ? "Stopping background work" : "Stop background work"}
        disabled={props.stopping}
        onClick={props.onStop}
      >
        <StopSquareIcon size={10} />
      </button>
    </span>
  );
}
