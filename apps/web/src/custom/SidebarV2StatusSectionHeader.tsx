/**
 * The header above each status section — see
 * `.fork/customizations.yaml#sidebar-v2-status-grouping`.
 *
 * A quiet label and its count, the way a group header reads in a list of
 * cards: name and count semibold on the muted channel, a step under the card
 * title's 14px, and the count beside it fainter still. It starts on the
 * cards' 12px inset so the label lines up with the titles under it. No mark,
 * no hairline. A small filled caret on the right edge shows only while the
 * pointer is over the header or any row in its section, or the header is
 * keyboard-focused (`theme.custom.css` carries the rule), pointing at what a
 * click does: up to collapse an open section, down to expand a closed one. It
 * is always laid out, so appearing never shifts the row.
 *
 * The pinned block and the settled tail take the same header while status
 * grouping is on, so every group in the list reads the same way; `section`
 * is "pinned" or "settled" there.
 *
 * Clicking it collapses the section; the count is already on screen, so a
 * collapsed header needs nothing extra to say how many cards it hides. The
 * first header takes 12px of its own below the Projects row.
 */
import { cn } from "~/lib/utils";

import { SIDEBAR_V2_CARD_ALIGNMENT } from "./sidebarV2CardAlignment";
import { SIDEBAR_V2_TRAILING_OFFSET } from "./sidebarV2TrailingColumn";
import {
  SIDEBAR_V2_STATUS_SECTION_LABELS,
  type SidebarV2StatusHeaderKey,
} from "./sidebarV2StatusGrouping";

export function SidebarV2StatusSectionHeader(props: {
  readonly section: SidebarV2StatusHeaderKey;
  readonly count: number;
  readonly isFirst: boolean;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}) {
  return (
    <li data-thread-selection-safe data-status-section-header className="list-none">
      <button
        type="button"
        onClick={props.onToggleCollapsed}
        aria-expanded={!props.collapsed}
        data-testid="sidebar-v2-status-section-toggle"
        data-status={props.section}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 text-left text-[0.8125rem] leading-4",
          SIDEBAR_V2_CARD_ALIGNMENT.cardPad,
          // The first header still needs air under the Projects row: the list
          // has no top padding, and this label has no 32px row of its own the
          // way a project header does.
          // Between sections, the project groups' 24px gap (headerLead 22 on
          // top of the list gap), so a status group reads as far apart from
          // the next as a project group does.
          props.isFirst ? "mt-3" : SIDEBAR_V2_CARD_ALIGNMENT.headerLead,
          SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderTrail,
        )}
      >
        <span className="truncate font-semibold text-muted-foreground">
          {SIDEBAR_V2_STATUS_SECTION_LABELS[props.section]}
        </span>
        <span className="shrink-0 font-semibold text-muted-foreground/60 tabular-nums">
          {props.count}
        </span>
        <svg
          aria-hidden
          data-status-section-caret
          viewBox="0 0 14 14"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
          className={cn(
            "invisible ms-auto size-3.5 shrink-0 text-muted-foreground",
            SIDEBAR_V2_TRAILING_OFFSET.statusCaret,
            !props.collapsed && "rotate-180",
          )}
        >
          {/* An 11 x 5.5 caret, inset half the stroke so the round joins soften
              the corners without growing it. Centred on the box, so the 180°
              flip stays in place and the trailing offset still holds. */}
          <path d="M2.71 4.75H11.29L7 9.04Z" />
        </svg>
      </button>
    </li>
  );
}
