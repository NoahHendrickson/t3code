/**
 * The project header that separates grouped active cards — see
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * Three controls on one 32px row (Figma 364:11442, 368:21364): a label
 * button — folder mark, project name — that toggles the group, a 32px
 * three-dot that opens the project's menu (settle every active thread in
 * it, or open its settings), and a 32px plus that starts a thread in it. The label button's hover fill is the row's own collapse
 * affordance: hovering it swaps the folder mark for a chevron, and the mark
 * is FolderOpen when expanded and FolderClosed when collapsed at rest.
 * Collapse is an absolutely-positioned hit layer behind the row content,
 * stopping short of the trailing buttons' columns, so they keep their own
 * clicks — a flex-1 collapse button beside the plus was eating them.
 *
 * The two trailing buttons show only while the pointer is somewhere in the
 * project's section — the header or any card under it — or while one of
 * them holds focus; on a coarse pointer they are always drawn. The reveal is
 * a stylesheet rule in theme.custom.css keyed on `data-fork-section-actions`
 * (which also pins the buttons while the menu is open, since the pointer is
 * on the popup then) and the section markers the header and its cards carry
 * (`data-fork-project-section-header` here, `data-fork-project-section` on
 * each card's li): a header lights up when it, or a card after it with no
 * later header in between, is hovered. CSS rather than React state so
 * moving the pointer across the list re-renders nothing.
 *
 * Metrics are derived in custom/sidebarV2CardAlignment rather than chosen
 * here: the list pad supplies the 8px inset, the label button's 12px padding
 * puts the folder mark on the same 20px edge as each card's prompt, and the
 * margins buy this row's 24px above itself on top of the list ul's own gap.
 * The trailing plus is the one 32px control in the list; its derivation is
 * in custom/sidebarV2TrailingColumn with the rest of the column's.
 *
 * No hairline. The shelves use a rule because each is one divider closing off
 * the list above it; project headers repeat every few rows, and a rule at
 * that frequency stripes the panel and competes with the card edges. The
 * folder mark and the space above carry the separation instead.
 *
 * Under manual project sort the header is also the drag handle for its
 * project: the label button carries dnd-kit's sortable listeners (the
 * pointer sensor's distance constraint keeps plain clicks toggling the
 * group), the row translates with the pointer, and the header the pointer
 * is over draws an insertion line on the side the drop will land. The
 * sortable items are the headers alone — cards sit between them in the same
 * flat list — so the strategy displaces nothing (`SIDEBAR_V2_PROJECT_HEADER_
 * SORTING_STRATEGY`); the order is written on drop, by Sidebar.tsx, into the
 * same projectOrder the legacy sidebar's drag reorder writes. The header
 * only stamps `data-fork-drop-edge`; where the line is drawn is the
 * stylesheet's call (theme.custom.css), because "below this section" ends
 * under the section's last card, which the header cannot reach.
 *
 * It is a heading rather than a bare span, and its `li` drops the list
 * semantics it would otherwise inherit from upstream's thread `ul`: a screen
 * reader should hear a labelled break in the list, not an N+G-item list in
 * which G entries are orphan text. The cards keep naming their project too —
 * visually hidden, since the header carries it for sighted users — so grouped
 * mode never carries less information than flat mode.
 */
import {
  CheckIcon,
  ChevronDownIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useState } from "react";
