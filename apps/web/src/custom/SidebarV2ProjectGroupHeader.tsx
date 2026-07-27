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
 * The first group drops the top margin: it butts against the chrome rows, which
 * carry their own spacing.
 */
import { FolderIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export function SidebarV2ProjectGroupHeader(props: {
  readonly label: string;
  readonly isFirst: boolean;
}) {
  return (
    <li data-thread-selection-safe className="list-none">
      <div
        data-testid="sidebar-v2-project-group-header"
        className={cn(
          "mb-1 flex w-full items-center gap-2 px-2.5 text-left",
          props.isFirst ? "mt-1" : "mt-3",
        )}
      >
        {/* The same folder mark the scope menu lists projects with, so a header
            and its menu entry read as the same object. */}
        <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground/70">
          {props.label}
        </span>
      </div>
    </li>
  );
}
