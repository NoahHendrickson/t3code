/**
 * The Sidebar V2 control rows — search, new agent, add project, usage, and
 * the projects filter — see `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Metrics from Figma t3-fork node 364:11246: the four action rows are the
 * design system's ghost Button (364:10544) stacked 2px apart inside the
 * panel's 8px inset — 32px tall, 10px corners, 12px inline padding, a 16px
 * leading icon 6px from a 14px Medium label, everything at the panel's
 * foreground. The Projects row below (368:21211) is the project headers'
 * shape on the same inset: a muted Label/12 label, then two 32px icon
 * buttons — sort and filter — on the list edge.
 *
 * Fork-owned rather than fenced in place: this is pure presentation, and
 * leaving it inline meant `Sidebar.tsx` carried the whole rewrite while the
 * manifest could only watch the file it sat in. Here the fence upstream
 * carries collapses to call sites.
 *
 * The prop surface is wide because these rows are genuinely interactive — a
 * command palette trigger, a radio group, three labeled actions and a
 * per-project overflow action. It is all data and callbacks, though: no
 * upstream state is reached into, so an upstream refactor of how that state
 * is produced cannot break this file.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import type { SidebarProjectSortOrder } from "@t3tools/contracts/settings";
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode, SVGProps } from "react";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, EllipsisIcon, FolderIcon, FolderPlusIcon, SearchIcon } from "lucide-react";
// Fork-only glyphs (no lucide counterpart) come from the shim's own path: this
// file is fork-owned, so there is no upstream import site to preserve.
import {
  ArrowUpDownIcon,
  ChartDonutIcon,
  FadersHorizontalIcon,
  NavigationArrowIcon,
} from "./icons/lucide-phosphor";
import { CommandDialogTrigger } from "~/components/ui/command";
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

/** Every chrome row sits on the list's own 8px inset now (the action block's
 *  px-2 and the Projects row's), so its trailing 32px buttons centre on the
 *  same 24px axis the project headers' do — see
 *  custom/sidebarV2TrailingColumn, which records the derivation. The inset
 *  carries no scrollbar term: the list gives its reserved gutter back out of
 *  its own end padding, so a gutter term here would double-count it. */
const CHROME_ROW_INSET = SIDEBAR_V2_TRAILING_OFFSET.chromeRow;
/** Displaces sidebarMenuButtonVariants' base icon pair (muted-foreground at
    opacity-60, upstream v0.0.30): parent-level [&>svg] selectors outweigh the
    icon's own class, so without this the fork's tint on the glyph is dead and
    the icon dims to 60% on top of the duotone layer's own alpha. twMerge
    keeps this later same-slot pair. One spelling, shared by every chrome-row
    button that renders an icon as a direct child; the guard asserts the
    merged outcome, so a base-selector change that stops displacing shows up
    red. The design (364:11246) tints the icon and the label alike, at the
    panel's foreground. */
export const CHROME_ROW_ICON_TINT = "[&>svg]:text-sidebar-foreground [&>svg]:opacity-100";
/** Label/14 Medium for Search / New agent / Add a project / Usage — literal
    so the panel's 13px text-xs remap cannot shrink them. The Projects label
    is the headers' Label/12 and spells its own. */
const CHROME_TYPE = "text-[0.875rem] leading-5 font-medium text-sidebar-foreground";
/** The Projects row's two icon buttons (Figma 368:21214 / 368:21215): the
    design system's 32px icon-only ghost button at muted foreground, the same
    box the project headers' plus and settings buttons draw. Icon tint is
    overridden to muted here (CHROME_ROW_ICON_TINT lifts it to foreground for
    the action rows), lifting back to foreground on hover. */
const PROJECTS_ROW_BUTTON = cn(
  "relative size-8 shrink-0 justify-center rounded-[10px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
  CHROME_ROW_ICON_TINT,
  "[&>svg]:text-current",
);

const SORT_ORDER_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SORT_ORDERS: ReadonlyArray<SidebarProjectSortOrder> = ["updated_at", "created_at", "manual"];

