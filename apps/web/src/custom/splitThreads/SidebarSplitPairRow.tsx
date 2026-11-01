/**
 * A split pair's sidebar row: its two cards side by side — see
 * `.fork/customizations.yaml#fork-split-threads`.
 */
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { SIDEBAR_V2_CARD_ALIGNMENT } from "../sidebarV2CardAlignment";

export function SidebarSplitPairRow(props: {
  /** Under a project header: joins the header's run of cards (hover reveal, drop edge). */
  readonly projectSection: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li
      className="list-none"
      data-fork-split-pair=""
      data-fork-project-section={props.projectSection ? "" : undefined}
    >
      <ul role="presentation" className={cn("grid grid-cols-2", SIDEBAR_V2_CARD_ALIGNMENT.listGap)}>
        {props.children}
      </ul>
    </li>
  );
}
