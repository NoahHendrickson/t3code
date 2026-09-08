import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadEnvMode,
} from "@t3tools/contracts";

import { DraftId, markPromotedDraftThread, useComposerDraftStore } from "../composerDraftStore";
import { readT3ProjectFileDefaultThreadEnvMode } from "../lib/t3ProjectFileDefaults";
import { NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY, newAgentDraftProjectRef } from "./newAgentDraft";
import { assignDraftProject, type DraftProjectTarget } from "./useNewAgentDraft";

// The t3.json lookup is the only await on the assignment path; holding it
// is how a test orders two picks' completions.
vi.mock("../lib/t3ProjectFileDefaults", () => ({
  readT3ProjectFileDefaultThreadEnvMode: vi.fn(),
}));
const readProjectFileEnvMode = vi.mocked(readT3ProjectFileDefaultThreadEnvMode);

const environmentId = EnvironmentId.make("env-local");
const draftId = DraftId.make("draft-new-agent");
const settings = {
  defaultThreadEnvMode: "local" as const,
  newWorktreesStartFromOrigin: false,
};

const target = (name: string): DraftProjectTarget => ({
  group: { projectKey: `proj-${name}` },
  targetProject: {
    environmentId,
    id: ProjectId.make(`proj-${name}`),
    workspaceRoot: `/repo/${name}`,
    defaultModelSelection: null,
  },
});

const session = () => useComposerDraftStore.getState().getDraftSession(draftId);

beforeEach(() => {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
  useComposerDraftStore
    .getState()
    .setLogicalProjectDraftThreadId(
      NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY,
      newAgentDraftProjectRef(environmentId),
      draftId,
      {
        threadId: ThreadId.make("thread-new-agent"),
        createdAt: "2026-09-08T09:00:00.000Z",
        branch: null,
        worktreePath: null,
        envMode: "local",
        startFromOrigin: false,
        runtimeMode: DEFAULT_RUNTIME_MODE,
      },
    );
  readProjectFileEnvMode.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assignDraftProject", () => {
  it("moves the draft under the chosen project with that project's defaults", async () => {
    readProjectFileEnvMode.mockResolvedValue("worktree");
    await assignDraftProject(draftId, target("a"), settings);
    expect(session()).toMatchObject({
      logicalProjectKey: "proj-a",
      projectId: "proj-a",
      envMode: "worktree",
    });
  });

  it("lets the latest pick win when an earlier pick's lookup settles later", async () => {
    let releaseA!: (mode: ThreadEnvMode | null) => void;
    readProjectFileEnvMode.mockImplementation((_environmentId, workspaceRoot) =>
      workspaceRoot === "/repo/a"
        ? new Promise((resolve) => {
            releaseA = resolve;
          })
        : Promise.resolve("worktree"),
    );

    const pickA = assignDraftProject(draftId, target("a"), settings);
    await assignDraftProject(draftId, target("b"), settings);
    expect(session()).toMatchObject({ logicalProjectKey: "proj-b", envMode: "worktree" });

    releaseA("local");
    await pickA;
    expect(session()).toMatchObject({
      logicalProjectKey: "proj-b",
      projectId: "proj-b",
      envMode: "worktree",
    });
    expect(
      useComposerDraftStore.getState().logicalProjectDraftThreadKeyByLogicalProjectKey,
    ).toEqual({ "proj-b": draftId });
  });

  it("does not re-register a draft that was promoted while its lookup was pending", async () => {
    let release!: (mode: ThreadEnvMode | null) => void;
    readProjectFileEnvMode.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pick = assignDraftProject(draftId, target("a"), settings);
    markPromotedDraftThread(ThreadId.make("thread-new-agent"));
    release(null);
    await pick;
    expect(session()?.logicalProjectKey).toBe(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY);
  });
});
