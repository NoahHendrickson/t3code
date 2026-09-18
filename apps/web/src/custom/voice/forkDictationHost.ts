import {
  VoiceInputController,
  type VoiceInputState,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import { randomUUID } from "~/lib/utils";
import { BrowserVoiceRecorder, recordingToWav, releaseRecording } from "./BrowserVoiceRecorder";
import { readForkVoiceInputBridge, type ForkVoiceInputBridge } from "./forkVoiceInputBridge";

/**
 * One dictation session for the whole app, mirroring mobile's
 * `useVoiceInputController` but held above the router so the right Command
 * tap works wherever the window has focus. The composer on screen binds
 * itself as the target while it is mounted; a session started while no
 * composer can take it (another page, a pending approval, a send in flight)
 * is delivered to the fallback presenter (a toast with Copy) instead.
 *
 * The target is resolved once, when a session starts, and pinned for its
 * whole life: a composer that arrives or leaves mid-session never receives
 * a transcript it did not start. A pinned composer whose owner changes
 * (thread switch, unmount) cancels the session, as before.
 */

export type DictationTarget = {
  readonly ownerKey: string;
  readonly disabled: boolean;
  readonly focusEditor: () => void;
  readonly readDraft: () => { value: string; expandedCursor: number };
  readonly commitDraft: (text: string, cursor: number) => void;
};

/** Mutable slot the composer hook keeps current across renders. */
export type DictationBinding = { current: DictationTarget };

export type DictationFallbackView =
  | { readonly kind: "preparing"; readonly downloadPercent: number | null }
  | { readonly kind: "recording" }
  | { readonly kind: "transcribing" }
  | { readonly kind: "delivered"; readonly text: string }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly errorAction: VoiceInputState["errorAction"];
    }
  | { readonly kind: "dismissed" };

export type DictationSnapshot = {
  readonly state: VoiceInputState;
  readonly detail: string | null;
  readonly downloadPercent: number | null;
  /** Target the current (or last errored) session was pinned to; null before the first start. */
  readonly ownerKey: string | null;
};

export const DICTATION_FALLBACK_OWNER_KEY = "fork-dictation:fallback";

const INITIAL_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

const BLOCKING_PHASES = new Set<VoiceInputState["phase"]>([
  "preparing",
  "recording",
  "transcribing",
]);

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Chromium reports a firm "denied" before getUserMedia would fail, which lets
 * the controller show its settings hint instead of a generic recorder error.
 * Anything else (prompt, granted, unsupported) defers to getUserMedia.
 */
async function queryMicrophonePermission() {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return { granted: status.state !== "denied", canAskAgain: status.state !== "denied" };
  } catch {
    return { granted: true, canAskAgain: true };
  }
}

/**
 * Adapts the preload bridge to the controller's transcriber contract. The
 * controller hands the same abort signal to prepare and transcribe, so one
 * listener forwards cancellation to the main process for the whole session.
 */
function createBridgeTranscriber(
  bridge: ForkVoiceInputBridge,
  events: {
    onDownload: (percent: number | null) => void;
    onDetail: (message: string) => void;
  },
): VoiceTranscriber {
  return {
    prepare: async ({ signal }) => {
      const requestId = randomUUID();
      const abort = () => void bridge.cancel(requestId).catch(() => {});
      signal.addEventListener("abort", abort, { once: true });
      const unsubscribe = bridge.onDownloadProgress((event) => {
        if (event.requestId === requestId) events.onDownload(event.percent);
      });
      try {
        await bridge.prepare(requestId);
        signal.throwIfAborted();
        // The controller stays "preparing" through the mic permission prompt;
        // a lingering "100%" would read as a stuck download.
        events.onDownload(null);
      } catch (error) {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted)
          events.onDetail(messageOf(error, "Could not prepare local dictation."));
        throw error;
      } finally {
        unsubscribe();
      }
      return {
        locale: "en",
        transcribe: async (uri, { signal: transcriptionSignal }) => {
          try {
            const wav = await recordingToWav(uri, transcriptionSignal);
            if (!wav) return "";
            transcriptionSignal.throwIfAborted();
            return await bridge.transcribe(requestId, wav);
          } catch (error) {
            if (!transcriptionSignal.aborted)
              events.onDetail(messageOf(error, "Local transcription failed."));
            throw error;
          } finally {
            signal.removeEventListener("abort", abort);
          }
        },
      };
    },
  };
}

type LevelListener = (level: number) => void;

type Session = {
  readonly controller: VoiceInputController;
  readonly subscribeLevel: (listener: LevelListener) => () => void;
};

