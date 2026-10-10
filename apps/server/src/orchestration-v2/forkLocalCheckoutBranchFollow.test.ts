/** Fork test — see `.fork/customizations.yaml#server-local-checkout-branch-follow`. */
import { assert, it } from "@effect/vitest";
import { CommandId, RunId, ThreadId, type OrchestrationV2Command } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  followLocalCheckoutBranch,
  type LocalCheckoutBranchFollowShell,
} from "./forkLocalCheckoutBranchFollow.ts";

class DeciderRejected extends Schema.TaggedError<DeciderRejected>()("DeciderRejected", {}) {}

const threadId = ThreadId.make("thread-local-follow");
const runId = RunId.make("run-local-follow");

const status = (refName: string | null, isDefaultRef = false) => ({
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef,
  refName,
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
});

const shell = (overrides: Partial<LocalCheckoutBranchFollowShell> = {}) => ({
  id: threadId,
  branch: "feature/recorded",
  worktreePath: null,
  activeRunId: runId,
  ...overrides,
});

function run(input: {
  readonly local: ReturnType<typeof status>;
  readonly thread: LocalCheckoutBranchFollowShell | null;
}) {
  const dispatched: Array<OrchestrationV2Command> = [];
  return followLocalCheckoutBranch(
    { threadId, runId, cwd: "/repo", local: input.local },
    {
      getThreadShell: () => Effect.succeed(input.thread),
      dispatch: (command) =>
        Effect.sync(() => {
          dispatched.push(command);
        }),
    },
  ).pipe(Effect.map((adopted) => ({ adopted, dispatched })));
}

it.effect("adopts the drifted checkout for the local thread whose turn ran there", () =>
  Effect.gen(function* () {
    const { adopted, dispatched } = yield* run({
      local: status("feature/checked-out"),
      thread: shell(),
    });
    assert.equal(adopted, "feature/checked-out");
    assert.deepEqual(dispatched, [
      {
        type: "thread.metadata.update",
        commandId: CommandId.make(`server:fork-local-checkout-branch-follow:${runId}`),
        threadId,
        branch: "feature/checked-out",
        expectedWorktreePath: null,
      },
    ]);
  }),
);

it.effect.each([
  {
    label: "the checkout rests on the default branch",
    local: status("main", true),
    thread: shell(),
  },
  { label: "HEAD is detached", local: status(null), thread: shell() },
  {
    label: "the checkout is a temporary placeholder",
    local: status("t3code/0123abcd"),
    thread: shell(),
  },
  {
    label: "the thread has no recorded branch",
    local: status("feature/x"),
    thread: shell({ branch: null }),
  },
  {
    label: "the recorded branch already matches",
    local: status("feature/recorded"),
    thread: shell(),
  },
  {
    label: "the thread owns a worktree",
    local: status("feature/x"),
    thread: shell({ worktreePath: "/repo-worktrees/feature" }),
  },
  {
    label: "a newer run is already active",
    local: status("feature/x"),
    thread: shell({ activeRunId: RunId.make("run-newer") }),
  },
  { label: "the thread is gone", local: status("feature/x"), thread: null },
])("keeps the record when $label", ({ local, thread }) =>
  Effect.gen(function* () {
    const { adopted, dispatched } = yield* run({ local, thread });
    assert.isNull(adopted);
    assert.deepEqual(dispatched, []);
  }),
);

it.effect("a failed dispatch is a warning, never a finalization failure", () =>
  Effect.gen(function* () {
    const adopted = yield* followLocalCheckoutBranch(
      { threadId, runId, cwd: "/repo", local: status("feature/x") },
      {
        getThreadShell: () => Effect.succeed(shell()),
        dispatch: () => Effect.fail(new DeciderRejected()),
      },
    );
    assert.isNull(adopted);
  }),
);
