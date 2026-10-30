/**
 * Landing drafts — see `.fork/customizations.yaml#fork-landing-draft-cleanup`.
 *
 * Upstream's `/` route opens a draft in the most recently updated project so
 * the app lands on a ready composer. The fork's sidebar paints every unsent
 * draft (sidebar-v2-draft-rows), and the store keeps a project's draft until
 * it is sent, so a client that lands on `/` every visit (a phone) collected a
 * blank "New thread" card in each project that was most recent at the time.
 *
 * The draft the landing opened is remembered here, and once the route leaves
 * it untouched it is discarded. Untouched means no composer content, no open
 * preview tab and no split or floating pane holding it: the same things the
 * store and the split panes keep a draft alive for. Anything else means the
 * user took the draft up, and it stays like a draft they made themselves.
 *
 * The ids persist because a phone often reloads instead of resuming, and a
 * landing draft forgotten across a reload is exactly the card that piled up.
 */
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

function readLandingDraftIds(): DraftId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LANDING_DRAFTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is DraftId => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeLandingDraftIds(ids: readonly DraftId[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(LANDING_DRAFTS_STORAGE_KEY);
    else localStorage.setItem(LANDING_DRAFTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode); the draft then just stays.
  }
}

/** True while nothing but the landing itself has touched the draft. */
export function isUntouchedLandingDraft(draftId: DraftId, session: DraftSessionState): boolean {
  if (session.promotedTo != null) return false;
  if (composerDraftHasUserContent(useComposerDraftStore.getState().getComposerDraft(draftId))) {
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
  const ids = readLandingDraftIds();
  if (ids.length === 0) return;
  const store = useComposerDraftStore.getState();
  const kept: DraftId[] = [];
  for (const id of ids) {
    if (id === openDraftId) {
      kept.push(id);
      continue;
    }
    const session = store.getDraftSession(id);
    if (session && isUntouchedLandingDraft(id, session)) store.clearDraftThread(id);
  }
  writeLandingDraftIds(kept);
}

const subscribedRouters = new WeakSet<Router>();

/** Remembers the draft `/` just opened, and starts watching for the route to
    leave it. Leftovers from earlier visits are swept on the way in. */
export function rememberLandingDraft(router: Router, draftId: DraftId): void {
  sweepLandingDrafts(draftId);
  const ids = readLandingDraftIds();
  if (!ids.includes(draftId)) writeLandingDraftIds([...ids, draftId]);
  if (subscribedRouters.has(router)) return;
  subscribedRouters.add(router);
  // onResolved, not onBeforeNavigate: a sync clear while still on
  // /draft/$id races that route's missing-session redirect back to `/`.
  router.subscribe("onResolved", ({ toLocation }) => {
    const match = DRAFT_ROUTE_PATTERN.exec(toLocation.pathname);
    sweepLandingDrafts(match ? (decodeURIComponent(match[1]!) as DraftId) : null);
  });
}