let snapshot: DictationSnapshot = {
  state: INITIAL_STATE,
  detail: null,
  downloadPercent: null,
  ownerKey: null,
};
const snapshotListeners = new Set<() => void>();
let bound: DictationBinding | null = null;
let fallbackPresenter: ((view: DictationFallbackView) => void) | null = null;
// Set once the fallback toast has reached its final state (transcript or
// error), so the idle that follows leaves it on screen for the user.
let fallbackSettled = false;
// undefined until the first use so a bridge stubbed after module load still counts.
let session: Session | null | undefined;

function setSnapshot(patch: Partial<DictationSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  snapshotListeners.forEach((listener) => listener());
}

function pinnedToFallback(): boolean {
  return snapshot.ownerKey === DICTATION_FALLBACK_OWNER_KEY;
}

function pinnedToComposer(): boolean {
  return snapshot.ownerKey !== null && !pinnedToFallback();
}

function presentFallback(view: DictationFallbackView): void {
  fallbackPresenter?.(view);
}

/**
 * The controller's stale-draft check already compares owner and text, which is
 * what a switched thread or an edited prompt changes; the revision stays fixed.
 *
 * Input levels bypass React state on purpose: they arrive at 20 Hz and only the
 * level meter cares, so subscribers write to the DOM themselves.
 */
function createSession(bridge: ForkVoiceInputBridge): Session {
  const recorder = new BrowserVoiceRecorder();
  recorder.onError = (message) => setSnapshot({ detail: message });
  const levelListeners = new Set<LevelListener>();
  recorder.onLevel = (level) => levelListeners.forEach((listener) => listener(level));
  const subscribeLevel = (listener: LevelListener) => {
    levelListeners.add(listener);
    return () => void levelListeners.delete(listener);
  };
  const controller = new VoiceInputController({
    recorder,
    requestPermission: queryMicrophonePermission,
    configureRecording: async () => {},
    releaseRecording: async () => recorder.release(),
    deleteRecording: releaseRecording,
    getTranscriber: () =>
      createBridgeTranscriber(bridge, {
        // The one-time download reports every integer percent; the label only
        // needs coarse steps, and each update re-renders the composer.
        onDownload: (percent) => {
          const downloadPercent = percent === null ? null : Math.floor(percent / 5) * 5;
          if (downloadPercent === snapshot.downloadPercent) return;
          setSnapshot({ downloadPercent });
          if (pinnedToFallback() && snapshot.state.phase === "preparing")
            presentFallback({ kind: "preparing", downloadPercent });
        },
        onDetail: (message) => setSnapshot({ detail: message }),
      }),
    readDraft: () => {
      if (pinnedToFallback()) {
        return {
          ownerKey: DICTATION_FALLBACK_OWNER_KEY,
          text: "",
          selection: { start: 0, end: 0 },
          revision: 0,
        };
      }
      const target = bound?.current;
      if (!target) return null;
      const draft = target.readDraft();
      return {
        ownerKey: target.ownerKey,
        text: draft.value,
        selection: { start: draft.expandedCursor, end: draft.expandedCursor },
        revision: 0,
      };
    },
    commitDraft: (text, selection) => {
      if (pinnedToFallback()) {
        fallbackSettled = true;
        presentFallback({ kind: "delivered", text });
        return;
      }
      bound?.current.commitDraft(text, selection.start);
    },
    onStateChange: (next) => {
      if (next.phase === "preparing") setSnapshot({ detail: null, downloadPercent: null });
      setSnapshot({ state: next });
      if (pinnedToFallback()) {
        switch (next.phase) {
          case "preparing":
            presentFallback({ kind: "preparing", downloadPercent: null });
            return;
          case "recording":
            presentFallback({ kind: "recording" });
            return;
          case "transcribing":
            presentFallback({ kind: "transcribing" });
            return;
          case "error":
            fallbackSettled = true;
            presentFallback({
              kind: "error",
              message: snapshot.detail ?? next.error ?? "Dictation failed.",
              errorAction: next.errorAction,
            });
            return;
          case "idle":
            if (!fallbackSettled) presentFallback({ kind: "dismissed" });
            return;
        }
      }
      if (next.phase === "error") bound?.current.focusEditor();
    },
  });
  recorder.onLimit = () => void controller.stop();
  recorder.onInterrupted = (message) => void controller.interruptRecording(message);
  return { controller, subscribeLevel };
}

function getSession(): Session | null {
  if (session === undefined) {
    const bridge = readForkVoiceInputBridge();
    session = bridge ? createSession(bridge) : null;
  }
  return session;
}

/** Read during render, so it checks the bridge without building the session. */
export function isDictationAvailable(): boolean {
  return readForkVoiceInputBridge() !== null;
}

