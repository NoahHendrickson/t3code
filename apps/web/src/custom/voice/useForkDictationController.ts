import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  VoiceInputController,
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceInputState,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import { randomUUID } from "~/lib/utils";
import { BrowserVoiceRecorder, recordingToWav, releaseRecording } from "./BrowserVoiceRecorder";
import { readForkVoiceInputBridge, type ForkVoiceInputBridge } from "./forkVoiceInputBridge";

const INITIAL_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

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

function isDictationChord(event: KeyboardEvent): boolean {
  return (
    event.code === "Space" && event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey
  );
}

/**
 * Composer-owned dictation session, mirroring mobile's `useVoiceInputController`.
 * The composer reads `blocksSubmission` / `freezesEditor` directly; the mic
 * button only renders state and calls `start` / `stop` / `cancel`.
 *
 * `disabled` gates starting only. A recording already in flight survives the
 * composer becoming disabled (a question arriving mid-sentence) and is settled
 * by the user. When the composer hides the controls themselves (an approval
 * replaces the action cluster) the recording is transcribed on the spot, so a
 * live mic is never left with no button to end it.
 */
type DictationInput = {
  readonly ownerKey: string;
  readonly disabled: boolean;
  readonly getComposerElement: () => HTMLElement | null;
  readonly focusEditor: () => void;
  readonly readDraft: () => { value: string; expandedCursor: number };
  readonly commitDraft: (text: string, cursor: number) => void;
};

const BLOCKING_PHASES = new Set<VoiceInputState["phase"]>([
  "preparing",
  "recording",
  "transcribing",
]);

type LevelListener = (level: number) => void;

/**
 * The controller's stale-draft check already compares owner and text, which is
 * what a switched thread or an edited prompt changes; the revision stays fixed.
 *
 * Input levels bypass React state on purpose: they arrive at 20 Hz and only the
 * level meter cares, so subscribers write to the DOM themselves.
 */
function createSession(
  bridge: ForkVoiceInputBridge,
  latest: () => DictationInput,
  set: {
    state: (next: VoiceInputState) => void;
    detail: (message: string | null) => void;
    download: (percent: number | null) => void;
  },
) {
  const recorder = new BrowserVoiceRecorder();
  recorder.onError = set.detail;
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
      createBridgeTranscriber(bridge, { onDownload: set.download, onDetail: set.detail }),
    readDraft: () => {
      const current = latest();
      const snapshot = current.readDraft();
      return {
        ownerKey: current.ownerKey,
        text: snapshot.value,
        selection: { start: snapshot.expandedCursor, end: snapshot.expandedCursor },
        revision: 0,
      };
    },
    commitDraft: (text, selection) => latest().commitDraft(text, selection.start),
    onStateChange: (next) => {
      if (next.phase === "preparing") {
        set.detail(null);
        set.download(null);
      }
      set.state(next);
    },
  });
  recorder.onLimit = () => void controller.stop();
  recorder.onInterrupted = (message) => void controller.interruptRecording(message);
  const settleWithoutControls = () => {
    const { phase } = controller.currentState;
    if (phase === "recording") void controller.stop();
    else if (phase === "preparing") controller.cancel();
  };
  return { controller, subscribeLevel, settleWithoutControls };
}

const NO_SESSION = {
  controller: null,
  subscribeLevel: (_listener: LevelListener) => () => {},
  settleWithoutControls: () => {},
};

export function useForkDictationController(input: DictationInput) {
  const [state, setState] = useState(INITIAL_STATE);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // The composer is memoized. React's effect-event callback can retain its
  // first render there, routing later recordings into the first thread.
  // Refresh after commit so the session reads the visible composer's callbacks,
  // never an abandoned concurrent render's target.
  const inputRef = useRef(input);
  useLayoutEffect(() => {
    inputRef.current = input;
  });
  const readInput = useCallback(() => inputRef.current, []);
  // Initialization only registers callbacks; none reads the input until an event.
  // oxlint-disable-next-line react/refs
  const [{ controller, subscribeLevel, settleWithoutControls }] = useState(() => {
    const bridge = readForkVoiceInputBridge();
    return bridge
      ? createSession(bridge, readInput, {
          state: (next) => {
            setState(next);
            if (next.phase === "error") readInput().focusEditor();
          },
          detail: setDetail,
          // The one-time download reports every integer percent; the label
          // only needs coarse steps, and each update re-renders the composer.
          download: (percent) =>
            setDownloadPercent(percent === null ? null : Math.floor(percent / 5) * 5),
        })
      : NO_SESSION;
  });

  const previousOwnerRef = useRef(input.ownerKey);
  useEffect(() => {
    if (previousOwnerRef.current === input.ownerKey) return;
    previousOwnerRef.current = input.ownerKey;
    controller?.ownerChanged();
  }, [controller, input.ownerKey]);

  useEffect(() => () => controller?.dispose(), [controller]);

  // Window-level on purpose: freezing the editor drops focus to <body>, so
  // stop and cancel must work from there. Starting still needs focus inside
  // this composer, and a focused dialog keeps its own Escape.
  useEffect(() => {
    if (!controller) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      const { phase } = controller.currentState;
      const target = event.target;
      const composer = readInput().getComposerElement();
      const inComposer = target instanceof Node && composer?.contains(target) === true;
      const unfocused = target === document.body || target === document;
      if (event.key === "Escape") {
        // Only while dictation is actually holding the composer; a lingering
        // error banner must not eat Escape from other composer UI.
        if (!BLOCKING_PHASES.has(phase) || !(inComposer || unfocused)) return;
        controller.cancel();
        readInput().focusEditor();
      } else if (isDictationChord(event)) {
        if (phase === "recording") {
          if (!(inComposer || unfocused)) return;
          void controller.stop();
        } else if (phase === "idle" || phase === "error") {
          if (!inComposer || readInput().disabled) return;
          void controller.start();
        } else return;
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [controller, readInput]);

  const start = () => {
    if (!input.disabled) void controller?.start();
  };
  const stop = () => void controller?.stop();
  const cancel = () => {
    controller?.cancel();
    input.focusEditor();
  };

  return {
    isAvailable: controller !== null,
    state,
    downloadPercent,
    // Specific failure text from the bridge or recorder wins over the
    // controller's generic message, but only while an error is showing.
    error: state.phase === "error" ? (detail ?? state.error) : null,
    errorAction: state.phase === "error" ? state.errorAction : null,
    blocksSubmission: voiceInputBlocksSubmission(state),
    freezesEditor: voiceInputFreezesEditor(state),
    subscribeLevel,
    start,
    stop,
    cancel,
    settleWithoutControls,
  };
}

export type ForkDictation = ReturnType<typeof useForkDictationController>;
