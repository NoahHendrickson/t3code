import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { sweepLandingDrafts } from "./landingDraft";
import { useSplitThreadStore } from "./splitThreads/splitThreadStore";

const environmentId = EnvironmentId.make("env-local");

function openDraft(name: string): DraftId {
  const draftId = DraftId.make(`draft-${name}`);
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(
      scopeProjectRef(environmentId, ProjectId.make(`proj-${name}`)),
      draftId,
      {
        threadId: ThreadId.make(`thread-${name}`),
      },
    );
  return draftId;
}

function remember(...ids: DraftId[]) {
  localStorage.setItem("t3code:fork:landing-drafts:v1", JSON.stringify(ids));
}

const remembered = () => JSON.parse(localStorage.getItem("t3code:fork:landing-drafts:v1") ?? "[]");
const exists = (id: DraftId) => useComposerDraftStore.getState().getDraftSession(id) !== null;

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  useSplitThreadStore.setState({ pairs: [], floating: null });
});

describe("sweepLandingDrafts", () => {
  it("discards untouched landing drafts the route left, and keeps the open one", () => {
    const left = openDraft("left");
    const open = openDraft("open");
    remember(left, open);

    sweepLandingDrafts(open);

    expect(exists(left)).toBe(false);
    expect(exists(open)).toBe(true);
    expect(remembered()).toEqual([open]);
  });

  it("keeps and forgets a landing draft the user took up", () => {
    const typed = openDraft("typed");
    const split = openDraft("split");
    const other = openDraft("other");
    useComposerDraftStore.getState().setPrompt(typed, "fix the sidebar");
    useSplitThreadStore.setState({
      pairs: [
        {
          a: scopeThreadRef(environmentId, ThreadId.make("thread-split")),
          b: scopeThreadRef(environmentId, ThreadId.make("thread-other")),
        },
      ],
    });
    remember(typed, split);

    sweepLandingDrafts(null);

    expect(exists(typed)).toBe(true);
    expect(exists(split)).toBe(true);
    expect(exists(other)).toBe(true);
    expect(remembered()).toEqual([]);
  });

  it("never touches drafts it was not told about", () => {
    const mine = openDraft("mine");

    sweepLandingDrafts(null);

    expect(exists(mine)).toBe(true);
  });
});
