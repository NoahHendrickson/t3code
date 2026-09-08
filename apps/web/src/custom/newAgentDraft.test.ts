import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import type { DraftSessionState } from "../composerDraftStore";
import {
  NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY,
  NEW_AGENT_DRAFT_PROJECT_ID,
  isUnassignedDraft,
  newAgentDraftProjectRef,
} from "./newAgentDraft";
import { listSidebarDraftRows } from "./sidebarV2DraftRows";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.4",
};

const draft = (over: Partial<DraftSessionState> = {}): DraftSessionState => ({
  threadId: ThreadId.make("thread-draft"),
  environmentId: EnvironmentId.make("env-local"),
  projectId: ProjectId.make("proj-1"),
  logicalProjectKey: "proj-1",
  createdAt: "2026-09-07T15:00:00.000Z",
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  envMode: "local",
  startFromOrigin: false,
  promotedTo: null,
  ...over,
});

describe("isUnassignedDraft", () => {
  it("recognises a New agent draft by either of its two signals", () => {
    const environmentId = EnvironmentId.make("env-local");
    const ref = newAgentDraftProjectRef(environmentId);
    expect(ref.environmentId).toBe(environmentId);
    expect(ref.projectId).toBe(NEW_AGENT_DRAFT_PROJECT_ID);
    expect(
      isUnassignedDraft(
        draft({
          logicalProjectKey: NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY,
          projectId: NEW_AGENT_DRAFT_PROJECT_ID,
        }),
      ),
    ).toBe(true);
    // A remap through the store's own project-change path rewrites the key
    // but could leave the sentinel id behind; either alone is enough.
    expect(isUnassignedDraft(draft({ projectId: NEW_AGENT_DRAFT_PROJECT_ID }))).toBe(true);
    expect(
      isUnassignedDraft(draft({ logicalProjectKey: NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY })),
    ).toBe(true);
  });

  it("treats an ordinary project draft, and no draft, as assigned", () => {
    expect(isUnassignedDraft(draft())).toBe(false);
    expect(isUnassignedDraft(null)).toBe(false);
    expect(isUnassignedDraft(undefined)).toBe(false);
  });
});

describe("listSidebarDraftRows with a New agent draft", () => {
  it("draws no row until the draft has a project", () => {
    const rows = listSidebarDraftRows({
      draftsById: {
        "draft-unassigned": draft({
          threadId: ThreadId.make("thread-unassigned"),
          logicalProjectKey: NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY,
          projectId: NEW_AGENT_DRAFT_PROJECT_ID,
        }),
        "draft-assigned": draft(),
      },
      modelSelectionForDraft: () => modelSelection,
      hasServerShell: () => false,
    });
    expect(rows.map((row) => row.draftId)).toEqual(["draft-assigned"]);
  });

  it("draws the row once the same draft is remapped onto a project", () => {
    // What choosing a project from the pill does: the draft keeps its id and
    // reserved thread, and only its target changes.
    const rows = listSidebarDraftRows({
      draftsById: {
        "draft-unassigned": draft({
          threadId: ThreadId.make("thread-unassigned"),
          logicalProjectKey: "proj-2",
          projectId: ProjectId.make("proj-2"),
        }),
      },
      modelSelectionForDraft: () => modelSelection,
      hasServerShell: () => false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shell.projectId).toBe("proj-2");
    expect(rows[0]?.shell.id).toBe("thread-unassigned");
  });
});
