import { memo, type ReactNode } from "react";
import { cn } from "~/lib/utils";

interface ComposerControlRowProps {
  /** Run controls that belong to the message: runtime mode, plan mode, plan sidebar. */
  left: ReactNode;
  /**
   * Where the message runs: the worktree/branch context strip. Absent on a
   * project with no git repo, which leaves the row left-aligned rather than
   * collapsing it — the left controls still apply.
   */
  right?: ReactNode;
  className?: string;
}

/**
 * The composer's control row, below the box rather than inside it.
 *
 * The designs put the run controls and the worktree/branch pair on one line
 * outside the composer, 4px under it, inset to the box's own 16px padding so
 * the two read as one column. Upstream splits these across two places — mode
 * controls inside the box's footer, BranchToolbar as a separate strip stitched
 * to the box's underside by a shared glass outline — so this joins them and
 * `theme.custom.css` unpicks the stitching.
 */
export const ComposerControlRow = memo(function ComposerControlRow({
  left,
  right,
  className,
}: ComposerControlRowProps) {
  return (
    <div
      data-fork-composer-control-row="true"
      className={cn("flex min-w-0 items-center justify-between gap-2 px-4 pt-1", className)}
    >
      <div
        data-fork-composer-control-row-slot="left"
        className="-m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {left}
      </div>
      {right ? (
        <div
          data-fork-composer-control-row-slot="right"
          className="flex min-w-0 shrink-0 items-center justify-end"
        >
          {right}
        </div>
      ) : null}
    </div>
  );
});
