/**
 * The Sidebar V2 control rows — search, and the project scope filter — see
 * `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Both rows are 36px and 12px, down from upstream's 32/14, so they read as
 * chrome rather than as two more list items stacked above the thread list. The
 * group keeps `px-2` so a hover fill lands on the same 8px inset the thread
 * cards use, and the extra `px-2` on each control brings the content to the
 * design's 16px.
 *
 * Fork-owned rather than fenced in place: this is ~150 lines of pure
 * presentation, and leaving it inline meant `SidebarV2.tsx` carried the whole
 * rewrite while the manifest could only watch the file it sat in. Here the
 * fence upstream carries collapses to a call site.
 *
 * The prop surface is wide because these rows are genuinely interactive — a
 * command palette trigger, a radio group, two buttons and a per-project
 * overflow action. It is all data and callbacks, though: no upstream state is
 * reached into, so an upstream refactor of how that state is produced cannot
 * break this file.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import type { MouseEvent as ReactMouseEvent } from "react";

import {
  ChevronsUpDownIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusCircleIcon,
  SearchIcon,
} from "lucide-react";
import { CommandDialogTrigger } from "~/components/ui/command";
import { Kbd } from "~/components/ui/kbd";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "~/components/ui/menu";
import { SidebarGroup, SidebarMenuButton } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { ProjectFavicon } from "~/components/ProjectFavicon";

/** Structural on purpose: the four fields these rows read, no more. The row is
    generic over anything satisfying it, so the callbacks hand back upstream's
    own richer project object untouched — the seam stays narrow without the fork
    having to restate, or import, a type it does not use. */
export interface SidebarV2ChromeProjectGroup {
  readonly projectKey: string;
  readonly displayName: string;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
}

/** The trailing inset is the thread list's scrollbar, borrowed.
 *
 *  These rows and the thread list below them sit in sibling containers with
 *  identical 8px padding, so by rights their content edges agree. They do not:
 *  the list is a scroll container, its scrollbar takes real layout width, and
 *  every card ends up 6px short of where these rows end. The trailing button
 *  then overhangs the cards by exactly that much.
 *
 *  Read from `--app-scrollbar-width` rather than written as 6px, so the two
 *  stay aligned if upstream ever retunes the scrollbar. Padding rather than a
 *  narrower width so the row's own background, if it ever gains one, still
 *  spans the full column. */
const CONTROL_ROW = "flex h-9 items-center gap-1 pe-[var(--app-scrollbar-width)]";
const TRAILING_BUTTON =
  "relative size-8 shrink-0 justify-center rounded-md border-0 bg-transparent p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";
/** Coarse-pointer hit expansion — upstream's trick, kept: the visual button is
    32px, which is below the 44px touch target, so an invisible child grows the
    tappable area without moving anything. */
const TOUCH_TARGET =
  "pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

export function SidebarV2SearchRow(props: {
  readonly commandPaletteShortcutLabel: string | null;
  readonly newThreadShortcutLabel: string | null;
  readonly newThreadDisabled: boolean;
  readonly onNewThread: () => void;
}) {
  return (
    <SidebarGroup className="px-2 py-0">
      <div className={CONTROL_ROW}>
        <div className="min-w-0 flex-1">
          <CommandDialogTrigger
            render={
              <SidebarMenuButton
                size="sm"
                type="button"
                aria-label="Search threads and commands"
                className="h-8 gap-1 rounded-md border-0 bg-transparent px-2 py-1.5 text-xs font-normal text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                data-testid="command-palette-trigger"
              />
            }
          >
            <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
            <div className="flex-1 truncate text-left">Search</div>
            {props.commandPaletteShortcutLabel ? (
              <Kbd className="h-4 min-w-0 rounded-sm bg-sidebar-control-surface px-1.5 text-[10px] text-sidebar-muted-foreground ring-0">
                {props.commandPaletteShortcutLabel}
              </Kbd>
            ) : null}
          </CommandDialogTrigger>
        </div>
        <div className="shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="sm"
                  type="button"
                  className={TRAILING_BUTTON}
                  onClick={props.onNewThread}
                  disabled={props.newThreadDisabled}
                  aria-label="New thread"
                />
              }
            >
              <PlusCircleIcon className="size-5 shrink-0 text-sidebar-muted-foreground/80" />
              <span className={TOUCH_TARGET} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="right">
              {props.newThreadShortcutLabel
                ? `New thread (${props.newThreadShortcutLabel})`
                : "New thread"}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </SidebarGroup>
  );
}

export function SidebarV2ProjectScopeRow<TProject extends SidebarV2ChromeProjectGroup>(props: {
  readonly projectGroups: ReadonlyArray<TProject>;
  readonly scopedProjectGroup: TProject | null;
  readonly projectScopeKey: string | null;
  readonly onProjectScopeChange: (scopeKey: string | null) => void;
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onProjectActions: (event: ReactMouseEvent<HTMLButtonElement>, project: TProject) => void;
  readonly onAddProject: () => void;
}) {
  if (props.projectGroups.length === 0) return null;

  return (
    <SidebarGroup className="px-2 py-0">
      <div className={CONTROL_ROW}>
        <Menu open={props.menuOpen} onOpenChange={props.onMenuOpenChange}>
          <MenuTrigger
            aria-label="Filter threads by project"
            className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 text-left text-xs font-normal text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          >
            {/* Leading caret, no trailing chevron and no favicon: the design
                puts the affordance where the eye enters the row, and the label
                already names the project the favicon used to repeat. */}
            <ChevronsUpDownIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
            <span className="min-w-0 flex-1 truncate">
              {props.scopedProjectGroup?.displayName ?? "All projects"}
            </span>
          </MenuTrigger>
          <MenuPopup align="start" className="w-(--anchor-width)">
            <MenuRadioGroup
              value={props.projectScopeKey ?? "all"}
              onValueChange={(value) =>
                props.onProjectScopeChange(value === "all" ? null : (value as string))
              }
            >
              <MenuRadioItem
                value="all"
                closeOnClick
                className="h-8 min-h-8 px-1 py-0 text-sm font-medium [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="min-w-0 truncate text-sm">All projects</span>
              </MenuRadioItem>
              {props.projectGroups.map((project) => (
                <MenuRadioItem
                  key={project.projectKey}
                  value={project.projectKey}
                  closeOnClick
                  className="h-8 min-h-8 px-1 py-0 text-sm font-medium [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
                >
                  <ProjectFavicon
                    environmentId={project.environmentId}
                    cwd={project.workspaceRoot}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 truncate text-sm">{project.displayName}</span>
                  <button
                    type="button"
                    aria-label={`Project actions for ${project.displayName}`}
                    title={`Project actions for ${project.displayName}`}
                    className="ml-auto inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/55 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    // Stopping pointerdown keeps the radio item from selecting
                    // the project as a side effect of reaching its overflow.
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => props.onProjectActions(event, project)}
                  >
                    <EllipsisIcon className="size-3.5" />
                  </button>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuButton
                size="sm"
                className={TRAILING_BUTTON}
                onClick={props.onAddProject}
                type="button"
                aria-label="New project"
              />
            }
          >
            {/* FolderOpen rather than FolderPlus, per the design. The action is
                unchanged — it opens the palette to pick a folder to add — and
                "open a folder" is the more literal reading of the click. */}
            <FolderOpenIcon className="size-5 shrink-0 text-sidebar-muted-foreground/80" />
            <span className={TOUCH_TARGET} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="right">New project</TooltipPopup>
        </Tooltip>
      </div>
    </SidebarGroup>
  );
}
