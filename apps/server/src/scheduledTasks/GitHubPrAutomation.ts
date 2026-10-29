import {
  ScheduledTaskError,
  type GitHubPrAutomationRepository,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubRest from "@t3tools/source-control-github/server/GitHubRest";

const Repository = Schema.Struct({ full_name: Schema.String, default_branch: Schema.String });
const Hook = Schema.Struct({ id: Schema.Int, config: Schema.Struct({ url: Schema.String }) });
const Hooks = Schema.Array(Hook);
const repositoryPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/** Only origin is used: a fork's upstream remote must never receive its automation. */
export function githubRepositoryFromOrigin(origin: string): string | null {
  // Credentials or a port may sit in the URL; neither changes the repository.
  const match =
    /^(?:(?:https|ssh):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|(?:[^@/]+@)?github\.com:)([^?#]+?)\/?$/i.exec(
      origin.trim(),
    );
  const repository = match?.[1]?.replace(/\.git$/, "");
  return repository && repositoryPattern.test(repository) ? repository : null;
}

export class GitHubPrAutomation extends Context.Service<
  GitHubPrAutomation,
  {
    readonly connect: (input: {
      readonly projectIds: ReadonlyArray<ProjectId>;
      readonly url: string;
      readonly secret: string;
    }) => Effect.Effect<ReadonlyArray<GitHubPrAutomationRepository>, ScheduledTaskError>;
    readonly remove: (
      repositories: ReadonlyArray<GitHubPrAutomationRepository>,
    ) => Effect.Effect<void, ScheduledTaskError>;
  }
>()("t3/scheduledTasks/GitHubPrAutomation") {}

export const make = Effect.gen(function* () {
  const api = yield* GitHubRest.GitHubRest;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const vcs = yield* VcsProcess.VcsProcess;
  const rest = (input: Omit<GitHubRest.GitHubRestInput, "host" | "operation">) =>
    api
      .rest({
        ...input,
        host: "github.com",
        operation: "scheduledTask.githubPr",
        allowReserve: true,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ScheduledTaskError({
              message:
                "Could not connect the GitHub automation. Check GitHub access in Settings → Source Control, including permission to manage repository webhooks.",
              cause,
            }),
        ),
      );
  const decode = <S extends Schema.Top>(schema: S, body: string) =>
    Schema.decodeEffect(Schema.fromJsonString(schema))(body).pipe(
      Effect.mapError(
        (cause) =>
          new ScheduledTaskError({
            message: "GitHub returned an unexpected automation response.",
            cause,
          }),
      ),
    );
  const remove = Effect.fn("GitHubPrAutomation.remove")(function* (
    repositories: ReadonlyArray<GitHubPrAutomationRepository>,
  ) {
    for (const repository of repositories) {
      if (!repository.nameWithOwner || repository.hookId === undefined) continue;
      yield* api
        .rest({
          host: "github.com",
          operation: "scheduledTask.githubPr.remove",
          method: "DELETE",
          path: `repos/${repository.nameWithOwner}/hooks/${repository.hookId}`,
          allowReserve: true,
        })
        .pipe(
          Effect.catchTags({ GitHubApiNotFoundError: () => Effect.succeed(null) }),
          Effect.mapError(
            (cause) =>
              new ScheduledTaskError({
                message:
                  "Could not remove the GitHub connection. Check GitHub access and try again.",
                cause,
              }),
          ),
        );
    }
  });
  const connect = Effect.fn("GitHubPrAutomation.connect")(function* (input: {
    readonly projectIds: ReadonlyArray<ProjectId>;
    readonly url: string;
    readonly secret: string;
  }) {
    const candidates = yield* Effect.forEach(
      [...new Set(input.projectIds)],
      (projectId) =>
        Effect.gen(function* () {
          const project = yield* projects.get(projectId).pipe(
            Effect.mapError(
              (cause) =>
                new ScheduledTaskError({
                  message: "Could not load the selected project.",
                  cause,
                }),
            ),
          );
          if (Option.isNone(project))
            return yield* new ScheduledTaskError({
              message: "A selected project no longer exists. Choose its replacement.",
            });
          const remote = yield* vcs
            .run({
              command: "git",
              args: ["remote", "get-url", "origin"],
              cwd: project.value.workspaceRoot,
              operation: "scheduledTask.githubOrigin",
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ScheduledTaskError({
                    message: `Could not read the GitHub repository for ${project.value.title}.`,
                    cause,
                  }),
              ),
            );
          const name = githubRepositoryFromOrigin(remote.stdout);
          if (name === null)
            return yield* new ScheduledTaskError({
              message: `${project.value.title} needs a github.com origin remote to use this trigger.`,
            });
          const repository = yield* decode(
            Repository,
            (yield* rest({ path: `repos/${name}` })).body,
          );
          if (!repositoryPattern.test(repository.full_name))
            return yield* new ScheduledTaskError({
              message: "GitHub returned an invalid repository name.",
            });
          // Read every page before creating anything, so a retry finds a hook even after a lost response.
          const hooks: Array<typeof Hook.Type> = [];
          for (let page = 1; ; page++) {
            const batch = yield* decode(
              Hooks,
              (yield* rest({
                path: `repos/${repository.full_name}/hooks?per_page=100&page=${page}`,
              })).body,
            );
            hooks.push(...batch);
            if (batch.length < 100) break;
            if (page === 100)
              return yield* new ScheduledTaskError({
                message: "Too many GitHub webhooks to safely connect this repository.",
              });
          }
          return {
            projectId,
            nameWithOwner: repository.full_name,
            defaultBranch: repository.default_branch,
            existing: hooks.find((hook) => hook.config.url === input.url),
          };
        }),
      { concurrency: 1 },
    );
    if (
      new Set(candidates.map((entry) => entry.nameWithOwner.toLowerCase())).size !==
      candidates.length
    ) {
      return yield* new ScheduledTaskError({
        message: "Select only one project for each GitHub repository.",
      });
    }
    const created: Array<GitHubPrAutomationRepository> = [];
    return yield* Effect.forEach(
      candidates,
      (candidate) =>
        Effect.gen(function* () {
          const { existing, ...repository } = candidate;
          const hook = yield* decode(
            Hook,
            (yield* rest({
              method: existing ? "PATCH" : "POST",
              path: `repos/${repository.nameWithOwner}/hooks${existing ? `/${existing.id}` : ""}`,
              body: {
                name: "web",
                active: true,
                events: ["pull_request"],
                config: {
                  url: input.url,
                  content_type: "json",
                  insecure_ssl: "0",
                  secret: input.secret,
                },
              },
            })).body,
          );
          const connected = { ...repository, hookId: hook.id };
          if (!existing) created.push(connected);
          return connected;
        }),
      { concurrency: 1 },
    ).pipe(Effect.onError(() => remove(created).pipe(Effect.ignore)));
  });
  return GitHubPrAutomation.of({ connect, remove });
});

// The same layer value builtInDrivers builds first, so the server's memo map hands this the
// driver's GitHubRest: one sign-in refresh lock, one quota view.
export const layer = Layer.effect(GitHubPrAutomation, make).pipe(
  Layer.provide(ProjectStore.layer),
  Layer.provide(GitHubRest.layerWithDependencies),
);