export function subscribeDictation(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => void snapshotListeners.delete(listener);
}

export function getDictationSnapshot(): DictationSnapshot {
  return snapshot;
}

export function subscribeDictationLevel(listener: LevelListener): () => void {
  return getSession()?.subscribeLevel(listener) ?? (() => {});
}

/** The composer on screen. A second composer replacing the first ends its session. */
export function bindDictationComposer(binding: DictationBinding): void {
  if (bound !== null && bound !== binding) dictationComposerOwnerChanged();
  bound = binding;
}

export function unbindDictationComposer(binding: DictationBinding): void {
  if (bound !== binding) return;
  bound = null;
  dictationComposerOwnerChanged();
}

/** A pinned composer whose owner changed cancels rather than re-targets. */
export function dictationComposerOwnerChanged(): void {
  if (pinnedToComposer()) getSession()?.controller.ownerChanged();
}

/**
 * Starts a session against the composer on screen when it can take one, and
 * against the fallback presenter otherwise. Idempotent while one is live.
 */
export function startDictation(): void {
  const current = getSession();
  if (!current) return;
  const { phase } = current.controller.currentState;
  if (phase !== "idle" && phase !== "error") return;
  const target = bound?.current;
  const ownerKey =
    target !== undefined && !target.disabled ? target.ownerKey : DICTATION_FALLBACK_OWNER_KEY;
  fallbackSettled = false;
  setSnapshot({ ownerKey });
  void current.controller.start();
}

export function stopDictation(): void {
  void getSession()?.controller.stop();
}

export function cancelDictation(): void {
  const current = getSession();
  if (!current) return;
  const toComposer = pinnedToComposer();
  current.controller.cancel();
  if (toComposer) bound?.current.focusEditor();
}

/**
 * For the composer whose controls just left the screen: a recording is
 * transcribed on the spot rather than left running with nothing to end it.
 * A fallback session has its toast and is left alone.
 */
export function settleDictationWithoutControls(): void {
  const current = getSession();
  if (!current || !pinnedToComposer()) return;
  const { phase } = current.controller.currentState;
  if (phase === "recording") void current.controller.stop();
  else if (phase === "preparing") current.controller.cancel();
}

export function setDictationFallbackPresenter(
  presenter: ((view: DictationFallbackView) => void) | null,
): void {
  fallbackPresenter = presenter;
}

function extraModifiersHeld(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey;
}

/** Right Command by itself. Fires on keyup of a tap so ⌘C and friends stay chords. */
function isRightCommandTap(event: KeyboardEvent): boolean {
  return event.code === "MetaRight" && !event.repeat && !extraModifiersHeld(event);
}

/**
 * Window-level, wherever focus sits: a tap of right Command toggles a session
 * and Escape cancels a live one. Keyboard events only reach the window while
 * the app is active, so "active app" needs no extra check.
 *
 * Right Command toggles on keyup of a bare tap. Arming on keydown and
 * disarming on any other key lets ⌘C stay a copy, and a leftover meta
 * (left ⌘ still held) is rejected because metaKey is still true on keyup.
 * A pointer or wheel event disarms it too: ⌘-clicking a link or ⌘-scrolling
 * presses no key, but it was a modifier, not a tap.
 */
export function installDictationHotkeys(): () => void {
  const current = getSession();
  if (!current) return () => {};
  let pendingRightCommand = false;
  const onKeyDown = (event: KeyboardEvent) => {
    if (isRightCommandTap(event) && !event.defaultPrevented) {
      pendingRightCommand = true;
      return;
    }
    pendingRightCommand = false;
    if (event.repeat || event.defaultPrevented) return;
    if (event.key !== "Escape") return;
    // Only while dictation is actually live; a lingering error must not eat
    // Escape from other UI.
    if (!BLOCKING_PHASES.has(current.controller.currentState.phase)) return;
    cancelDictation();
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const tapped =
      pendingRightCommand && isRightCommandTap(event) && !event.metaKey && !event.defaultPrevented;
    pendingRightCommand = false;
    if (!tapped) return;
    const { phase } = current.controller.currentState;
    if (phase === "recording") stopDictation();
    else if (phase === "idle" || phase === "error") startDictation();
    else return;
    event.preventDefault();
  };
  const disarm = () => {
    pendingRightCommand = false;
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerdown", disarm, true);
  window.addEventListener("wheel", disarm, { capture: true, passive: true });
  window.addEventListener("blur", disarm);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("pointerdown", disarm, true);
    window.removeEventListener("wheel", disarm, true);
    window.removeEventListener("blur", disarm);
  };
}
