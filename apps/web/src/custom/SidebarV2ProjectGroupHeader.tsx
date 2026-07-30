/**
 * The project header that separates grouped active cards — see
 * `.fork/customizations.yaml#sidebar-v2-project-grouping`.
 *
 * Deliberately not a button. Upstream's two shelf headers (Snoozed, Settled)
 * collapse because each hides a tail whose whole job is to stay out of the way;
 * a project header sits over the inbox, where nothing wants hiding, and the
 * scope menu one row above already answers "just this project" without leaving
 * a row of collapsed stubs behind.
 *
 * Metrics are the shelf headers' verbatim, but the trailing hairline is not.
 * The shelves use a rule because each is one divider closing off the list above
 * it; project headers repeat every few rows, and a rule at that frequency
 * stripes the panel and competes with the card edges. The folder mark and the
 * space above carry the separation instead.
 *
 * Spacing from Figma t3-fork node 113:3718: list pad supplies the 8px inset;
 * the folder sits in a 24px box (16px glyph centred) so its ink shares the
 * 12px axis with Search and each card's status; gap-1 (4px) to the label;
 * 2px to the first card (the list ul's own gap-0.5). Between groups the
 * design puts 16px: the ul's 2px gap plus `mt-3.5` here.
 *
 * It is a heading rather than a bare span, and its `li` drops the list
 * semantics it would otherwise inherit from upstream's thread `ul`: a screen
 * reader should hear a labelled break in the list, not an N+G-item list in
 * which G entries are orphan text. The cards keep naming their project too —
 * visually hidden, since the header carries it for sighted users — so grouped
 * mode never carries less information than flat mode.
 */
import { FolderOpenIcon, PlusIcon } from "lucide-react";

import { cn } from "~/lib/utils";
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
  /** Starts a thread in this header's project. Omitted for the
      unresolved-project section, which names no project to start one in. */
  readonly onNewThread?: (() => void) | undefined;
}) {
  return (
    <li role="presentation" className="list-none">
      <div
        data-testid="sidebar-v2-project-group-header"
        className={cn(
          // No horizontal pad — the list's 8px is the content edge. Folder in a
          // 24px box centres its 16px glyph on the same 12px axis as card status.
          "flex w-full items-center gap-1 text-left",
          props.isFirst ? "mt-0" : "mt-3.5",
        )}
      >
        {/* FolderOpen, matching the chrome's New-project glyph — the design
            (113:3718 Frame 48) draws the group mark open, not closed. */}
        <span className="flex size-6 shrink-0 items-center justify-center">
          <FolderOpenIcon aria-hidden className="size-4 text-sidebar-muted-foreground/80" />
        </span>
        {/* The heading is the label, not the row: the row now also holds a
            button, and a heading that contains one takes the button's text into
            its own accessible name — "no3y-code New thread in no3y-code" for a
            landmark whose whole job is to say which project this run of cards
            belongs to. */}
        <span
          role="heading"
          aria-level={3}
          // Foreground, not muted: the design (113:4023) sets the label a step
          // brighter than the folder beside it — the name is the landmark.
          className="min-w-0 truncate text-xs font-normal leading-4 text-sidebar-foreground"
        >
          {props.label ?? UNGROUPED_PROJECT_LABEL}
        </span>
        {props.onNewThread ? (
          <button
            type="button"
            // Named for the project, not "New thread": a screen reader running
            // the headings of a grouped sidebar would otherwise hear the same
            // control repeated once per group with nothing to tell them apart.
            aria-label={`New thread in ${props.label ?? UNGROUPED_PROJECT_LABEL}`}
            onClick={props.onNewThread}
            className={cn(
              SIDEBAR_V2_ICON_BUTTON_CLASS,
              // ms-auto rather than a spacer: the label truncates, so anything
              // that pushed from the left would have to be told not to shrink.
              "ms-auto",
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
