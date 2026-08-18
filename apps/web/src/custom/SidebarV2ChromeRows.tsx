/**
 * The Sidebar V2 control rows — search, new thread, add project, and the
 * projects filter — see `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Metrics from Figma t3-fork node 149:6235: action rows use outer `ps-2 pe-3`
 * (8/12); the Projects header uses symmetric `px-3` (no leading icon). Inner
 * controls keep `px-1` + `gap-1`. Controls are 32px tall (h-8); the leading
 * icon still sits at 12px — the same axis as each card's status (list pad 8 +
 * card `px-1`).
 *
 * Fork-owned rather than fenced in place: this is pure presentation, and
 * leaving it inline meant `Sidebar.tsx` carried the whole rewrite while the
 * manifest could only watch the file it sat in. Here the fence upstream
 * carries collapses to call sites.
 *
 * The prop surface is wide because these rows are genuinely interactive — a
 * command palette trigger, a radio group, two labeled actions and a
 * per-project overflow action. It is all data and callbacks, though: no
 * upstream state is reached into, so an upstream refactor of how that state
 * is produced cannot break this file.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode, SVGProps } from "react";

import {
  EllipsisIcon,
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  PlusCircleIcon,
  SearchIcon,
} from "lucide-react";
import { CommandDialogTrigger } from "~/components/ui/command";
import { Kbd } from "~/components/ui/kbd";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { SidebarGroup, SidebarMenuButton } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { cn } from "~/lib/utils";
import { SIDEBAR_V2_TRAILING_OFFSET } from "./sidebarV2TrailingColumn";

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

/** These rows define the trailing column's axis rather than chasing it.
 *
 *  The group's pe-3 ends the row 12px in, and the flush 24px trailing button
 *  centres its glyph 12px further — the 24px axis every trailing mark in the
 *  sidebar measures against. Note the list rows do NOT share this right edge:
 *  they end 8px in, and each control there covers its own 4px however its
 *  geometry dictates (a card's px-1, me-1 on the bare-edge rows) — the
 *  derivations live in custom/sidebarV2TrailingColumn. An earlier revision
 *  here claimed both columns end at the same place; that premise was 4px
 *  wrong and every offset downstream inherited it.
 *
 *  The inset carries no scrollbar term. The list is a scroll container and
 *  once pushed its cards short of these rows by its reserved gutter; the list
 *  now gives that width back out of its own end padding, so a gutter term
 *  reappearing here would double-count it. */
const CONTROL_ROW = cn("flex h-8 items-center gap-1", SIDEBAR_V2_TRAILING_OFFSET.chromeRow);
/** Displaces sidebarMenuButtonVariants' base icon pair (muted-foreground at
    opacity-60, upstream v0.0.30): parent-level [&>svg] selectors outweigh the
    icon's own class, so without this the fork's /80 tint on the glyph is dead
    and the icon dims to 60% on top of the duotone layer's own alpha. twMerge
    keeps this later same-slot pair. One spelling, shared by every chrome-row
    button that renders an icon as a direct child; the guard asserts the merged
    outcome, so a base-selector change that stops displacing shows up red. */
export const CHROME_ROW_ICON_TINT = "[&>svg]:text-sidebar-muted-foreground/80 [&>svg]:opacity-100";
/** Shared 14px type for Search / New thread / Add project / Projects — literal
    so the panel's 13px text-xs remap cannot shrink them. Action controls and
    the static Projects label both read this; retuning it once keeps them
    aligned. */
const CHROME_TYPE = "text-[0.875rem] leading-4 font-normal text-sidebar-muted-foreground";
/** size-6 per the Figma chrome (24px boxes throughout the card-v2 design).
    That is the WCAG 2.5.8 floor for a fine pointer on an always-on control —
    deliberate and design-wide, not this button's private call; see the box
    note in custom/sidebarV2TrailingColumn, which takes the same stance for
    the list's controls. Coarse pointers get the 44px TOUCH_TARGET child. */