/** The design system's ghost Button at its default size (Figma 364:10544):
    h-32, 10px corners, px-12, gap-6, hover on the panel's row fill. Spelled on
    SidebarMenuButton rather than ui/button so the row keeps the sidebar's own
    hover token and the base-icon displacement above. */
const CHROME_ACTION = cn(
  "h-8 w-full gap-1.5 rounded-[10px] border-0 bg-transparent px-3 hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
  CHROME_TYPE,
  CHROME_ROW_ICON_TINT,
);

type ChromeIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** New agent, Add a project and Usage share one shape; Search keeps its own
    (CommandDialogTrigger). */
function ChromeLabeledAction(props: {
  readonly icon: ChromeIcon;
  readonly label: string;
  readonly ariaLabel: string;
  readonly title?: string | undefined;
  readonly testId: string;
  readonly disabled?: boolean | undefined;
  /** Holds the row in its hover fill. The New agent row is "active" while the
      open draft has no project yet — the column it opened is still the
      row's own until a project is chosen and the draft gets a card. */
  readonly active?: boolean | undefined;
  readonly onClick: () => void;
  readonly trailing?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <SidebarMenuButton
      size="sm"
      type="button"
      className={cn(CHROME_ACTION, props.active && "bg-sidebar-row-hover text-sidebar-foreground")}
      isActive={props.active === true}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      title={props.title}
      data-testid={props.testId}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{props.label}</span>
      {props.trailing}
    </SidebarMenuButton>
  );
}

function ChromeSearchRow(props: { readonly commandPaletteShortcutLabel: string | null }) {
  return (
    <CommandDialogTrigger
      render={
        <SidebarMenuButton
          size="sm"
          type="button"
          aria-label={
            props.commandPaletteShortcutLabel
              ? `Search threads and commands (${props.commandPaletteShortcutLabel})`
              : "Search threads and commands"
          }
          className={CHROME_ACTION}
          data-testid="command-palette-trigger"
        />
      }
    >
      <SearchIcon className="size-4 shrink-0" />
      <div className="flex-1 truncate text-left">Search</div>
    </CommandDialogTrigger>
  );
}

/** Search + New agent + Add a project + Usage share one group so Figma's
 *  stacked action block (364:11246) does not pick up inter-group padding: the
 *  block starts flush under the header and stacks its rows 2px apart inside
 *  the panel's 8px inset. */
export function SidebarV2ChromeActionRows(props: {
  readonly commandPaletteShortcutLabel: string | null;
  readonly newThreadShortcutLabel: string | null;
  readonly newThreadDisabled: boolean;
  /** True while the open draft is an unassigned "New agent" draft — see
      custom/newAgentDraft. The row keeps its hover fill until a project is
      chosen, which is when the draft leaves this row for a card. */
  readonly newThreadActive: boolean;
  readonly onNewThread: () => void;
  readonly onAddProject: () => void;
  readonly onUsage: () => void;
}) {
  const newThreadDisabledReason = props.newThreadDisabled
    ? "Add a project to start an agent"
    : undefined;
  return (
    <SidebarGroup className={cn("gap-0.5 px-2 pt-0 pb-0", CHROME_ROW_INSET)}>
      <ChromeSearchRow commandPaletteShortcutLabel={props.commandPaletteShortcutLabel} />
      <ChromeLabeledAction
        icon={NavigationArrowIcon}
        label="New agent"
        ariaLabel={
          props.newThreadDisabled
            ? newThreadDisabledReason!
            : props.newThreadShortcutLabel
              ? `New agent (${props.newThreadShortcutLabel})`
              : "New agent"
        }
        title={newThreadDisabledReason}
        testId="sidebar-v2-new-thread"
        disabled={props.newThreadDisabled}
        active={props.newThreadActive}
        onClick={props.onNewThread}
      />
      <ChromeLabeledAction
        icon={FolderPlusIcon}
        label="Add a project"
        ariaLabel="Add a project"
        testId="sidebar-v2-add-project"
        onClick={props.onAddProject}
      />
      <ChromeLabeledAction
        icon={ChartDonutIcon}
        label="Usage"
        ariaLabel="Usage"
        testId="sidebar-v2-usage"
        onClick={props.onUsage}
      />
    </SidebarGroup>
  );
}

