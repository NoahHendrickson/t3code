import type { ThreadId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";

import { SidebarV2MonitoringMark, SidebarV2WorkingRain } from "./SidebarV2StatusIndicator";
import { StopSquareIcon } from "./StopSquareIcon";

export type ComposerBackgroundLivenessKind = "monitoring" | "working";

/** One piece of background work the pill stands for; a subagent carries its thread. */
export interface ComposerBackgroundLivenessTask {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly childThreadId: ThreadId | null;
}

type ComposerBackgroundLivenessPillBase = {
  readonly stopping: boolean;
  /** False when the client lacks the operate scope (upstream #9786): the square stays visible but inert. */
  readonly canStop: boolean;
  readonly onStop: () => void;
  /**
   * The tasks behind the count. With any present, the label opens a popover
   * that names each one and opens a subagent's thread — what upstream's
   * dropped background-work banner listed inline, without the banner.
   */
  readonly tasks?: ReadonlyArray<ComposerBackgroundLivenessTask>;
  readonly onOpenThread?: (threadId: ThreadId) => void;
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

  const tasks = props.tasks ?? [];
  const labelNode = (
    <span role="status" className="min-w-0 truncate">
      {label}
    </span>
  );

  return (
    <span data-fork-monitoring-pill className="inline-flex shrink-0 items-center">
      <span
        data-fork-liveness-mark
        className="flex size-[14px] shrink-0 items-center justify-center"
      >
        {mark}
      </span>
      {tasks.length > 0 ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                data-fork-monitoring-list
                aria-label={`${label}: show background work`}
              />
            }
          >
            {labelNode}
          </PopoverTrigger>
          <PopoverPopup side="top" align="start" sideOffset={6} className="w-64 p-1">
            <ul data-fork-monitoring-tasks className="flex flex-col">
              {tasks.map((task) => {
                const childThreadId = task.childThreadId;
                const row = (
                  <>
                    <span className="min-w-0 flex-1 truncate">{task.label}</span>
                    {childThreadId !== null ? (
                      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
                    ) : null}
                  </>
                );
                return (
                  <li key={task.id} className="flex">
                    {childThreadId !== null && props.onOpenThread ? (
                      <button
                        type="button"
                        data-fork-monitoring-task
                        aria-label={`Open ${task.label}`}
                        onClick={() => props.onOpenThread?.(childThreadId)}
                      >
                        {row}
                      </button>
                    ) : (
                      <span data-fork-monitoring-task aria-description={task.kind}>
                        {row}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </PopoverPopup>
        </Popover>
      ) : (
        labelNode
      )}
      <button
        type="button"
        data-fork-monitoring-stop
        aria-label={props.stopping ? "Stopping background work" : "Stop background work"}
        disabled={props.stopping || !props.canStop}
        onClick={props.onStop}
      >
        <StopSquareIcon size={10} />
      </button>
    </span>
  );
}
