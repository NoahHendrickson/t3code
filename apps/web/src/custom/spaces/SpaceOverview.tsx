/**
 * A space's overview — see `.fork/customizations.yaml#fork-spaces`.
 *
 * Under Spaces a space's Home is its new-thread draft: the chat view's own
 * composer, centred under the draft's headline, so a thread started there is
 * an ordinary first send. ChatView draws this overview beneath that composer
 * while the draft is empty: the space's active threads, its open pull
 * requests, what merged lately, and its automations, each with a way through
 * to the full view. Every section reads data the app already fetches for its
 * own page; nothing here is new state.
 */
import type { EnvironmentId, PullRequestListInput, ScopedProjectRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { filterSidebarV2VisibleThreads } from "~/components/Sidebar.logic";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { usePullRequestList, type EnvironmentQueryTarget } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel, formatRelativeTimeUntil } from "~/timestampFormat";

import {
  GitMergeIcon,
  GitPullRequestIcon,
  HistoryIcon,
  MessagesSquareIcon,
  ZapIcon,
} from "../icons/lucide-phosphor";
import { ProviderMark } from "../icons/ProviderMarks";
import { ScheduledCard, ScheduledSectionLabel } from "../scheduled/scheduledPageChrome";
import { parseConventionalTitle } from "./changelog.logic";
import { spaceHasProject, useSpaceOfProject } from "./spaceProjects";
import { ThreadStatusMark, useThreadProvider } from "./SpaceThreadTabs";

type Space = NonNullable<ReturnType<typeof useSpaceOfProject>>;

/** How many rows a section shows before its link through to the full view. */
const SECTION_LIMIT = 5;

/** The overview for a draft's project, when it belongs to a space. */
export function SpaceDraftOverview(props: { readonly project: ScopedProjectRef }) {
  const space = useSpaceOfProject(props.project);
  return space === null ? null : <SpaceOverview space={space} />;
}

function SpaceOverview(props: { readonly space: Space }) {
  const navigate = useNavigate();
  const { space } = props;
  const environmentIds = [...new Set(space.memberProjectRefs.map((ref) => ref.environmentId))];
  return (
    <div className="flex flex-col gap-8" data-testid="space-home">
      <SpaceThreads space={space} />
      <SpacePullRequests space={space} state="open" />
      <SpacePullRequests space={space} state="merged" />
      <Section
        icon={ZapIcon}
        title="Automations"
        link={{
          label: "All automations",
          onClick: () => void navigate({ to: "/scheduled", search: { space: space.key } }),
        }}
      >
        {environmentIds.map((environmentId) => (
          <SpaceAutomations key={environmentId} space={space} environmentId={environmentId} />
        ))}
      </Section>
    </div>
  );
}

function Section(props: {
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly title: string;
  /** The way through to the section's full view. */
  readonly link?: { readonly label: string; readonly onClick: () => void };
  readonly children: ReactNode;
}) {
  const Icon = props.icon;
  const { link } = props;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <ScheduledSectionLabel>{props.title}</ScheduledSectionLabel>
        {link ? (
          <button
            type="button"
            onClick={link.onClick}
            className="ms-auto cursor-pointer text-sm text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </button>
        ) : null}
      </div>
      <ScheduledCard>
        <ul className="flex flex-col divide-y divide-border/60">{props.children}</ul>
      </ScheduledCard>
    </section>
  );
}

function Row(props: {
  readonly lead: ReactNode;
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={props.onClick}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-accent/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">{props.lead}</span>
        <span className="min-w-0 flex-1 truncate">{props.title}</span>
        {props.trailing}
      </button>
    </li>
  );
}

function Empty(props: { readonly children: string }) {
  return <li className="list-none px-3 py-2.5 text-sm text-muted-foreground">{props.children}</li>;
}

/** The space's working set: what the sidebar would show for it, neither
    settled nor snoozed, which the sidebar shelves. Pinned threads count: they
    are the space's too, only arranged above the rest. */