/** A scope row: ui/menu's checkbox item shape (32px, rounded-sm, highlight on
    the accent) as one flex row on the switch row's 8px start inset, so the
    box, the icons and the labels stack on one edge with "Group by project". */
const SCOPE_ITEM =
  "flex h-8 min-h-8 cursor-pointer select-none items-center gap-2 rounded-sm ps-2 pe-1.5 text-sm font-medium text-foreground outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-64";
/** The design system's checkbox box (ui/checkbox), drawn on the menu item's
    own indicator: a bordered 16px square that fills with the primary colour
    when checked. keepMounted holds the empty box on unchecked rows, which is
    what tells the eye these are several independent toggles rather than one
    pick. The mark is the design's 3-stroke check at 12px. The two states are
    chosen off the checked prop rather than data-checked: variants, because
    the unchecked dark: fill sorts after data-checked: in Tailwind's cascade
    and was painting over the checked one. */
const SCOPE_CHECKBOX =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-[.25rem] border";
const SCOPE_CHECKBOX_OFF = "border-input bg-background shadow-xs/5 dark:bg-input/32";
const SCOPE_CHECKBOX_ON = "border-primary bg-primary text-primary-foreground";

const EMPTY_PROJECT_SCOPE: ReadonlySet<string> = new Set();

/** One row of the scope list. Built on Base UI's item directly rather than
    ui/menu's MenuCheckboxItem, whose indicator unmounts when unchecked and
    draws a bare check glyph — the box has to stay on screen either way. The
    data-slot keeps the fork's dark-mode hover wash (theme.custom.css) on it. */
