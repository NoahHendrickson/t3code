import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  VoiceInputController,
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceInputState,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import { randomUUID } from "~/lib/utils";
import { BrowserVoiceRecorder, recordingToWav } from "./BrowserVoiceRecorder";
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
  events: { onDownload: (percent: number) => void; onDetail: (message: string) => void },
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
 * composer becoming disabled (an approval or question arriving mid-sentence)
 * and is settled by the user, not silently dropped.
 */
type DictationInput = {
  readonly ownerKey: string;
  readonly disabled: boolean;
  readonly getComposerElement: () => HTMLElement | null;
  readonly readDraft: () => { value: string; expandedCursor: number };
  readonly commitDraft: (text: string, cursor: number) => void;
};

/**
 * The controller's stale-draft check already compares owner and text, which is
 * what a switched thread or an edited prompt changes; the revision stays fixed.
 */
function createController(
  bridge: ForkVoiceInputBridge,
  latest: () => DictationInput,
  set: {
    state: (next: VoiceInputState) => void;
    detail: (message: string | null) => void;
    download: (percent: number | null) => void;
  },
): VoiceInputController {
  const recorder = new BrowserVoiceRecorder();
  recorder.onError = set.detail;
  const controller = new VoiceInputController({
    recorder,
    requestPermission: queryMicrophonePermission,
    configureRecording: async () => {},
    releaseRecording: async () => recorder.release(),
    deleteRecording: (uri) => URL.revokeObjectURL(uri),
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
  recorder.onInterrupted = () =>
    void controller.interruptRecording("Microphone disconnected. Please record again.");
  return controller;
}

export function useForkDictationController(input: DictationInput) {
  const [state, setState] = useState(INITIAL_STATE);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // Called only from controller callbacks and key handlers, which run on user
  // events after commit and need the latest closures, not the mount-time ones.
  const readInput = useEffectEvent(() => input);
  const [controller] = useState(() => {
    const bridge = readForkVoiceInputBridge();
    return bridge
      ? createController(bridge, readInput, {
          state: setState,
          detail: setDetail,
          download: setDownloadPercent,
        })
      : null;
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
        if (phase === "idle" || !(inComposer || unfocused)) return;
        controller.cancel();
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
  }, [controller]);

  const start = () => {
    if (!input.disabled) void controller?.start();
  };
  const stop = () => void controller?.stop();
  const cancel = () => controller?.cancel();

  return {
    isAvailable: controller !== null,
    state,
    downloadPercent,
    // Specific failure text from the bridge or recorder wins over the
    // controller's generic message, but only while an error is showing.
    error: state.phase === "error" ? (detail ?? state.error) : null,
    blocksSubmission: voiceInputBlocksSubmission(state),
    freezesEditor: voiceInputFreezesEditor(state),
    start,
    stop,
    cancel,
  };
}

export type ForkDictation = ReturnType<typeof useForkDictationController>;