const TRAILING_BUTTON = cn(
  "relative size-6 shrink-0 justify-center rounded-md border-0 bg-transparent p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
  CHROME_ROW_ICON_TINT,
);
/** Coarse-pointer hit expansion — upstream's trick, kept: the visual button is
    24px, which is below the 44px touch target, so an invisible child grows the
    tappable area without moving anything. */
const TOUCH_TARGET =
  "pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

const CHROME_CONTROL = cn(
  "h-8 gap-1 rounded-md border-0 bg-transparent px-1 hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
  CHROME_TYPE,
);

const ACTION_GROUP = "ps-2 pe-3";

type ChromeIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** New thread and Add project share one shape; Search keeps its own
    (CommandDialogTrigger + Kbd). */
function ChromeLabeledAction(props: {
  readonly icon: ChromeIcon;
  readonly label: string;
  readonly ariaLabel: string;
  readonly title?: string | undefined;
  readonly testId: string;
  readonly disabled?: boolean | undefined;
  readonly onClick: () => void;
  readonly trailing?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className={CONTROL_ROW}>
      <SidebarMenuButton
        size="sm"
        type="button"
        className={cn("min-w-0 flex-1", CHROME_CONTROL, CHROME_ROW_ICON_TINT)}
        onClick={props.onClick}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        title={props.title}
        data-testid={props.testId}
      >
        <Icon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
        <span className="min-w-0 flex-1 truncate text-left">{props.label}</span>
        {props.trailing}
      </SidebarMenuButton>
    </div>
  );
}

function ChromeSearchRow(props: { readonly commandPaletteShortcutLabel: string | null }) {
  return (
    <div className={CONTROL_ROW}>
      <div className="min-w-0 flex-1">
        <CommandDialogTrigger
          render={
            <SidebarMenuButton
              size="sm"
              type="button"
              aria-label="Search threads and commands"
              className={cn(CHROME_CONTROL, CHROME_ROW_ICON_TINT)}
              data-testid="command-palette-trigger"
            />
          }
        >
          <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
          <div className="flex-1 truncate text-left">Search</div>
          {props.commandPaletteShortcutLabel ? (
            <Kbd className="h-5 min-w-0 rounded-sm bg-sidebar-control-surface px-1.5 text-[10px] text-sidebar-muted-foreground ring-0">
              {props.commandPaletteShortcutLabel}
            </Kbd>
          ) : null}
        </CommandDialogTrigger>
      </div>
    </div>
  );
}

/** Search + New thread + Add project share one group so Figma's stacked
 *  action block (149:6235) does not pick up inter-group padding. */
export function SidebarV2ChromeActionRows(props: {
  readonly commandPaletteShortcutLabel: string | null;
  readonly newThreadShortcutLabel: string | null;
  readonly newThreadDisabled: boolean;
  readonly onNewThread: () => void;
  readonly onAddProject: () => void;
}) {
  const newThreadDisabledReason = props.newThreadDisabled
    ? "Add a project to start a thread"
    : undefined;
  return (
    <SidebarGroup className={cn(ACTION_GROUP, "gap-1 pt-4 pb-0")}>
      <ChromeSearchRow commandPaletteShortcutLabel={props.commandPaletteShortcutLabel} />
      <ChromeLabeledAction
        icon={PlusCircleIcon}
        label="New thread"
        ariaLabel={
          props.newThreadDisabled
            ? newThreadDisabledReason!
            : props.newThreadShortcutLabel
              ? `New thread (${props.newThreadShortcutLabel})`
              : "New thread"
        }
        title={newThreadDisabledReason}
        testId="sidebar-v2-new-thread"
        disabled={props.newThreadDisabled}
        onClick={props.onNewThread}
        trailing={
          props.newThreadShortcutLabel && !props.newThreadDisabled ? (
            <Kbd className="h-5 min-w-0 rounded-sm bg-sidebar-control-surface px-1.5 text-[10px] text-sidebar-muted-foreground ring-0">
              {props.newThreadShortcutLabel}
            </Kbd>
          ) : null
        }
      />
      <ChromeLabeledAction
        icon={FolderPlusIcon}
        label="Add project"
        ariaLabel="Add project"
        testId="sidebar-v2-add-project"
        onClick={props.onAddProject}
      />
    </SidebarGroup>
  );
}

