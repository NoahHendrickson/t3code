/**
 * The quick-start strip above the Threads row — see
 * `.fork/customizations.yaml#fork-sidebar-recent-projects`.
 *
 * One chip per recently active project: its icon, then a plus. A click starts
 * a new agent already in that project, the same path a project header's plus
 * takes, so the two cannot disagree about which environment it lands in.
 *
 * Reads the thread shells itself (as the Automations row does), so the
 * Sidebar.tsx call site passes only the project groups and the start action.
 */
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { filterSidebarV2VisibleThreads } from "~/components/Sidebar.logic";
import { SidebarGroup } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useThreadShells } from "~/state/entities";
import { PlusIcon } from "./icons/lucide-phosphor";
import type { SidebarV2ChromeProjectGroup } from "./SidebarV2ChromeRows";
import { createProjectRefIndex, type SidebarV2GroupableProject } from "./sidebarV2ProjectGrouping";
import {
  pickSidebarV2RecentProjects,
  rankSidebarV2RecentProjectKeys,
} from "./sidebarV2RecentProjects";

export function SidebarV2RecentProjectsStrip<
  TProject extends SidebarV2ChromeProjectGroup & SidebarV2GroupableProject,
>(props: {
  readonly projectGroups: ReadonlyArray<TProject>;
  readonly onStartAgent: (projectKey: string) => void;
}) {
  const threads = useThreadShells();
  const recentProjects = pickSidebarV2RecentProjects(
    rankSidebarV2RecentProjectKeys({
      threads: filterSidebarV2VisibleThreads(threads, null),
      projectRefIndex: createProjectRefIndex(props.projectGroups),
    }),
    props.projectGroups,
  );
  if (recentProjects.length === 0) return null;

  return (
    // mt-3 sits it closer to the action block than the Threads row's mt-6
    // does, so it reads as one more action rather than the start of the list.
    // The chip's px-1 plus the row's ps-2 puts each favicon on the
    // action rows' 12px icon column. The row scrolls sideways rather than
    // wrapping when a narrow sidebar cannot fit every chip; a scroller clips
    // both axes, so py-1 (paid back by -my-1) and pe-1 leave room for Glass's
    // halo round each chip.
    <SidebarGroup data-fork-recent-projects="" className="mt-3 px-2 pt-0 pb-0">
      <div className="-my-1 flex gap-1.5 overflow-x-auto py-1 ps-2 pe-1 [scrollbar-width:none]">
        {recentProjects.map((project) => (
          <Tooltip key={project.projectKey}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`New agent in ${project.displayName}`}
                  data-testid="sidebar-v2-recent-project"
                  // Glass draws its rim on this (theme.custom.glass-surfaces.css).
                  data-fork-recent-project=""
                  className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-[6px] bg-white/8 px-1 text-muted-foreground hover:bg-white/12 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => props.onStartAgent(project.projectKey)}
                />
              }
            >
              <ProjectFavicon project={project} className="size-4 shrink-0" />
              <PlusIcon className="size-3 shrink-0" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">New agent in {project.displayName}</TooltipPopup>
          </Tooltip>
        ))}
      </div>
    </SidebarGroup>
  );
}