function SpaceThreads(props: { readonly space: Space }) {
  const navigate = useNavigate();
  const providerFor = useThreadProvider();
  const shells = useThreadShellsForProjectRefs(props.space.memberProjectRefs);
  const snapshotNow = new Date().toISOString();
  const threads = filterSidebarV2VisibleThreads(shells, null)
    .filter(
      (shell) =>
        shell.settledOverride !== "settled" && !effectiveSnoozed(shell, { now: snapshotNow }),
    )
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return (
    <Section icon={MessagesSquareIcon} title={`Threads · ${threads.length}`}>
      {threads.length === 0 ? <Empty>No active threads.</Empty> : null}
      {threads.map((shell) => (
        <Row
          key={`${shell.environmentId}:${shell.id}`}
          lead={<ProviderMark {...providerFor(shell)} />}
          title={shell.title}
          trailing={
            <>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTimeLabel(shell.updatedAt)}
              </span>
              <ThreadStatusMark shell={shell} />
            </>
          }
          onClick={() =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(scopeThreadRef(shell.environmentId, shell.id)),
            })
          }
        />
      ))}
    </Section>
  );
}

/** Open pull requests, or the latest merged ones, in the space. */
function SpacePullRequests(props: { readonly space: Space; readonly state: "open" | "merged" }) {
  const navigate = useNavigate();
  const { space, state } = props;
  const projectIdsByEnvironment = new Map<
    EnvironmentId,
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
      input: { state, involvement: "all", projectIds, limit: SECTION_LIMIT },
    }),
  );
  const list = usePullRequestList(targets);
  const entries = (list.data?.entries ?? [])
    .filter((entry) => spaceHasProject(space, entry.environmentId, entry.projectId))
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, SECTION_LIMIT);
  const merged = state === "merged";
  return (
    <Section
      icon={merged ? HistoryIcon : GitPullRequestIcon}
      title={merged ? "Recently merged" : "Open pull requests"}
      link={
        merged
          ? {
              label: "Changelog",
              onClick: () => void navigate({ to: "/changelog", search: { space: space.key } }),
            }
          : {
              label: "All pull requests",
              onClick: () =>
                void navigate({
                  to: "/pull-requests",
                  search: {
                    involvement: "all",
                    state: "open",
                    environmentId: space.representative.environmentId,
                    projectId: space.representative.id,
                  },
                }),
            }
      }
    >
      {list.data === null ? (
        <Empty>{list.error ?? "Loading…"}</Empty>
      ) : entries.length === 0 ? (
        <Empty>{merged ? "Nothing merged yet." : "No open pull requests."}</Empty>
      ) : null}
      {entries.map((entry) => (
        <Row
          key={`${entry.environmentId}:${entry.host}:${entry.repository}#${entry.number}`}
          lead={
            merged ? (
              <GitMergeIcon aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <GitPullRequestIcon aria-hidden className="size-4 text-muted-foreground" />
            )
          }
          title={merged ? parseConventionalTitle(entry.title).subject : entry.title}
          trailing={
            <span className="shrink-0 text-xs text-muted-foreground">
              #{entry.number} · {formatRelativeTimeLabel(entry.updatedAt)}
            </span>
          }
          onClick={() =>
            void navigate({
              to: "/pull-requests",
              search: {
                involvement: "all",
                state,
                repository: entry.repository,
                number: entry.number,
                selectedHost: entry.host,
                selectedProjectId: entry.projectId,
                selectedEnvironmentId: entry.environmentId,
              },
            })
          }
        />
      ))}
    </Section>
  );
}

/** One environment's automations in the space. */
function SpaceAutomations(props: { readonly space: Space; readonly environmentId: EnvironmentId }) {
  const navigate = useNavigate();
  const { space, environmentId } = props;
  const query = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const tasks = (query.data?.tasks ?? []).filter((task) =>
    spaceHasProject(space, environmentId, task.projectId),
  );
  if (query.data === null) return <Empty>{query.error ?? "Loading…"}</Empty>;
  if (tasks.length === 0) return <Empty>No automations.</Empty>;
  return tasks.map((task) => (
    <Row
      key={task.id}
      lead={<ZapIcon aria-hidden className="size-4 text-muted-foreground" />}
      title={task.title}
      trailing={
        <span className="shrink-0 text-xs text-muted-foreground">
          {!task.enabled
            ? "Paused"
            : task.nextRunAt
              ? nextRunLabel(task.nextRunAt)
              : task.lastRunAt
                ? `Ran ${formatRelativeTimeLabel(task.lastRunAt)}`
                : "Not run yet"}
        </span>
      }
      onClick={() =>
        void navigate({ to: "/scheduled", search: { env: environmentId, task: task.id } })
      }
    />
  ));
}

function nextRunLabel(nextRunAt: string): string {
  const until = formatRelativeTimeUntil(nextRunAt);
  if (until === null || until.suffix === null) return "Runs soon";
  return `Next in ${until.value}`;
}
