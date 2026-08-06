import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import type { DraftSessionState } from "../composerDraftStore";
import { DraftId } from "../composerDraftStore";
import {
  buildSidebarDraftShell,
  draftIdByThreadKey,
  listSidebarDraftRows,
  pickDiscardNeighborKey,
  sidebarDraftModelSelection,
  sidebarDraftRowCapabilities,
  sidebarServerActionThreadKeys,
  sidebarDraftTitleFromPrompt,
} from "./sidebarV2DraftRows";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.4",
};

const draft = (over: Partial<DraftSessionState> = {}): DraftSessionState => ({
  threadId: ThreadId.make("thread-draft"),
  environmentId: EnvironmentId.make("env-local"),
  projectId: ProjectId.make("proj-1"),
  logicalProjectKey: "proj-1",
  createdAt: "2026-07-31T15:00:00.000Z",
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "main",
  worktreePath: null,
  envMode: "local",
  startFromOrigin: false,
  promotedTo: null,
  ...over,
});

describe("sidebarDraftTitleFromPrompt", () => {
  it("uses New thread when the composer is empty", () => {
    expect(sidebarDraftTitleFromPrompt("")).toBe("New thread");
    expect(sidebarDraftTitleFromPrompt("   ")).toBe("New thread");
    expect(sidebarDraftTitleFromPrompt(null)).toBe("New thread");
  });

  it("truncates the trimmed prompt like ChatView's auto-title", () => {
    expect(sidebarDraftTitleFromPrompt("  fix the sidebar  ")).toBe("fix the sidebar");
    const long = "x".repeat(60);
    expect(sidebarDraftTitleFromPrompt(long)).toBe(`${"x".repeat(50)}...`);
  });
});

describe("buildSidebarDraftShell", () => {
  it("paints the same title ChatView uses for an empty draft", () => {
    const shell = buildSidebarDraftShell({ draft: draft(), modelSelection });
    expect(shell.title).toBe("New thread");
    expect(shell.id).toBe("thread-draft");
    expect(shell.hasPendingApprovals).toBe(false);
    expect(shell.session).toBeNull();
  });

  it("uses the unsaved composer prompt as the card title", () => {
    const shell = buildSidebarDraftShell({
      draft: draft(),
      modelSelection,
      prompt: "rename draft from typed text",
    });
    expect(shell.title).toBe("rename draft from typed text");
  });
});

describe("sidebarDraftModelSelection", () => {
  it("uses the active unsaved composer selection before the project fallback", () => {
    const pickedSelection = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-fable-5",
    };
    expect(
      sidebarDraftModelSelection({
        composerDraft: {
          activeProvider: ProviderInstanceId.make("claudeAgent"),
          modelSelectionByProvider: {
            [ProviderInstanceId.make("claudeAgent")]: pickedSelection,
          },
        },
        fallback: modelSelection,
      }),
    ).toEqual(pickedSelection);
  });

  it("falls back when the draft has no active selection", () => {
    expect(
      sidebarDraftModelSelection({
        composerDraft: { activeProvider: null, modelSelectionByProvider: {} },
        fallback: modelSelection,
      }),
    ).toEqual(modelSelection);
  });
});

describe("listSidebarDraftRows", () => {
  it("keeps unpromoted drafts that have no server shell yet", () => {
    const rows = listSidebarDraftRows({
      draftsById: { "draft-1": draft() },
      modelSelectionForDraft: () => modelSelection,
      promptForDraft: () => "typed but not sent",
      hasServerShell: () => false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.draftId).toBe("draft-1");
    expect(rows[0]?.shell.title).toBe("typed but not sent");
  });

  it("drops promoted drafts and drafts that already have a shell", () => {
    const promoted = draft({
      promotedTo: scopeThreadRef(EnvironmentId.make("env-local"), ThreadId.make("thread-draft")),
    });
    const rows = listSidebarDraftRows({
      draftsById: {
        "draft-promoted": promoted,
        "draft-shelled": draft({ threadId: ThreadId.make("thread-live") }),
      },
      modelSelectionForDraft: () => modelSelection,
      hasServerShell: (ref) => ref.threadId === "thread-live",
    });
    expect(rows).toEqual([]);
  });
});

describe("draftIdByThreadKey", () => {
  it("indexes draft ids by the reserved thread key", () => {
    const rows = listSidebarDraftRows({
      draftsById: { [DraftId.make("draft-1")]: draft() },
      modelSelectionForDraft: () => modelSelection,
      hasServerShell: () => false,
    });
    const map = draftIdByThreadKey(rows);
    expect(map.get("env-local:thread-draft")).toBe("draft-1");
  });
});

describe("sidebarDraftRowCapabilities", () => {
  it("gates server actions and offers discard only for drafts", () => {
    expect(sidebarDraftRowCapabilities(true)).toEqual({
      canSettle: false,
      canSnooze: false,
      canPin: false,
      canRename: false,
      showDiscard: true,
    });
    expect(sidebarDraftRowCapabilities(false)).toEqual({
      canSettle: true,
      canSnooze: true,
      canPin: true,
      canRename: true,
      showDiscard: false,
    });
  });
});

describe("sidebarServerActionThreadKeys", () => {
  it("keeps rendered server rows and excludes drafts and stale selections", () => {
    expect(
      sidebarServerActionThreadKeys({
        selectedThreadKeys: ["server", "draft", "stale"],
        hasRenderedRow: (threadKey) => threadKey !== "stale",
        isDraft: (threadKey) => threadKey === "draft",
      }),
    ).toEqual(["server"]);
  });
});

describe("pickDiscardNeighborKey", () => {
  it("prefers the painted row below, then above, and never wraps", () => {
    expect(
      pickDiscardNeighborKey({
        orderedKeys: ["a", "b", "c"],
        currentKey: "b",
      }),
    ).toBe("c");
    expect(
      pickDiscardNeighborKey({
        orderedKeys: ["a", "b", "c"],
        currentKey: "c",
      }),
    ).toBe("b");
    expect(
      pickDiscardNeighborKey({
        orderedKeys: ["only"],
        currentKey: "only",
      }),
    ).toBeNull();
  });
});
