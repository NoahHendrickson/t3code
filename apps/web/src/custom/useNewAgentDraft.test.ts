import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  type ModelSelection,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ThreadEnvMode,
} from "@t3tools/contracts";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  DraftId,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "../composerDraftStore";
import { readT3ProjectFileDefaultThreadEnvMode } from "../lib/t3ProjectFileDefaults";
import { NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY, newAgentDraftProjectRef } from "./newAgentDraft";
import {
  assignDraftProject,
  type DraftProjectTarget,
  readPendingDraftProjectKey,
} from "./useNewAgentDraft";

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

const target = (
  name: string,
  defaultModelSelection: ModelSelection | null = null,
): DraftProjectTarget => ({
  group: { projectKey: `proj-${name}` },
  targetProject: {
    environmentId,
    id: ProjectId.make(`proj-${name}`),
    workspaceRoot: `/repo/${name}`,
    defaultModelSelection,
  },
});

const model = (name: string): ModelSelection => ({
  instanceId: ProviderInstanceId.make("codex"),
  model: name,
});

const session = () => useComposerDraftStore.getState().getDraftSession(draftId);
const selectedModel = () => {
  const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
  return draft?.activeProvider ? draft.modelSelectionByProvider[draft.activeProvider]?.model : null;
};

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
    // Joining the project is the create moment the sidebar sorts on. The
    // unassigned stamp ("2026-09-08T09:00:00.000Z" in beforeEach) would
    // park the card under every newer thread in the project.
    expect(session()?.createdAt).not.toBe("2026-09-08T09:00:00.000Z");
    expect(Date.parse(session()?.createdAt ?? "")).toBeGreaterThan(
      Date.parse("2026-09-08T09:00:00.000Z"),
    );
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

  it("reports the pick as pending until its lookup settles", async () => {
    const release = new Map<string, (mode: ThreadEnvMode | null) => void>();
    readProjectFileEnvMode.mockImplementation(
      (_environmentId, workspaceRoot) =>
        new Promise((resolve) => {
          release.set(workspaceRoot, resolve);
        }),
    );

    expect(readPendingDraftProjectKey(draftId)).toBeNull();
    const pickA = assignDraftProject(draftId, target("a"), settings);
    // The draft still points at its previous target while the pick resolves;
    // this is what the composer reads to hold Send.
    expect(readPendingDraftProjectKey(draftId)).toBe("proj-a");
    expect(session()?.logicalProjectKey).toBe(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY);

    // A newer pick takes over the pending slot; the superseded one settling
    // does not clear it.
    const pickB = assignDraftProject(draftId, target("b"), settings);
    expect(readPendingDraftProjectKey(draftId)).toBe("proj-b");
    release.get("/repo/a")!("local");
    await pickA;
    expect(readPendingDraftProjectKey(draftId)).toBe("proj-b");
    expect(session()?.logicalProjectKey).toBe(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY);

    release.get("/repo/b")!("worktree");
    await pickB;
    expect(readPendingDraftProjectKey(draftId)).toBeNull();
    expect(session()?.logicalProjectKey).toBe("proj-b");
  });

  it("keeps the carried model unless the project has its own default", async () => {
    readProjectFileEnvMode.mockResolvedValue(null);
    const store = useComposerDraftStore.getState();
    store.setModelSelection(draftId, model("carried"), { replaceOptions: true });

    await assignDraftProject(draftId, target("a"), settings);
    expect(selectedModel()).toBe("carried");

    await assignDraftProject(draftId, target("b", model("project-default")), settings);
    expect(selectedModel()).toBe("project-default");
  });

  it("leaves an explicit model pick alone", async () => {
    readProjectFileEnvMode.mockResolvedValue(null);
    useComposerDraftStore
      .getState()
      .setModelSelection(draftId, model("picked"), { replaceOptions: true, explicit: true });

    await assignDraftProject(draftId, target("a", model("project-default")), settings);
    expect(selectedModel()).toBe("picked");
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
    markPromotedDraftThreadByRef(scopeThreadRef(environmentId, ThreadId.make("thread-new-agent")));
    release(null);
    await pick;
    expect(session()?.logicalProjectKey).toBe(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY);
  });
});