import { type SortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { cn } from "~/lib/utils";
// Fork-only glyph from the shim's own path (this file is fork-owned).
import { EllipsisVerticalIcon } from "./icons/lucide-phosphor";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";
import {
  SIDEBAR_V2_ICON_BUTTON_CLASS,
  SIDEBAR_V2_TRAILING_OFFSET,
} from "./sidebarV2TrailingColumn";

/** The unresolved-project section: a just-deleted project, or an environment
    whose projects have not loaded yet. Named rather than left blank so the run
    of cards under it does not read as belonging to the project above. */
const UNGROUPED_PROJECT_LABEL = "Unknown project";

/** Headers are the only sortable items in a list that also holds their
    cards, so a list-sorting strategy would shift the wrong things. Nothing
    displaces while dragging: the dragged header follows the pointer, the
    header under it marks the drop edge, and the reorder lands on drop. */
export const SIDEBAR_V2_PROJECT_HEADER_SORTING_STRATEGY: SortingStrategy = () => null;

export function SidebarV2ProjectGroupHeader(props: {
  readonly label: string | null;
  /** The section's project key — the sortable id under manual sort. */
  readonly projectKey: string;
  /** True under manual project sort with headers on screen: the header
      becomes its project's drag handle. Off, it is inert. */
  readonly reorderable: boolean;
  readonly isFirst: boolean;
  /** True when the section above painted cards. The 24px group gap is that
      open section's, spent under its last card; after a closed or empty
      section this header takes the compact lead instead. Ignored for the
      first header, which sits flush. */
  readonly afterOpenSection: boolean;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** Starts a thread in this header's project. Omitted for the
      unresolved-project section, which names no project to start one in. */
  readonly onNewThread?: (() => void) | undefined;
  /** Opens this header's project settings. Omitted with `onNewThread` for the
      unresolved-project section, which takes the whole menu with it. */
  readonly onProjectSettings?: (() => void) | undefined;
  /** Settles every active thread under this header. The count is what the
      item names and what gates it: 0 (nothing settle-able — drafts, an
      environment without settlement, already settled) disables the item
      rather than hiding it, so the menu keeps its shape. */
  readonly settleAllCount?: number | undefined;
  readonly onSettleAllThreads?: (() => void) | undefined;
}) {
  const label = props.label ?? UNGROUPED_PROJECT_LABEL;
  const [menuOpen, setMenuOpen] = useState(false);
  const sortable = useSortable({ id: props.projectKey, disabled: !props.reorderable });
  const dropEdge =
    sortable.isOver && !sortable.isDragging && sortable.activeIndex !== -1
      ? sortable.activeIndex > sortable.index
        ? "above"
        : "below"
      : null;
  const trailingCount = (props.onProjectSettings ? 1 : 0) + (props.onNewThread ? 1 : 0);
  const settleAllCount = props.settleAllCount ?? 0;
  return (
    <li
      role="presentation"
      className={cn("list-none", sortable.isDragging && "relative z-20 opacity-80")}
      data-fork-project-section-header=""
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
      {/* group/collapse on the row so hovering the label still swaps the mark.
          Collapse is a behind-layer button; the plus paints above it. */}
      <div
        data-testid="sidebar-v2-project-group-header"
        className={cn(
          // Gap, padding and margins are all derived — see
          // custom/sidebarV2CardAlignment for the arithmetic this row shares
          // with the cards under it.
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
        {/* The design's label button (364:11475): 32px tall, 10px corners,
            ghost hover. It stops one 32px column short of the row's end per
            trailing button, so each of those is its own target. */}
        <button
          type="button"
          data-testid="sidebar-v2-project-group-collapse"
          aria-expanded={!props.collapsed}
          aria-label={props.collapsed ? `Expand ${label}` : `Collapse ${label}`}
          onClick={props.onToggleCollapsed}
          {...(props.reorderable ? sortable.listeners : {})}
          className={cn(
            "absolute inset-y-0 left-0 z-0 cursor-pointer rounded-[10px]",
            props.reorderable && "cursor-grab active:cursor-grabbing",
            trailingCount === 2 ? "right-16" : trailingCount === 1 ? "right-8" : "right-0",
            "outline-none hover:bg-sidebar-row-hover",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
          )}
        />
        {/* Open folder when expanded, closed when collapsed; chevron on hover
            either way. Stacked in one 16px box so the swap does not shift the
            label. pointer-events none so clicks fall through to the collapse
            layer. */}
        <span
          className={cn(
            "pointer-events-none relative z-[1] flex shrink-0 items-center justify-center text-muted-foreground group-hover/collapse:text-sidebar-foreground",
            SIDEBAR_V2_CARD_ALIGNMENT.headerMarkBox,
          )}
        >
          <FolderOpenIcon
            aria-hidden
            className={cn(
              "size-4",
              props.collapsed ? "invisible" : "group-hover/collapse:invisible",
            )}
          />
          <FolderClosedIcon
            aria-hidden
            className={cn(
              "absolute size-4",
              props.collapsed ? "group-hover/collapse:invisible" : "invisible",
            )}
          />
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "absolute size-4 transition-transform invisible group-hover/collapse:visible",
              props.collapsed && "-rotate-90",
            )}
          />
        </span>
        {/* The heading is the label, not the collapse button: a heading that
            wraps the button would take "Collapse <project>" as its name. */}
        <span
          role="heading"
          aria-level={3}
          // Label/12 Medium at --muted-foreground (368:21364), lifting to
          // foreground with the mark while the row is hovered.
          className="pointer-events-none relative z-[1] min-w-0 flex-1 truncate text-[0.75rem] font-medium leading-4 text-muted-foreground group-hover/collapse:text-sidebar-foreground"
        >
          {label}
        </span>
        {trailingCount > 0 ? (
          // The design's 32px icon buttons (364:11451, 368:21126) on the
          // shared box: twMerge lets size-8/rounded-[10px] win over the
          // class's size-6/rounded-md. -me-3 pulls the group out of the row's
          // own padding so it sits flush with the list edge, where the
          // trailing derivation puts it. Above the collapse layer — without
          // z-10 the absolute button steals the click and the buttons look
          // dead. Hidden until the section is hovered — see the file note.
          <span
            data-fork-section-actions=""
            data-fork-menu-open={menuOpen ? "" : undefined}
            className={cn(
              "-me-3 relative z-10 flex shrink-0 items-center",
              SIDEBAR_V2_TRAILING_OFFSET.headerPlus,
            )}
          >
            {props.onProjectSettings ? (
              <Menu open={menuOpen} onOpenChange={setMenuOpen}>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Actions for ${label}`}
                      data-testid="sidebar-v2-project-group-menu"
                      // The collapse layer sits under the row; a click here
                      // is the menu's, never a toggle.
                      onClick={(event) => event.stopPropagation()}
                      className={cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "size-8 rounded-[10px]")}
                    />
                  }
                >
                  <EllipsisVerticalIcon aria-hidden className="size-4" />
                </MenuTrigger>
                {/* data-fork-glass-menu: this popup opens over the thread list,
                    so unlike the chat-side menus there is something to see
                    through — theme.custom.css gives it a blurred, translucent
                    surface instead of the fork's opaque popup fill. */}
                <MenuPopup align="end" className="min-w-48" data-fork-glass-menu="">
                  <MenuItem
                    disabled={settleAllCount === 0}
                    onClick={() => props.onSettleAllThreads?.()}
                  >
                    <CheckIcon />
                    {settleAllCount > 1
                      ? `Settle all threads (${settleAllCount})`
                      : "Settle all threads"}
                  </MenuItem>
                  <MenuItem onClick={() => props.onProjectSettings?.()}>
                    <SettingsIcon />
                    Settings
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null}
            {props.onNewThread ? (
              <button
                type="button"
                // Named for the project, not "New thread": a screen reader
                // running the headings of a grouped sidebar would otherwise
                // hear the same control repeated once per group with nothing
                // to tell them apart.
                aria-label={`New thread in ${label}`}
                onClick={(event) => {
                  // The collapse layer sits under the row; stop anything from
                  // treating this as a toggle if an ancestor starts listening.
                  event.stopPropagation();
                  props.onNewThread?.();
                }}
                className={cn(SIDEBAR_V2_ICON_BUTTON_CLASS, "size-8 rounded-[10px]")}
              >
                <PlusIcon aria-hidden className="size-4" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </li>
  );
}