export function SidebarV2ProjectScopeRow<TProject extends SidebarV2ChromeProjectGroup>(props: {
  readonly projectGroups: ReadonlyArray<TProject>;
  readonly projectScopeKey: string | null;
  /** Display name for the active scope — null when showing all projects. */
  readonly scopedProjectDisplayName: string | null;
  readonly onProjectScopeChange: (scopeKey: string | null) => void;
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onProjectActions: (event: ReactMouseEvent<HTMLButtonElement>, project: TProject) => void;
  readonly groupByProject: boolean;
  readonly onGroupByProjectChange: (groupByProject: boolean) => void;
  /** Non-null disables the switch and says why — see the call site. */
  readonly groupByProjectUnavailableReason: string | null;
}) {
  if (props.projectGroups.length === 0) return null;

  const isScoped = props.projectScopeKey !== null;
  const filterAriaLabel = isScoped
    ? `Filter threads by project — showing ${props.scopedProjectDisplayName ?? "one project"}. Opens project filter and group-by.`
    : "Filter threads by project and group-by";
  const filterTooltip = isScoped
    ? `Showing ${props.scopedProjectDisplayName ?? "one project"}`
    : "Filter projects";

  return (
    // Figma 149:6235 — Projects: static label + filter trigger, px-12 py-8.
    // pt-2 is the 8px gap between the action block and this header.
    <SidebarGroup className="px-3 pt-2 pb-2">
      <div className={CONTROL_ROW}>
        <span
          role="heading"
          aria-level={2}
          className={cn("min-w-0 flex-1 truncate text-left", CHROME_TYPE)}
        >
          Projects
        </span>
        <Menu open={props.menuOpen} onOpenChange={props.onMenuOpenChange}>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      type="button"
                      className={cn(
                        TRAILING_BUTTON,
                        // Overrides CHROME_ROW_ICON_TINT's muted colour; opacity
                        // stays at the shared 100 from that const.
                        isScoped && "text-sidebar-foreground [&>svg]:text-sidebar-foreground",
                      )}
                      aria-label={filterAriaLabel}
                      data-testid="sidebar-v2-project-filter"
                      data-active={isScoped ? "true" : undefined}
                    />
                  }
                />
              }
            >
              <ListFilterIcon
                className={cn(
                  "size-4 shrink-0",
                  isScoped ? "text-sidebar-foreground" : "text-sidebar-muted-foreground/80",
                )}
              />
              <span className={TOUCH_TARGET} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="right">{filterTooltip}</TooltipPopup>
          </Tooltip>
          <MenuPopup align="end" className="min-w-56">
            {/* Above the scope list, not below it: with enough projects the
                list scrolls, and a preference that decides how the whole
                sidebar reads should not be the thing you have to scroll to.

                Disabled rather than inert when the sidebar is down to one
                project — by scope, or by there being only one — because
                grouping draws no header there. The reason rides on the
                accessible name and the native tooltip, so it reaches both the
                pointer and the screen reader rather than leaving either to
                infer it from a switch that does nothing. */}
            <MenuCheckboxItem
              variant="switch"
              closeOnClick={false}
              checked={props.groupByProject}
              onCheckedChange={props.onGroupByProjectChange}
              disabled={props.groupByProjectUnavailableReason !== null}
              aria-label={
                props.groupByProjectUnavailableReason === null
                  ? undefined
                  : `Group by project — ${props.groupByProjectUnavailableReason}`
              }
              title={props.groupByProjectUnavailableReason ?? undefined}
              className="h-8 min-h-8 px-2 py-0 text-sm font-medium"
              data-testid="sidebar-v2-group-by-project-toggle"
            >
              Group by project
            </MenuCheckboxItem>
            <MenuSeparator />
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
      </div>
    </SidebarGroup>
  );
}
