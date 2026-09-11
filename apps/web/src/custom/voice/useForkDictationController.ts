import { useCallback, useEffect, useRef, useState } from "react";
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
export function useForkDictationController(input: {
  readonly ownerKey: string;
  readonly prompt: string;
  readonly disabled: boolean;
  readonly getComposerElement: () => HTMLElement | null;
  readonly readDraft: () => { value: string; expandedCursor: number };
  readonly commitDraft: (text: string, cursor: number) => void;
}) {
  const [bridge] = useState(readForkVoiceInputBridge);
  const [state, setState] = useState(INITIAL_STATE);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;
  const previousDraftRef = useRef({ ownerKey: input.ownerKey, text: input.prompt });
  const revisionRef = useRef(0);
  if (
    previousDraftRef.current.ownerKey !== input.ownerKey ||
    previousDraftRef.current.text !== input.prompt
  ) {
    previousDraftRef.current = { ownerKey: input.ownerKey, text: input.prompt };
    revisionRef.current += 1;
  }

  const controllerRef = useRef<VoiceInputController | null>(null);
  if (bridge && !controllerRef.current) {
    const recorder = new BrowserVoiceRecorder();
    recorder.onError = setDetail;
    const controller = new VoiceInputController({
      recorder,
      requestPermission: queryMicrophonePermission,
      configureRecording: async () => {},
      releaseRecording: async () => recorder.release(),
      deleteRecording: (uri) => URL.revokeObjectURL(uri),
      getTranscriber: () =>
        createBridgeTranscriber(bridge, { onDownload: setDownloadPercent, onDetail: setDetail }),
      readDraft: () => {
        const current = latestInputRef.current;
        const snapshot = current.readDraft();
        return {
          ownerKey: current.ownerKey,
          text: snapshot.value,
          selection: { start: snapshot.expandedCursor, end: snapshot.expandedCursor },
          revision: revisionRef.current,
        };
      },
      commitDraft: (text, selection) => latestInputRef.current.commitDraft(text, selection.start),
      onStateChange: (next) => {
        if (next.phase === "preparing") {
          setDetail(null);
          setDownloadPercent(null);
        }
        setState(next);
      },
    });
    recorder.onLimit = () => void controller.stop();
    recorder.onInterrupted = () =>
      void controller.interruptRecording("Microphone disconnected. Please record again.");
    controllerRef.current = controller;
  }
  const controller = controllerRef.current;

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
      const composer = latestInputRef.current.getComposerElement();
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
          if (!inComposer || latestInputRef.current.disabled) return;
          void controller.start();
        } else return;
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [controller]);

  const start = useCallback(() => {
    if (!latestInputRef.current.disabled) void controller?.start();
  }, [controller]);
  const stop = useCallback(() => void controller?.stop(), [controller]);
  const cancel = useCallback(() => controller?.cancel(), [controller]);

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
