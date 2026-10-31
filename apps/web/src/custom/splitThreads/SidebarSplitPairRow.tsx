/**
 * A split pair's sidebar row: its two cards side by side — see
 * `.fork/customizations.yaml#fork-split-threads`.
 */
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { SIDEBAR_V2_CARD_ALIGNMENT } from "../sidebarV2CardAlignment";
import type { ThreadRowShape } from "../sidebarV2RowPolicy";

export function SidebarSplitPairRow(props: {
  /** Painted under a project header: the row joins the header's run of
      cards (hover reveal, drop edge, a space's step-in and guide line). */
  readonly projectSection: boolean;
  /** Its cards' shape, which a tray drawn around them follows. */
  readonly shape: ThreadRowShape;
  readonly children: ReactNode;
}) {
  return (
    <li
      className="list-none"
      data-fork-split-pair=""
      data-fork-project-section={props.projectSection ? "" : undefined}
    >
      <ul
        role="presentation"
        data-fork-row-shape={props.shape}
        className={cn("grid grid-cols-2", SIDEBAR_V2_CARD_ALIGNMENT.listGap)}
      >
        {props.children}
      </ul>
    </li>
  );
}
