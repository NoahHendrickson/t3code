/* Discards the draft `/` opens once the route leaves it untouched, so a phone landing on
   `/` every visit stops collecting blank draft cards. Records persist across reloads.
   See `.fork/customizations.yaml#fork-landing-draft-cleanup`. */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { useRouter } from "@tanstack/react-router";

import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type DraftId,
  type DraftSessionState,
} from "../composerDraftStore";
import { readThreadPreviewState } from "../previewStateStore";
import { sameThread } from "./splitThreads/splitThreadPairs";
import { usePendingSplitStore, useSplitThreadStore } from "./splitThreads/splitThreadStore";

const LANDING_DRAFTS_STORAGE_KEY = "t3code:fork:landing-drafts:v1";
const DRAFT_ROUTE_PATTERN = /^\/draft\/([^/]+)\/?$/;

type Router = ReturnType<typeof useRouter>;

/** A landing draft and the workspace the landing gave it, so picking another
    env mode, branch or worktree counts as taking the draft up. */
interface LandingDraft {
  readonly id: DraftId;
  readonly workspace: string;
}

const workspaceOf = (session: DraftSessionState) =>
  JSON.stringify([session.envMode, session.branch, session.worktreePath]);

function readLandingDrafts(): LandingDraft[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LANDING_DRAFTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is LandingDraft =>
            typeof entry?.id === "string" && typeof entry?.workspace === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeLandingDrafts(drafts: readonly LandingDraft[]): void {
  try {
    if (drafts.length === 0) localStorage.removeItem(LANDING_DRAFTS_STORAGE_KEY);
    else localStorage.setItem(LANDING_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage can be unavailable (private mode); the draft then just stays.
  }
}

/** True while nothing but the landing itself has touched the draft. */
function isUntouchedLandingDraft(landing: LandingDraft, session: DraftSessionState): boolean {
  if (session.promotedTo != null || workspaceOf(session) !== landing.workspace) return false;
  if (composerDraftHasUserContent(useComposerDraftStore.getState().getComposerDraft(landing.id))) {
    return false;
  }
  const ref = scopeThreadRef(session.environmentId, session.threadId);
  if (Object.keys(readThreadPreviewState(ref).sessions).length > 0) return false;
  const { pairs, floating } = useSplitThreadStore.getState();
  if (
    sameThread(floating, ref) ||
    pairs.some((p) => sameThread(p.a, ref) || sameThread(p.b, ref))
  ) {
    return false;
  }
  // A Split agent click pairs its source only after the new draft's route
  // resolves, so the source is not in `pairs` yet when the route leaves it.
  return !sameThread(usePendingSplitStore.getState().pending?.source ?? null, ref);
}

/**
 * Settles every remembered landing draft except the open one: discards it if
 * untouched, otherwise forgets it. Either way it is no longer a landing draft.
 */
export function sweepLandingDrafts(openDraftId: DraftId | null): void {
  const drafts = readLandingDrafts();
  if (drafts.length === 0) return;
  const store = useComposerDraftStore.getState();
  const kept: LandingDraft[] = [];
  for (const landing of drafts) {
    if (landing.id === openDraftId) {
      kept.push(landing);
      continue;
    }
    const session = store.getDraftSession(landing.id);
    if (session && isUntouchedLandingDraft(landing, session)) store.clearDraftThread(landing.id);
  }
  writeLandingDrafts(kept);
}

const subscribedRouters = new WeakSet<Router>();

/** Remembers the draft `/` just opened, and starts watching for the route to
    leave it. Leftovers from earlier visits are swept on the way in. */
export function rememberLandingDraft(router: Router, draftId: DraftId): void {
  sweepLandingDrafts(draftId);
  const session = useComposerDraftStore.getState().getDraftSession(draftId);
  if (session === null) return;
  // A reopened landing draft takes the workspace this landing just gave it.
  writeLandingDrafts([
    ...readLandingDrafts().filter((landing) => landing.id !== draftId),
    { id: draftId, workspace: workspaceOf(session) },
  ]);
  if (subscribedRouters.has(router)) return;
  subscribedRouters.add(router);
  // onResolved, not onBeforeNavigate: a sync clear while still on
  // /draft/$id races that route's missing-session redirect back to `/`.
  router.subscribe("onResolved", ({ toLocation }) => {
    const match = DRAFT_ROUTE_PATTERN.exec(toLocation.pathname);
    sweepLandingDrafts(match ? (decodeURIComponent(match[1]!) as DraftId) : null);
  });
}