function ScopeCheckboxItem(props: {
  readonly checked: boolean;
  readonly onCheckedChange: () => void;
  readonly testId?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      closeOnClick={false}
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      className={SCOPE_ITEM}
      data-slot="menu-checkbox-item"
      data-testid={props.testId}
    >
      <MenuPrimitive.CheckboxItemIndicator
        keepMounted
        className={cn(SCOPE_CHECKBOX, props.checked ? SCOPE_CHECKBOX_ON : SCOPE_CHECKBOX_OFF)}
      >
        {props.checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </MenuPrimitive.CheckboxItemIndicator>
      {props.children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function SidebarV2ProjectScopeRow<TProject extends SidebarV2ChromeProjectGroup>(props: {
  readonly projectGroups: ReadonlyArray<TProject>;
  /** Project keys the list is scoped to; empty means every project. */
  readonly projectScopeKeys: ReadonlySet<string>;
  /** Names the active scope — one project's name, or a count — null when
      showing all projects. */
  readonly scopedProjectDisplayName: string | null;
  readonly onProjectScopeChange: (scopeKeys: ReadonlySet<string>) => void;
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onProjectActions: (event: ReactMouseEvent<HTMLButtonElement>, project: TProject) => void;
  readonly groupByProject: boolean;
  readonly onGroupByProjectChange: (groupByProject: boolean) => void;
  /** Non-null disables the switch and says why — see the call site. */
  readonly groupByProjectUnavailableReason: string | null;
  /** The client's project sort order — the same setting the legacy sidebar's
      sort menu and Settings edit, so the surfaces cannot disagree. */
  readonly projectSortOrder: SidebarProjectSortOrder;
  readonly onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
}) {
  if (props.projectGroups.length === 0) return null;

  const isScoped = props.projectScopeKeys.size > 0;
  const filterAriaLabel = isScoped
    ? `Filter threads by project — showing ${props.scopedProjectDisplayName ?? "selected projects"}. Opens project filter and group-by.`
    : "Filter threads by project and group-by";
  const filterTooltip = isScoped
    ? `Showing ${props.scopedProjectDisplayName ?? "selected projects"}`
    : "Filter projects";
  const toggleProjectScope = (projectKey: string) => {
    const next = new Set(props.projectScopeKeys);
    if (!next.delete(projectKey)) next.add(projectKey);
    props.onProjectScopeChange(next);
  };
  const sortTooltip = `Sort projects — ${SORT_ORDER_LABELS[props.projectSortOrder]}`;

  return (
    // Figma 368:21211 — the project headers' row shape: a muted Label/12
    // label on the same 12px inset as the cards' prompt, then sort and filter
    // as 32px icon buttons pulled onto the list edge. pt-4 is the gap between
    // the action block and this row; the design (364:8534) leaves 24px
    // between the block and the first project group, and this row spends it.
    <SidebarGroup className={cn("px-2 pt-4 pb-0", CHROME_ROW_INSET)}>
      <div className="flex h-8 items-center gap-1.5 px-3">
        <span
          role="heading"
          aria-level={2}
          className="min-w-0 flex-1 truncate text-left text-[0.75rem] leading-4 font-medium text-muted-foreground"
        >
          Projects
        </span>
        <div className="-me-3 flex shrink-0 items-center">
          <Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    render={
                      <SidebarMenuButton
                        size="sm"
                        type="button"
                        className={PROJECTS_ROW_BUTTON}
                        aria-label={sortTooltip}
                        data-testid="sidebar-v2-project-sort"
                      />
                    }
                  />
                }
              >
                <ArrowUpDownIcon className="size-4 shrink-0" />
              </TooltipTrigger>
              <TooltipPopup side="right">{sortTooltip}</TooltipPopup>
            </Tooltip>
            <MenuPopup align="end" className="min-w-48">
              <MenuRadioGroup
                value={props.projectSortOrder}
                onValueChange={(value) =>
                  props.onProjectSortOrderChange(value as SidebarProjectSortOrder)
                }
              >
                {SORT_ORDERS.map((sortOrder) => (
                  <MenuRadioItem
                    key={sortOrder}
                    value={sortOrder}
                    closeOnClick
                    className="h-8 min-h-8 px-2 py-0 text-sm font-medium"
                  >
                    {SORT_ORDER_LABELS[sortOrder]}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
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
                          PROJECTS_ROW_BUTTON,
                          // The active scope lifts the glyph to foreground.
                          isScoped && "text-sidebar-foreground",
                        )}
                        aria-label={filterAriaLabel}
                        data-testid="sidebar-v2-project-filter"
                        data-active={isScoped ? "true" : undefined}
                      />
                    }
                  />
                }
              >
                <FadersHorizontalIcon className="size-4 shrink-0" />
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
              {/* Checkboxes, not radios: the scope is a set, so several
                  projects can be on at once and each toggles independently.
                  The menu stays open across toggles for the same reason the
                  switch above keeps it open — picking three projects should
                  not take three trips. "All projects" is checked while the
                  set is empty and clears it when chosen. */}
              <ScopeCheckboxItem
                checked={!isScoped}
                onCheckedChange={() => props.onProjectScopeChange(EMPTY_PROJECT_SCOPE)}
                testId="sidebar-v2-project-scope-all"
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="min-w-0 truncate text-sm">All projects</span>
              </ScopeCheckboxItem>
              {props.projectGroups.map((project) => (
                <ScopeCheckboxItem
                  key={project.projectKey}
                  checked={props.projectScopeKeys.has(project.projectKey)}
                  onCheckedChange={() => toggleProjectScope(project.projectKey)}
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
                    // Stopping pointerdown keeps the checkbox item from toggling
                    // the project as a side effect of reaching its overflow.
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => props.onProjectActions(event, project)}
                  >
                    <EllipsisIcon className="size-3.5" />
                  </button>
                </ScopeCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
      </div>
    </SidebarGroup>
  );
}
