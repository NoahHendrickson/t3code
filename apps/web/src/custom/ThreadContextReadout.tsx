/**
 * A started thread's project and branch, read-only, in the composer's context
 * row — see `.fork/customizations.yaml#fork-composer-shell`.
 *
 * Upstream drops the context strip once a thread starts (unless "Composer
 * context" is on), leaving the project and branch only in the details card.
 * Both are pinned by then, so this repeats them as plain chips: no menus, and
 * no workspace-mode label. The worktree mark replaces the branch glyph when
 * the thread runs in a worktree, as on the sidebar card. The spans carry
 * `data-fork-context-chip`, so the row's CSS paints them like the draft's
 * interactive chips.
 */
import { ProjectFavicon, type ProjectFaviconProject } from "~/components/ProjectFavicon";

import { FolderIcon, GitBranchIcon } from "./icons/lucide-phosphor";
import { WorktreeIcon } from "./icons/WorktreeIcon";

const READOUT_CHIP_CLASS_NAME =
  "inline-flex h-7 min-w-0 items-center gap-1 border border-transparent px-1.75 font-normal text-muted-foreground/70 text-xs sm:h-6";

export function ThreadContextReadout(props: {
  readonly project: ProjectFaviconProject;
  /** Null outside a git repo, or before the branch resolves. */
  readonly branch: string | null;
  readonly inWorktree: boolean;
}) {
  const BranchIcon = props.inWorktree ? WorktreeIcon : GitBranchIcon;
  return (
    <>
      <span
        data-fork-context-chip
        data-composer-context-control
        data-testid="thread-project-readout"
        className={`${READOUT_CHIP_CLASS_NAME} max-w-72 shrink-0`}
      >
        <ProjectFavicon
          project={props.project}
          className="size-3 shrink-0"
          fallbackIcon={FolderIcon}
        />
        <span className="min-w-0 truncate">{props.project.title}</span>
      </span>
      {props.branch ? (
        <span
          data-fork-context-chip
          data-composer-context-control
          data-testid="thread-branch-readout"
          className={READOUT_CHIP_CLASS_NAME}
        >
          <BranchIcon className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{props.branch}</span>
        </span>
      ) : null}
    </>
  );
}
