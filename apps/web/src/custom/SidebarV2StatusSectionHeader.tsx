/**
 * The header above each status section — see
 * `.fork/customizations.yaml#sidebar-v2-status-grouping`.
 *
 * A quiet label and its count, the way a group header reads in a list of
 * cards: name and count semibold on the muted channel, a step under the card
 * title's 14px, and the count beside it fainter still. It starts on the
 * cards' 12px inset so the label lines up with the titles under it. No mark,
 * no hairline, no chevron.
 *
 * On the right, how many projects its cards span ("2 projects"), in the
 * count's style. With project grouping off this is the only place a
 * section's project spread shows at a glance.
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
import {
  SIDEBAR_V2_STATUS_SECTION_LABELS,
  type SidebarV2StatusHeaderKey,
} from "./sidebarV2StatusGrouping";

export function SidebarV2StatusSectionHeader(props: {
  readonly section: SidebarV2StatusHeaderKey;
  readonly count: number;
  readonly projectCount: number;
  readonly isFirst: boolean;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}) {
  return (
    <li data-thread-selection-safe className="list-none">
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
        {props.projectCount > 0 ? (
          <span className="ml-auto shrink-0 font-semibold text-muted-foreground/60 tabular-nums">
            {props.projectCount === 1 ? "1 project" : `${props.projectCount} projects`}
          </span>
        ) : null}
      </button>
    </li>
  );
}
