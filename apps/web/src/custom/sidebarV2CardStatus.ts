/**
 * A Sidebar V2 card's status: read state, then the ladder that picks the one
 * mark the card draws — see `.fork/customizations.yaml#sidebar-v2-card-rows`
 * and `#sidebar-v2-status-grouping`.
 *
 * One derivation for both consumers. `SidebarThreadRow` draws its mark from
 * `topStatus`, and status grouping buckets each card from `kind`, so a card's
 * section and the mark on it cannot drift apart: change the ladder here and
 * both move together.
 *
 * Upstream computes `isUnread` and `isWoke` inline in its row; the fork's row
 * calls this instead, so the semantics live here:
 *
 * - Never-visited counts as read (same as the legacy sidebar): switching
 *   sidebars must not light up every historical thread as unread.
 * - A woken thread reappears at its original position (the sort is
 *   deliberately static), so the mark has to carry the weight. Snoozing is an
 *   explicit act, so woke clears only when the user re-engages: reading a
 *   completion-triggered wake, clicking the pill, sending a message, settling,
 *   archiving, or a change-request state that settles the thread. Timer wakes
 *   survive a mere visit. An unparseable visit timestamp counts as
 *   never-visited, so corrupt local data cannot eat the wake signal.
 *   Settlement is server-side (upstream #8600): a settled thread never reads
 *   as woke.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  type SidebarThreadStatus,
} from "~/components/Sidebar.logic";
import { parseTimestampDate } from "~/timestampFormat";

import type { SidebarV2DotTone } from "./SidebarV2StatusIndicator";

/** Every mark a card can draw, before labels. */
export type SidebarV2CardStatusKind =
  | "working"
  | "waiting"
  | "approval"
  | "input"
  | "limited"
  | "failed"
  | "woke"
  | "done"
  | "monitoring";

/** The labelled mark the row hands to `SidebarV2StatusMark`. Discriminated on
    `mark` so the dot branch cannot be handed the `working` tone, which has no
    dot rendering. */
export type SidebarV2CardTopStatus =
  | { label: string; tone: "working"; mark: "working" }
  | { label: string; tone: SidebarV2DotTone; mark: "dot" | "woke" }
  | { label: "Waiting" | "Monitoring"; mark: "monitoring" }
  | null;

export interface SidebarV2CardStatus {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
  readonly kind: SidebarV2CardStatusKind | null;
  readonly topStatus: SidebarV2CardTopStatus;
}

/**
 * The ladder, top wins: live and blocked states first, then woke, then an
 * unread Done, then Monitoring.
 *
 * Monitoring is a roster still present on a ready thread. Any roster here does
 * not hold completion (a dev server, a long shell): shellRuntime parks the
 * runtime at idle (→ "waiting") exactly when it does. Rather than read idle
 * while the composer's pill says "Monitoring", the card draws the breathing
 * mark. Woke and Done outrank it, since nothing will wake the agent and the
 * roster can outlive the unread turn.
 */
export function resolveSidebarV2CardStatusKind(input: {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
  readonly hasPendingBackgroundTasks: boolean;
}): SidebarV2CardStatusKind | null {
  if (input.status !== "ready") return input.status;
  if (input.isWoke) return "woke";
  if (input.isUnread) return "done";
  if (input.hasPendingBackgroundTasks) return "monitoring";
  return null;
}

/** Labels for each kind. Labels are no longer painted — every status is a
    leading mark — so they survive as the accessible names of aria-hidden
    marks. Limited takes the amber dot: it is waiting on you the way approval
    and input are. */
function sidebarV2CardTopStatus(
  kind: SidebarV2CardStatusKind | null,
  options: { readonly goalActive: boolean },
): SidebarV2CardTopStatus {
  switch (kind) {
    case "working":
      // A native /goal keeps the agent going across turns until it is met.
      return { label: options.goalActive ? "Goal" : "Working", tone: "working", mark: "working" };
    case "waiting":
      return { label: "Waiting", mark: "monitoring" };
    case "approval":
      return { label: "Needs approval", tone: "approval", mark: "dot" };
    case "input":
      return { label: "Needs input", tone: "input", mark: "dot" };
    case "limited":
      return { label: "Usage limit reached", tone: "approval", mark: "dot" };
    case "failed":
      return { label: "Failed", tone: "failed", mark: "dot" };
    case "woke":
      return { label: "Woke from snooze", tone: "approval", mark: "woke" };
    case "done":
      return { label: "Done", tone: "done", mark: "dot" };
    case "monitoring":
      return { label: "Monitoring", mark: "monitoring" };
    case null:
      return null;
  }
}

/** A card's full status from its shell, its effective visited watermark, and
    when its snooze ended (`threadWokeAt`). */
export function resolveSidebarV2CardStatus(
  thread: EnvironmentThreadShell,
  input: { readonly lastVisitedAt: string | undefined; readonly wokeAt: string | null },
): SidebarV2CardStatus {
  const status = resolveSidebarThreadStatus(thread);
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt: input.lastVisitedAt });
  const lastVisitedDate =
    input.lastVisitedAt === undefined ? null : parseTimestampDate(input.lastVisitedAt);
  const wokeAtDate = input.wokeAt === null ? null : parseTimestampDate(input.wokeAt);
  const isWoke =
    wokeAtDate !== null &&
    (lastVisitedDate === null || lastVisitedDate < wokeAtDate) &&
    thread.settledOverride !== "settled";
  const kind = resolveSidebarV2CardStatusKind({
    status,
    isUnread,
    isWoke,
    hasPendingBackgroundTasks: thread.pendingBackgroundTasks.length > 0,
  });
  return {
    status,
    isUnread,
    isWoke,
    kind,
    topStatus: sidebarV2CardTopStatus(kind, { goalActive: thread.goal?.status === "active" }),
  };
}
