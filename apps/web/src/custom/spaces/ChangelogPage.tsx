/**
 * A space's changelog page — see `.fork/customizations.yaml#fork-spaces` and
 * `changelog.logic.ts` for what an entry is made of.
 *
 * Set on the stage card like the Automations page, so Glass frames it the way
 * it frames a chat. An entry opens its PR in the PR page; the thread chip
 * opens the thread that linked the PR, when one did.
 */
import type { PullRequestListInput } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { WorkspacePageContainer } from "~/components/WorkspacePageContainer";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SidebarInset } from "~/components/ui/sidebar";
import { isElectron } from "~/env";
import { usePullRequestList, type EnvironmentQueryTarget } from "~/state/pullRequests";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { GitMergeIcon, HistoryIcon, MessagesSquareIcon } from "../icons/lucide-phosphor";
import { groupChangelogByWeek, parseConventionalTitle } from "./changelog.logic";
import { spaceHasProject, useSpace } from "./spaceProjects";

const CHANGELOG_LIMIT = 100;

export function ChangelogPage() {
  const search = useSearch({ from: "/changelog" });
  const space = useSpace(search.space);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div data-fork-stage-card="" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageHeader electron={isElectron} data-fork-stage-card-title="">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">Changelog</span>
            {space ? <span className="truncate text-muted-foreground">{space.label}</span> : null}
          </div>
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1" data-fork-stage-card-body="">
          <WorkspacePageContainer>
            {space === null ? (
              <p className="text-sm text-muted-foreground">
                Pick a space in the sidebar to see what it has shipped.
              </p>
            ) : (
              <ChangelogList space={space} />
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

function ChangelogList(props: { readonly space: NonNullable<ReturnType<typeof useSpace>> }) {
  const navigate = useNavigate();
  const { space } = props;
  const projectIdsByEnvironment = new Map<
    (typeof space.memberProjectRefs)[number]["environmentId"],
    Array<(typeof space.memberProjectRefs)[number]["projectId"]>
  >();
  for (const ref of space.memberProjectRefs) {
    const projectIds = projectIdsByEnvironment.get(ref.environmentId) ?? [];
    projectIds.push(ref.projectId);
    projectIdsByEnvironment.set(ref.environmentId, projectIds);
  }
  const targets = [...projectIdsByEnvironment].map(
    ([environmentId, projectIds]): EnvironmentQueryTarget<PullRequestListInput> => ({
      environmentId,
      input: { state: "merged", involvement: "all", projectIds, limit: CHANGELOG_LIMIT },
    }),
  );
  const list = usePullRequestList(targets);
  const shells = useThreadShellsForProjectRefs(space.memberProjectRefs);
  const threadByPullRequestUrl = new Map<string, (typeof shells)[number]>();
  for (const shell of shells) {
    for (const link of shell.pullRequests ?? []) threadByPullRequestUrl.set(link.url, shell);
  }
  const weeks = groupChangelogByWeek(
    (list.data?.entries ?? [])
      .filter((entry) => spaceHasProject(space, entry.environmentId, entry.projectId))
      .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    new Date(),
  );

  if (list.error !== null && list.data === null) {
    return <p className="text-sm text-destructive-foreground">{list.error}</p>;
  }
  if (list.data === null) {
    return <p className="text-sm text-muted-foreground">Loading changelog…</p>;
  }
  if (weeks.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing merged in {space.label} yet.</p>;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="space-changelog">
      {weeks.map((week) => (
        <section key={week.label} className="flex flex-col gap-1">
          <h2 className="px-2 text-xs font-medium text-muted-foreground">{week.label}</h2>
          <ul className="flex flex-col">
            {week.entries.map((entry) => {
              const title = parseConventionalTitle(entry.title);
              const thread = threadByPullRequestUrl.get(entry.url);
              return (
                <li
                  key={`${entry.environmentId}:${entry.host}:${entry.repository}#${entry.number}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/40"
                >
                  <GitMergeIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void navigate({
                          to: "/pull-requests",
                          search: {
                            involvement: "all",
                            state: "merged",
                            repository: entry.repository,
                            number: entry.number,
                            selectedHost: entry.host,
                            selectedProjectId: entry.projectId,
                            selectedEnvironmentId: entry.environmentId,
                          },
                        })
                      }
                      className="flex min-w-0 cursor-pointer items-baseline gap-2 text-left text-sm text-foreground hover:underline"
                    >
                      {title.kind ? (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {title.kind}
                          {title.scope ? `(${title.scope})` : ""}
                        </span>
                      ) : null}
                      <span className="min-w-0 truncate">{title.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        #{entry.number}
                      </span>
                    </button>
                    <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                      <span className="shrink-0">{formatRelativeTimeLabel(entry.updatedAt)}</span>
                      {thread ? (
                        <button
                          type="button"
                          onClick={() =>
                            void navigate({
                              to: "/$environmentId/$threadId",
                              params: buildThreadRouteParams(
                                scopeThreadRef(thread.environmentId, thread.id),
                              ),
                            })
                          }
                          className="flex min-w-0 cursor-pointer items-center gap-1 hover:text-foreground"
                        >
                          <MessagesSquareIcon aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">{thread.title}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
