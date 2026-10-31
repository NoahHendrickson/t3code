import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
} from "@t3tools/client-runtime/state/thread-requests";
import { ShieldIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { ComposerPendingApprovalActions } from "~/components/chat/ComposerPendingApprovalActions";
import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { InlineButton } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import type { PendingApproval } from "~/session-logic";

const APPROVAL_LABEL = {
  command: "Command approval",
  "file-change": "File change approval",
  "file-read": "File read approval",
  permission: "App permission approval",
  "mcp-elicitation": "App access approval",
} satisfies Record<PendingApproval["requestKind"], string>;

const DETAIL_LABEL = {
  command: "Command",
  "file-change": "File change",
  "file-read": "File to read",
  permission: "Permission request",
  "mcp-elicitation": "App access request",
} satisfies Record<PendingApproval["requestKind"], string>;

export type ForkApprovalResponder = ComponentProps<
  typeof ComposerPendingApprovalActions
>["onRespondToApproval"];

/** The pending approval as a notice card above the composer, styled like the fork's other notices. */
export function forkApprovalNoticeItem(input: {
  readonly approval: PendingApproval;
  readonly pendingCount: number;
  readonly disabled: boolean;
  readonly isResponding: boolean;
  readonly onRespondToApproval: ForkApprovalResponder;
}): ComposerBannerStackItem {
  const { approval } = input;
  const label = APPROVAL_LABEL[approval.requestKind];
  const canRespond = approval.responseCapability === "live";
  const Detail = approval.requestKind === "mcp-elicitation" ? "span" : "code";
  return {
    id: `fork-approval:${approval.requestId}`,
    variant: "warning",
    noticeCard: true,
    icon: <ShieldIcon className="text-warning" />,
    title: (
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{label}</span>
        {approval.appName ? (
          <span className="min-w-0 truncate text-muted-foreground">{approval.appName}</span>
        ) : null}
        {input.pendingCount > 1 ? (
          <span className="ms-auto shrink-0 text-muted-foreground tabular-nums">
            1/{input.pendingCount}
          </span>
        ) : null}
      </span>
    ),
    description: (
      <span className="flex w-full min-w-0 flex-col gap-1" data-fork-approval-notice="true">
        <Detail
          aria-label={DETAIL_LABEL[approval.requestKind]}
          className={
            approval.requestKind === "mcp-elicitation"
              ? "block max-h-20 overflow-auto whitespace-pre-wrap text-foreground wrap-break-word [scrollbar-width:thin]"
              : "block max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground wrap-anywhere [scrollbar-width:thin]"
          }
          data-approval-detail="complete"
          tabIndex={0}
        >
          {approval.detail || label}
        </Detail>
        {canRespond ? null : (
          <span className="text-warning">
            Provider process is gone. Interrupt or restart the run to respond.
          </span>
        )}
        {approval.reason ? (
          <span className="select-text wrap-anywhere">{approval.reason}</span>
        ) : null}
        {approval.fullAccessOverride ? (
          <Popover>
            <PopoverTrigger openOnHover render={<InlineButton tone="muted" />}>
              {FULL_ACCESS_OVERRIDE_QUESTION}
            </PopoverTrigger>
            <PopoverPopup
              aria-label={FULL_ACCESS_OVERRIDE_QUESTION}
              tooltipStyle
              side="top"
              className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal"
            >
              {fullAccessOverrideExplanation(approval.fullAccessOverride)}
            </PopoverPopup>
          </Popover>
        ) : null}
      </span>
    ),
    actions: (
      <ComposerPendingApprovalActions
        requestId={approval.requestId}
        disabled={input.disabled}
        isResponding={input.isResponding}
        options={approval.options}
        canRespond={canRespond}
        onRespondToApproval={input.onRespondToApproval}
      />
    ),
  };
}
