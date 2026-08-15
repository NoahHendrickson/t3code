/**
 * The project header that separates grouped active cards — see
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * The whole row owns the collapse affordance: hovering anywhere on it swaps
 * the folder mark for a chevron, and clicking the mark or the label toggles
 * the group. Collapse is an absolutely-positioned hit layer behind the row
 * content so the new-thread plus can sit above it (`z-10`) and keep its own
 * clicks — a flex-1 collapse button beside the plus was eating them. At rest
 * the mark is FolderOpen when expanded and FolderClosed when collapsed
 * (Figma 151:6742); hover still swaps either for the chevron.
 *
 * Metrics are the shelf headers' verbatim, but the trailing hairline is not.
 * The shelves use a rule because each is one divider closing off the list above
 * it; project headers repeat every few rows, and a rule at that frequency
 * stripes the panel and competes with the card edges. The folder mark and the
 * space above carry the separation instead.
 *
 * Spacing from Figma t3-fork node 293:20603, and every value of it is derived
 * in custom/sidebarV2CardAlignment rather than chosen here: the list pad
 * supplies the 8px inset, the folder's 24px box centres its 16px glyph on the
 * same 20px axis as Search and each card's status, and the gap to the label is
 * what puts that label on the cards' 34px edge. The margins buy this row's 4px
 * above its first card and 20px above itself on top of the list ul's own gap.
 *
 * It is a heading rather than a bare span, and its `li` drops the list
 * semantics it would otherwise inherit from upstream's thread `ul`: a screen
 * reader should hear a labelled break in the list, not an N+G-item list in
 * which G entries are orphan text. The cards keep naming their project too —
 * visually hidden, since the header carries it for sighted users — so grouped
 * mode never carries less information than flat mode.
 */
import { ChevronDownIcon, FolderClosedIcon, FolderOpenIcon, PlusIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";
import {
  SIDEBAR_V2_ICON_BUTTON_CLASS,
  SIDEBAR_V2_TRAILING_OFFSET,
} from "./sidebarV2TrailingColumn";

/** The unresolved-project section: a just-deleted project, or an environment
    whose projects have not loaded yet. Named rather than left blank so the run
    of cards under it does not read as belonging to the project above. */
const UNGROUPED_PROJECT_LABEL = "Unknown project";

export function SidebarV2ProjectGroupHeader(props: {
  readonly label: string | null;
  readonly isFirst: boolean;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** Starts a thread in this header's project. Omitted for the
      unresolved-project section, which names no project to start one in. */
  readonly onNewThread?: (() => void) | undefined;
}) {
  const label = props.label ?? UNGROUPED_PROJECT_LABEL;
  return (
    <li role="presentation" className="list-none">
      {/* group/collapse on the row so hovering the plus still swaps the mark.
          Collapse is a behind-layer button; the plus paints above it. */}
      <div
        data-testid="sidebar-v2-project-group-header"
        className={cn(
          // Gap and margins are all derived — see custom/sidebarV2CardAlignment
          // for the arithmetic this row shares with the cards under it.
          "group/collapse relative flex w-full items-center text-left",
          SIDEBAR_V2_CARD_ALIGNMENT.headerGap,
          SIDEBAR_V2_CARD_ALIGNMENT.headerTrail,
          props.isFirst ? "mt-0" : SIDEBAR_V2_CARD_ALIGNMENT.headerLead,
        )}
      >
        <button
          type="button"
          data-testid="sidebar-v2-project-group-collapse"
          aria-expanded={!props.collapsed}
          aria-label={props.collapsed ? `Expand ${label}` : `Collapse ${label}`}
          onClick={props.onToggleCollapsed}
          className={cn(
            "absolute inset-0 z-0 cursor-pointer rounded-md",
            "outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
          )}
        />
        {/* Open folder when expanded, closed when collapsed (Figma 151:6742);
            chevron on row-hover either way. Stacked in one 24px box so the
            swap does not shift the label. pointer-events none so clicks fall
            through to the collapse layer. */}
        <span
          className={cn(
            "pointer-events-none relative z-[1] flex shrink-0 items-center justify-center text-sidebar-muted-foreground/80 group-hover/collapse:text-sidebar-foreground",
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
          // Foreground, not muted: the design (113:4023) sets the label a step
          // brighter than the folder beside it — the name is the landmark.
          className="pointer-events-none relative z-[1] min-w-0 flex-1 truncate text-xs font-normal leading-4 text-sidebar-foreground"
        >
          {label}
        </span>
        {props.onNewThread ? (
          <button
            type="button"
            // Named for the project, not "New thread": a screen reader running
            // the headings of a grouped sidebar would otherwise hear the same
            // control repeated once per group with nothing to tell them apart.
            aria-label={`New thread in ${label}`}
            onClick={(event) => {
              // The collapse layer sits under the whole row; stop anything from
              // treating this as a toggle if an ancestor starts listening.
              event.stopPropagation();
              props.onNewThread?.();
            }}
            className={cn(
              SIDEBAR_V2_ICON_BUTTON_CLASS,
              // Above the collapse layer — without z-10 the absolute inset-0
              // button steals the click and the plus looks dead.
              "relative z-10",
              SIDEBAR_V2_TRAILING_OFFSET.headerPlus,
            )}
          >
            <PlusIcon aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    </li>
  );
}
