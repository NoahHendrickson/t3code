/**
 * The transcript's subagent spawn group as the Figma tree (t3-fork file, node
 * 376:21366) — see `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * Replaces upstream's `V2SubagentGroup` (an avatar stack, a chevron, and a
 * bordered member box) at the one site MessagesTimeline renders a batch of
 * two or more subagents. A Phosphor TreeView leads "Kicked off N subagents" /
 * "Ran N subagents" with the status summary and, when a member reports a
 * start time, the batch's elapsed span on the line below; the members sit
 * indented underneath, each with the sidebar's status mark (working rain, a
 * settled dot, or the hollow idle circle for idle and stopped), the title,
 * its live activity or result, and the model with its own elapsed time. No
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
import { memo } from "react";

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
import { SidebarV2StatusMark, type SidebarV2TopStatusMark } from "./SidebarV2StatusIndicator";

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

  return (
    <WorkLogBlock continues={row.continuesWorkLog}>
      <div
        data-fork-subagent-tree=""
        data-subagent-group
        role="group"
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
              {tree.timing ? (
                <span className="tabular-nums">
                  <AgentElapsed agent={tree.timing} />
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
        <SidebarV2StatusMark status={memberStatus(member.mark)} rainSeed={member.id} idle="dot" />
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

/** The sidebar's mark set by the tree's vocabulary. Idle and stopped both
    settle on the hollow idle circle: nothing pending, nothing to report. */
function memberStatus(mark: ForkSubagentMark): SidebarV2TopStatusMark | null {
  switch (mark) {
    case "rain":
      return { label: "Working", mark: "rain" };
    case "done":
      return { label: "Completed", mark: "dot", tone: "done" };
    case "failed":
      return { label: "Failed", mark: "dot", tone: "failed" };
    case "idle":
    case "stopped":
      return null;
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}
