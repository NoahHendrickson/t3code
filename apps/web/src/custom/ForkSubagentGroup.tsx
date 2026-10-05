/**
 * The transcript's subagent spawn group as the Figma tree (t3-fork file, node
 * 376:21366) — see `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * Replaces upstream's `V2SubagentGroup` (an avatar stack, a chevron, and a
 * bordered member box) at the one site MessagesTimeline renders a batch of
 * two or more subagents. A Phosphor TreeView leads "Kicked off N subagents" /
 * "Ran N subagents" with the status summary and the batch's elapsed span on
 * the line below; the members sit indented underneath, each with the
 * sidebar's status vocabulary (working rain or a settled dot), the title, its
 * live activity or result, and the model with its own elapsed time. No
 * borders, no fills: a row is a button only when the member has a thread of
 * its own to open. Upstream's agents panel is gone in V2, so there is no
 * "View agents" door; the rows are the roster.
 *
 * Status comes from the thread's live subagent roster where the projection
 * keeps it current, falling back to the item's own fields for settled
 * history. Elapsed timers self-tick through `AgentElapsed`'s DOM writes.
 */
import { TreeView } from "@phosphor-icons/react";
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { memo, type ReactNode } from "react";

import { AgentElapsed } from "~/components/chat/AgentElapsed";
import type { MessagesTimelineRow } from "~/components/chat/MessagesTimeline.logic";
import { WorkLogBlock } from "~/components/chat/WorkLog";
import { environmentThreadDetails } from "~/state/threads";

import {
  formatForkSubagentModel,
  resolveForkSubagentTree,
  type ForkSubagentItem,
  type ForkSubagentMark,
  type ForkSubagentTreeRow,
} from "./forkSubagentTree";
import {
  SidebarV2IdleMark,
  SidebarV2StatusDot,
  SidebarV2WorkingRain,
} from "./SidebarV2StatusIndicator";

export const ForkSubagentGroup = memo(function ForkSubagentGroup(props: {
  readonly row: Extract<MessagesTimelineRow, { readonly kind: "event" }>;
  readonly environmentId: EnvironmentId;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { row, environmentId, onOpenThread } = props;
  const members = (row.subagents ?? [row.projectedItem]).flatMap(({ item }) =>
    item.type === "subagent" ? [item as ForkSubagentItem] : [],
  );
  const liveAgents = useAtomValue(
    environmentThreadDetails.threadAtom(
      scopeThreadRef(environmentId, row.projectedItem.item.threadId),
    ),
    (thread) => thread?.projection.subagents,
  );
  const tree = resolveForkSubagentTree(members, liveAgents);
  const batchTiming = resolveBatchTiming(tree.rows);

  return (
    <WorkLogBlock continues={row.continuesWorkLog}>
      <div
        data-fork-subagent-tree=""
        data-subagent-group
        aria-label={tree.lead}
        className="flex w-full min-w-0 flex-col items-start gap-3.5 py-1 text-sm leading-5"
      >
        <span className="flex w-full min-w-0 items-start gap-2">
          <span aria-hidden className="flex size-4 shrink-0 items-center py-px">
            <TreeView weight="regular" className="size-4 text-foreground" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full min-w-0 truncate text-foreground">{tree.lead}</span>
            <span className="flex min-w-0 items-start gap-3 whitespace-nowrap text-muted-foreground">
              <span>{tree.summary}</span>
              {batchTiming ? (
                <span className="tabular-nums">
                  <AgentElapsed agent={batchTiming} />
                </span>
              ) : null}
            </span>
          </span>
        </span>
        <span className="flex w-full min-w-0 flex-col items-start gap-2 pl-6">
          {tree.rows.map((member) => (
            <ForkSubagentMemberRow key={member.id} member={member} onOpenThread={onOpenThread} />
          ))}
        </span>
      </div>
    </WorkLogBlock>
  );
});

function ForkSubagentMemberRow(props: {
  readonly member: ForkSubagentTreeRow;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { member, onOpenThread } = props;
  const model = formatForkSubagentModel(member.model);
  const content = (
    <>
      <span aria-hidden className="flex shrink-0 items-center py-1">
        {memberMark(member.mark, member.id)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="w-full min-w-0 truncate text-foreground">{member.title}</span>
        <span
          className={
            member.failed
              ? "w-full min-w-0 truncate text-destructive"
              : "w-full min-w-0 truncate text-muted-foreground"
          }
        >
          {member.detail}
        </span>
        <span className="flex items-start gap-3 whitespace-nowrap text-muted-foreground">
          {model ? <span>{model}</span> : null}
          {member.startedAt ? (
            <span className="tabular-nums">
              <AgentElapsed agent={member} />
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
  const className =
    "-mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start gap-2 rounded-md px-1.5 py-0.5 text-left";
  if (member.childThreadId === null) {
    return (
      <span data-fork-subagent-member="" aria-description={member.detail} className={className}>
        {content}
      </span>
    );
  }
  const childThreadId = member.childThreadId;
  return (
    <button
      type="button"
      data-fork-subagent-member=""
      aria-label={`Open ${member.title}`}
      aria-description={member.detail}
      className={`${className} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70`}
      onClick={() => onOpenThread(childThreadId)}
    >
      {content}
    </button>
  );
}

function memberMark(mark: ForkSubagentMark, rainSeed: string): ReactNode {
  switch (mark) {
    case "rain":
      return <SidebarV2WorkingRain seed={rainSeed} />;
    case "idle":
      return <SidebarV2IdleMark />;
    case "done":
      return <SidebarV2StatusDot tone="done" />;
    case "failed":
      return <SidebarV2StatusDot tone="failed" />;
    case "stopped":
      return (
        <span className="flex size-[14px] shrink-0 items-center justify-center">
          <span className="size-2 rounded-full bg-muted-foreground/60" />
        </span>
      );
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

/**
 * One elapsed span for the batch: first launch to last settle, ticking while
 * any member works. A settled member without a completion time leaves the end
 * unknown, so the span is withheld rather than cut short — the same rule as
 * upstream's group timing.
 */
function resolveBatchTiming(rows: ReadonlyArray<ForkSubagentTreeRow>) {
  let startMs: number | null = null;
  let endMs: number | null = null;
  let endUnknown = false;
  for (const row of rows) {
    if (row.startedAt) {
      const ms = Date.parse(row.startedAt);
      startMs = startMs === null ? ms : Math.min(startMs, ms);
    }
    if (row.completedAt) {
      const ms = Date.parse(row.completedAt);
      endMs = endMs === null ? ms : Math.max(endMs, ms);
    } else {
      endUnknown = true;
    }
  }
  if (startMs === null) return null;
  const live = rows.some((row) => row.mark === "rain");
  return {
    status: live ? ("running" as const) : ("completed" as const),
    startedAt: new Date(startMs).toISOString(),
    completedAt: live || endUnknown || endMs === null ? null : new Date(endMs).toISOString(),
  };
}
