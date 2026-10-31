/**
 * A space's header in the sidebar — see `.fork/customizations.yaml#fork-spaces`.
 *
 * The project header's sibling (SidebarV2ProjectGroupHeader), not a mode of
 * it: the project's favicon leads; the name is a pill that opens the space's
 * Home (its new-thread draft) and is lit while that is on screen; status
 * grouping's filled caret, a button on the row's far end, folds the space.
 * Folded, a summary of what it holds sits before the header's buttons, which
 * take no width at rest and slide in on the header's hover or focus
 * (theme.custom.css), moving the summary over and truncating the name rather
 * than hiding anything. The buttons are the project header's own
 * (SidebarV2SectionActions), as pills.
 *
 * Under manual project sort the header is its space's drag handle, exactly as
 * a project header is: the same sortable id, the same drop edge, read by the
 * same stylesheet rules.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

import { ProjectFavicon, type ProjectFaviconProject } from "~/components/ProjectFavicon";
import { cn } from "~/lib/utils";

import { SIDEBAR_V2_CARD_ALIGNMENT } from "../sidebarV2CardAlignment";
import { SidebarV2SectionActions, UNGROUPED_PROJECT_LABEL } from "../SidebarV2ProjectGroupHeader";
import { SIDEBAR_V2_ICON_BUTTON_CLASS } from "../sidebarV2TrailingColumn";
import { SidebarV2SpaceCaret } from "./SidebarV2SpaceRows";

export function SidebarV2SpaceHeader(props: {
  readonly label: string | null;
  /** The section's project key — the sortable id under manual sort. */
  readonly projectKey: string;
  readonly reorderable: boolean;
  readonly isFirst: boolean;
  /** As the project header's: the section above painted something. */
  readonly afterOpenSection: boolean;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** The space's project, for its favicon; null for the unresolved section,
      which has no project to draw. */
  readonly project: ProjectFaviconProject | null;
  /** The space's Home is the view on screen. */
  readonly active: boolean;
  /** Opens the space's Home; null for the unresolved section. */
  readonly onOpen: (() => void) | null;
  /** What a folded space holds; null while it is open. */
  readonly summary: ReactNode;
  /** The project header's buttons; omitted for the unresolved section. */
  readonly onNewThread?: (() => void) | undefined;
  readonly onProjectSettings?: (() => void) | undefined;
  readonly settleAllCount?: number | undefined;
  readonly onSettleAllThreads?: (() => void) | undefined;
}) {
  const label = props.label ?? UNGROUPED_PROJECT_LABEL;
  const sortable = useSortable({ id: props.projectKey, disabled: !props.reorderable });
  const dropEdge =
    sortable.isOver && !sortable.isDragging && sortable.activeIndex !== -1
      ? sortable.activeIndex > sortable.index
        ? "above"
        : "below"
      : null;
  const hasActions = props.onProjectSettings !== undefined || props.onNewThread !== undefined;
  return (
    <li
      role="presentation"
      className={cn("list-none", sortable.isDragging && "relative z-20 opacity-80")}
      data-fork-project-section-header=""
      data-fork-space-header=""
      data-fork-drop-edge={dropEdge ?? undefined}
      ref={sortable.setNodeRef}
      style={
        props.reorderable
          ? {
              transform: CSS.Translate.toString(sortable.transform),
              transition: sortable.transition,
            }
          : undefined
      }
    >
      <div
        className={cn(
          "group/collapse relative flex h-8 w-full items-center text-left",
          SIDEBAR_V2_CARD_ALIGNMENT.headerPad,
          SIDEBAR_V2_CARD_ALIGNMENT.headerGap,
          SIDEBAR_V2_CARD_ALIGNMENT.headerTrail,
          props.isFirst
            ? "mt-0"
            : props.afterOpenSection
              ? SIDEBAR_V2_CARD_ALIGNMENT.headerLead
              : SIDEBAR_V2_CARD_ALIGNMENT.headerLeadCollapsed,
        )}
      >
        {/* The name and its pill share one flexible box, so the pill ends
            wherever the summary or the buttons begin, however wide they are.
            The pill spans out over the row's start padding; the box pads
            inside it so a truncated name stops short of the pill's end. */}
        <span className="relative flex min-w-10 flex-1 items-center gap-1.5 self-stretch pe-2.5">
          <button
            type="button"
            aria-label={`Open ${label}`}
            aria-current={props.active ? "page" : undefined}
            disabled={props.onOpen === null}
            onClick={props.onOpen ?? undefined}
            {...(props.reorderable ? sortable.listeners : {})}
            className={cn(
              "absolute inset-y-0 -left-3 right-0 z-0 cursor-pointer rounded-full",
              props.reorderable && "cursor-grab active:cursor-grabbing",
              props.active && "bg-sidebar-row-hover",
              "outline-none hover:bg-sidebar-row-hover",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
            )}
          />
          {props.project ? (
            <span
              className={cn(
                "pointer-events-none relative z-[1] flex shrink-0 items-center justify-center",
                SIDEBAR_V2_CARD_ALIGNMENT.headerMarkBox,
              )}
            >
              <ProjectFavicon project={props.project} className="size-4" />
            </span>
          ) : null}
          {/* The heading is the label, not the button: a heading that wraps
              the button would take "Open <space>" as its name. */}
          <span
            role="heading"
            aria-level={3}
            className="pointer-events-none relative z-[1] min-w-0 flex-1 truncate text-[0.75rem] font-medium leading-4 text-muted-foreground group-hover/collapse:text-sidebar-foreground"
          >
            {label}
          </span>
        </span>
        {/* ms-1.5 on top of the row's gap: 12px between the pill and the
            summary's first icon. */}
        {props.summary !== null ? (
          <span className="pointer-events-none relative z-10 ms-1.5 flex min-w-0 shrink items-center">
            {props.summary}
          </span>
        ) : null}
        {/* -me-1.5 spends the row's gap before the caret. */}
        {hasActions ? (
          <span data-fork-space-actions-reveal="" className="relative z-10 -me-1.5 shrink-0">
            <span className="flex min-w-0 overflow-clip [overflow-clip-margin:4px]">
              <SidebarV2SectionActions
                label={label}
                onNewThread={props.onNewThread}
                onProjectSettings={props.onProjectSettings}
                settleAllCount={props.settleAllCount}
                onSettleAllThreads={props.onSettleAllThreads}
                className="me-0"
                buttonClassName="rounded-full"
              />
            </span>
          </span>
        ) : null}
        <button
          type="button"
          data-fork-space-caret=""
          aria-expanded={!props.collapsed}
          aria-label={props.collapsed ? `Expand ${label}` : `Collapse ${label}`}
          onClick={props.onToggleCollapsed}
          className={cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "-me-3 relative z-10 size-8 rounded-full")}
        >
          <SidebarV2SpaceCaret open={!props.collapsed} className="left-0" />
        </button>
      </div>
    </li>
  );
}
