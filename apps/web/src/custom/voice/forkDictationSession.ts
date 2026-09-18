import {
  VoiceInputController,
  type VoiceInputControllerDependencies,
  type VoiceInputState,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import { randomUUID } from "~/lib/utils";
import { BrowserVoiceRecorder, recordingToWav, releaseRecording } from "./BrowserVoiceRecorder";
import type { ForkVoiceInputBridge } from "./forkVoiceInputBridge";

/**
 * Shared session plumbing for the two dictation owners: the composer hook
 * (`useForkDictationController`, transcript into the prompt) and the root
 * fallback (`ForkDictationHotkeyHost`, transcript into a toast). Each owns
 * its own controller and disposes it with its host; the client-runtime
 * process-wide session lock keeps them from recording at once.
 */

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

export type DictationSessionDependencies = {
  readonly readDraft: VoiceInputControllerDependencies["readDraft"];
  readonly commitDraft: VoiceInputControllerDependencies["commitDraft"];
  readonly onStateChange: (state: VoiceInputState) => void;
  readonly onDetail: (message: string) => void;
  /** Coarse (5% steps) so a label re-render per integer percent is avoided. */
  readonly onDownload: (percent: number | null) => void;
};

/**
 * Input levels bypass React state on purpose: they arrive at 20 Hz and only the
 * level meter cares, so subscribers write to the DOM themselves.
 */
export function createDictationSession(
  bridge: ForkVoiceInputBridge,
  deps: DictationSessionDependencies,
) {
  const recorder = new BrowserVoiceRecorder();
  recorder.onError = deps.onDetail;
  const levelListeners = new Set<LevelListener>();
  recorder.onLevel = (level) => levelListeners.forEach((listener) => listener(level));
  const subscribeLevel = (listener: LevelListener) => {
    levelListeners.add(listener);
    return () => void levelListeners.delete(listener);
  };
  let lastDownload: number | null = null;
  const controller = new VoiceInputController({
    recorder,
    requestPermission: queryMicrophonePermission,
    configureRecording: async () => {},
    releaseRecording: async () => recorder.release(),
    deleteRecording: releaseRecording,
    getTranscriber: () =>
      createBridgeTranscriber(bridge, {
        onDownload: (percent) => {
          const coarse = percent === null ? null : Math.floor(percent / 5) * 5;
          if (coarse === lastDownload) return;
          lastDownload = coarse;
          deps.onDownload(coarse);
        },
        onDetail: deps.onDetail,
      }),
    readDraft: deps.readDraft,
    commitDraft: deps.commitDraft,
    onStateChange: (next) => {
      if (next.phase === "preparing") lastDownload = null;
      deps.onStateChange(next);
    },
  });
  recorder.onLimit = () => void controller.stop();
  recorder.onInterrupted = (message) => void controller.interruptRecording(message);
  return { controller, subscribeLevel };
}

export type DictationSession = ReturnType<typeof createDictationSession>;

const LIVE_PHASES = new Set<VoiceInputState["phase"]>(["preparing", "recording", "transcribing"]);

export function isDictationLive(state: VoiceInputState): boolean {
  return LIVE_PHASES.has(state.phase);
}

/** What the hotkeys need from the composer on screen. */
export type DictationComposerHandle = {
  readonly controller: VoiceInputController;
  readonly canStart: () => boolean;
  readonly contains: (target: EventTarget | null) => boolean;
  /** Cancels and returns focus to the editor. */
  readonly cancel: () => void;
};

let composer: DictationComposerHandle | null = null;

/** Registered once per mounted composer; the hotkeys resolve it at each key. */
export function registerDictationComposer(handle: DictationComposerHandle): () => void {
  composer = handle;
  return () => {
    if (composer === handle) composer = null;
  };
}

/** The words for a fallback session, driven straight from its controller. */
export type DictationFallbackPresenter = {
  readonly onStateChange: (state: VoiceInputState, error: string | null) => void;
  readonly onDownload: (percent: number | null) => void;
  readonly onTranscript: (text: string) => void;
  readonly dismiss: () => void;
};

export type DictationFallbackActions = {
  readonly cancel: () => void;
  /** Clears a shown error without touching a session that started since. */
  readonly clearError: () => void;
};

/**
 * The session for a tap with no composer to land in: no draft, the transcript
 * goes to the presenter. Owned by whoever calls this, disposed through the
 * returned handle.
 */
export function createDictationFallback(
  bridge: ForkVoiceInputBridge,
  createPresenter: (actions: DictationFallbackActions) => DictationFallbackPresenter,
) {
  let detail: string | null = null;
  let session: DictationSession;
  const presenter = createPresenter({
    cancel: () => session.controller.cancel(),
    clearError: () => {
      if (session.controller.currentState.phase === "error") session.controller.cancel();
    },
  });
  session = createDictationSession(bridge, {
    readDraft: () => ({
      ownerKey: "fork-dictation:fallback",
      text: "",
      selection: { start: 0, end: 0 },
      revision: 0,
    }),
    commitDraft: (text) => presenter.onTranscript(text),
    onDetail: (message) => {
      detail = message;
    },
    onDownload: presenter.onDownload,
    onStateChange: (state) => {
      if (state.phase === "preparing") detail = null;
      // Specific failure text from the bridge or recorder wins over the
      // controller's generic message.
      presenter.onStateChange(state, state.phase === "error" ? (detail ?? state.error) : null);
    },
  });
  return {
    controller: session.controller,
    cancel: () => session.controller.cancel(),
    dispose: () => {
      session.controller.dispose();
      presenter.dismiss();
    },
  };
}

export type DictationFallback = ReturnType<typeof createDictationFallback>;

function extraModifiersHeld(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey;
}

/** Right Command by itself. Fires on keyup of a tap so ⌘C and friends stay chords. */
function isRightCommandTap(event: KeyboardEvent): boolean {
  return event.code === "MetaRight" && !event.repeat && !extraModifiersHeld(event);
}

/**
 * Window-level: a bare right Command tap starts a session wherever focus sits
 * while the app is active (keyboard events only reach the window then), into
 * the composer on screen when it can take one and into the fallback
 * otherwise; a second tap finishes the live one. Escape cancels a live
 * session only from the composer or an unfocused page (freezing the editor
 * drops focus to <body>), so a focused dialog, palette, or field keeps its
 * own Escape.
 *
 * Right Command toggles on keyup of a bare tap. Arming on keydown and
 * disarming on any other key lets ⌘C stay a copy, and a leftover meta
 * (left ⌘ still held) is rejected because metaKey is still true on keyup.
 * A pointer or wheel event disarms it too: ⌘-clicking a link or ⌘-scrolling
 * presses no key, but it was a modifier, not a tap.
 */
export function installDictationHotkeys(fallback: DictationFallback): () => void {
  let pendingRightCommand = false;
  const liveSession = () => {
    if (composer && isDictationLive(composer.controller.currentState)) return composer;
    if (isDictationLive(fallback.controller.currentState)) return fallback;
    return null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (isRightCommandTap(event) && !event.defaultPrevented) {
      pendingRightCommand = true;
      return;
    }
    pendingRightCommand = false;
    if (event.repeat || event.defaultPrevented) return;
    if (event.key !== "Escape") return;
    const live = liveSession();
    if (!live) return;
    const target = event.target;
    const unfocused = target === document.body || target === document;
    if (!unfocused && composer?.contains(target) !== true) return;
    live.cancel();
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const tapped =
      pendingRightCommand && isRightCommandTap(event) && !event.metaKey && !event.defaultPrevented;
    pendingRightCommand = false;
    if (!tapped) return;
    const live = liveSession();
    if (live) {
      if (live.controller.currentState.phase !== "recording") return;
      void live.controller.stop();
    } else if (composer?.canStart()) {
      void composer.controller.start();
    } else {
      void fallback.controller.start();
    }
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
