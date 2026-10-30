import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { rememberLandingDraft, sweepLandingDrafts } from "./landingDraft";
import { useSplitThreadStore } from "./splitThreads/splitThreadStore";

const environmentId = EnvironmentId.make("env-local");
const router = { subscribe: vi.fn() } as unknown as Parameters<typeof rememberLandingDraft>[0];

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

function land(name: string): DraftId {
  const draftId = openDraft(name);
  rememberLandingDraft(router, draftId);
  return draftId;
}

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

describe("landing drafts", () => {
  it("discards an untouched landing draft once the route leaves it", () => {
    const first = land("first");
    sweepLandingDrafts(first);
    expect(exists(first)).toBe(true);

    sweepLandingDrafts(null);
    expect(exists(first)).toBe(false);
  });

  it("sweeps an earlier visit's untouched draft when the next landing opens", () => {
    const earlier = land("earlier");
    const next = land("next");

    expect(exists(earlier)).toBe(false);
    expect(exists(next)).toBe(true);
  });

  it("keeps a landing draft the user took up", () => {
    const store = useComposerDraftStore.getState();
    const typed = land("typed");
    store.setPrompt(typed, "fix the sidebar");
    const branched = land("branched");
    store.setDraftThreadContext(branched, { branch: "feat/x" });
    const split = land("split");
    useSplitThreadStore.setState({
      pairs: [
        {
          a: scopeThreadRef(environmentId, ThreadId.make("thread-split")),
          b: scopeThreadRef(environmentId, ThreadId.make("thread-other")),
        },
      ],
    });

    sweepLandingDrafts(null);

    expect([typed, branched, split].map(exists)).toEqual([true, true, true]);
    // Taken up means forgotten: a later sweep leaves them alone even if emptied.
    store.setPrompt(typed, "");
    sweepLandingDrafts(null);
    expect(exists(typed)).toBe(true);
  });

  it("never touches a draft the landing did not open", () => {
    const mine = openDraft("mine");
    land("landing");
    sweepLandingDrafts(null);
    expect(exists(mine)).toBe(true);
  });
});
