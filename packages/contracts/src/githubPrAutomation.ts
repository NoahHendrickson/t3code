import * as Schema from "effect/Schema";
import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** The server resolves repository identity from each project's origin, never from client claims. */
export const GitHubPrAutomationRepository = Schema.Struct({
  projectId: ProjectId,
  nameWithOwner: Schema.optional(TrimmedNonEmptyString),
  defaultBranch: Schema.optional(TrimmedNonEmptyString),
  hookId: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
});
export type GitHubPrAutomationRepository = typeof GitHubPrAutomationRepository.Type;

export const GitHubPrAutomation = Schema.Struct({
  repositories: Schema.Array(GitHubPrAutomationRepository).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(20),
  ),
});
export type GitHubPrAutomation = typeof GitHubPrAutomation.Type;

/** PR context remains recoverable after delivery-log pruning or a thread title edit. */
export function githubPrRunContext(messageId: string) {
  if (
    !messageId.startsWith("scheduled-task-message:") ||
    !messageId.includes(":webhook:delivery:github:")
  )
    return null;
  const match = /:([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+):(\d+):([a-f0-9]{40})$/.exec(messageId);
  if (!match) return null;
  const [, repository, number, commit] = match;
  return {
    label: `${repository} #${number}`,
    url: `https://github.com/${repository}/pull/${number}`,
    commit,
  };
}
