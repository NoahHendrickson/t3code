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

interface ComposerContextRowProps {
  children: ReactNode;
  className?: string;
}

/** Repository and worktree controls that sit above the prompt surface. */
export const ComposerContextRow = memo(function ComposerContextRow({
  children,
  className,
}: ComposerContextRowProps) {
  return (
    <div
      data-fork-composer-context-row="true"
      className={cn("flex min-w-0 items-center pb-2", className)}
    >
      {children}
    </div>
  );
});

/**
 * The composer's control row, below the prompt surface. Run modes stay left;
 * context usage, model and effort stay right.
 */
export const ComposerControlRow = memo(function ComposerControlRow({
  left,
  right,
  className,
}: ComposerControlRowProps) {
  return (
    <div
      data-fork-composer-control-row="true"
      className={cn("flex min-h-6 min-w-0 items-center justify-between gap-2 pt-2", className)}
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
