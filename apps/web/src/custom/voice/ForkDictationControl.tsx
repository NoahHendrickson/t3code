import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { StopSquareIcon } from "~/custom/StopSquareIcon";
import { randomUUID } from "~/lib/utils";
import {
  VoiceInputController,
  voiceInputBlocksSubmission,
  type DesktopVoiceInputBridge,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { BrowserVoiceRecorder, recordingToWav } from "./BrowserVoiceRecorder";

function getBridge(): DesktopVoiceInputBridge | undefined {
  return (globalThis as { forkDesktopBridge?: { voiceInput?: DesktopVoiceInputBridge } })
    .forkDesktopBridge?.voiceInput;
}

interface Props {
  ownerKey: string;
  prompt: string;
  disabled: boolean;
  readDraft: () => { value: string; expandedCursor: number };
  commitDraft: (text: string, cursor: number) => void;
  onBusyChange: (busy: boolean) => void;
}

export function ForkDictationControl(props: Props) {
  const bridge = getBridge();
  const latest = useRef(props);
  const revision = useRef({ text: props.prompt, value: 0 });
  useLayoutEffect(() => {
    latest.current = props;
    if (revision.current.text !== props.prompt)
      revision.current = { text: props.prompt, value: revision.current.value + 1 };
  }, [props]);
  const [state, setState] = useState<VoiceInputState>({
    phase: "idle",
    error: null,
    errorAction: null,
  });
  const [download, setDownload] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const controller = useRef<VoiceInputController | null>(null);
  const request = useRef<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!bridge) return;
    const ownerKey = latest.current.ownerKey;
    const recorder = new BrowserVoiceRecorder();
    let mounted = true;
    const instance = new VoiceInputController({
      recorder,
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      configureRecording: async () => {},
      releaseRecording: async () => {
        recorder.release();
      },
      deleteRecording: (uri) => URL.revokeObjectURL(uri),
      getTranscriber: () => ({
        prepare: async ({ signal }) => {
          const requestId = randomUUID();
          request.current = requestId;
          if (mounted) {
            setDetail(null);
            setDownload(null);
          }
          const abort = () => {
            void bridge.cancel(requestId).catch(() => {});
          };
          signal.addEventListener("abort", abort, { once: true });
          const unsubscribe = bridge.onDownloadProgress((event) => {
            if (mounted && event.requestId === requestId) setDownload(event.percent);
          });
          try {
            await bridge.prepare(requestId);
            signal.throwIfAborted();
          } catch (error) {
            signal.removeEventListener("abort", abort);
            if (mounted && !signal.aborted)
              setDetail(
                error instanceof Error ? error.message : "Could not prepare local dictation.",
              );
            throw error;
          } finally {
            unsubscribe();
          }
          return {
            locale: navigator.language,
            transcribe: async (uri, { signal: transcriptionSignal }) => {
              try {
                const wav = await recordingToWav(uri, transcriptionSignal);
                if (!wav) return "";
                transcriptionSignal.throwIfAborted();
                return await bridge.transcribe(requestId, wav);
              } catch (error) {
                if (mounted && !transcriptionSignal.aborted)
                  setDetail(error instanceof Error ? error.message : "Local transcription failed.");
                throw error;
              } finally {
                signal.removeEventListener("abort", abort);
              }
            },
          };
        },
      }),
      readDraft: () => {
        if (!mounted || latest.current.disabled || latest.current.ownerKey !== ownerKey)
          return null;
        const snapshot = latest.current.readDraft();
        return {
          ownerKey: latest.current.ownerKey,
          text: snapshot.value,
          selection: { start: snapshot.expandedCursor, end: snapshot.expandedCursor },
          revision: revision.current.value,
        };
      },
      commitDraft: (text, selection) => latest.current.commitDraft(text, selection.start),
      onStateChange: (next) => {
        if (mounted) {
          setState(next);
          latest.current.onBusyChange(voiceInputBlocksSubmission(next));
        }
      },
    });
    recorder.onLimit = () => {
      void instance.stop();
    };
    recorder.onInterrupted = () => {
      void instance.interruptRecording("Microphone disconnected. Please record again.");
    };
    recorder.onError = (message) => {
      if (mounted) setDetail(message);
    };
    controller.current = instance;
    const visibility = () => {
      if (document.hidden) void instance.appMovedToBackground();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted = false;
      instance.cancel();
      recorder.release();
      if (request.current) void bridge.cancel(request.current).catch(() => {});
      controller.current = null;
      latest.current.onBusyChange(false);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [bridge]);

  useEffect(() => {
    if (props.disabled) controller.current?.cancel();
  }, [props.disabled]);

  useEffect(() => {
    if (!bridge) return;
    const keydown = (event: KeyboardEvent) => {
      const instance = controller.current;
      if (!instance || event.repeat || event.defaultPrevented) return;
      const busy = voiceInputBlocksSubmission(instance.currentState);
      if (event.key === "Escape" && busy) {
        event.preventDefault();
        event.stopPropagation();
        instance.cancel();
      } else if (
        event.code === "Space" &&
        event.ctrlKey &&
        event.shiftKey &&
        !event.metaKey &&
        !event.altKey &&
        !latest.current.disabled
      ) {
        // Scope the shortcut to the active composer; other windows and dialogs keep their keys.
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !root.current ||
          target.closest("[data-fork-dictation-composer]") !==
            root.current.closest("[data-fork-dictation-composer]")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (instance.currentState.phase === "recording") void instance.stop();
        else if (!busy) void instance.start();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [bridge]);

  if (!bridge) return null;
  const busy = voiceInputBlocksSubmission(state);
  const recording = state.phase === "recording";
  const label = recording ? "Stop dictation" : "Dictate (Ctrl+Shift+Space)";
  const status =
    state.phase === "preparing"
      ? download === null
        ? "Preparing…"
        : `Downloading model ${download}%`
      : state.phase === "transcribing"
        ? "Transcribing…"
        : recording
          ? "Recording"
          : null;
  return (
    <div ref={root} className="relative flex shrink-0 items-center gap-1" data-fork-dictation>
      {status ? (
        <span role="status" className="max-w-36 text-xs text-muted-foreground">
          {status}
        </span>
      ) : null}
      {state.error ? (
        <div
          role="alert"
          className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          {detail ?? state.error}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDetail(null);
              controller.current?.cancel();
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={recording}
              disabled={props.disabled || (busy && !recording)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (recording) void controller.current?.stop();
                else void controller.current?.start();
              }}
            />
          }
        >
          {recording ? (
            <span className="text-red-500">
              <StopSquareIcon />
            </span>
          ) : (
            <MicrophoneIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup>{label}. Free and local. First use downloads a 466 MiB model.</TooltipPopup>
      </Tooltip>
      {busy ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel dictation"
          onClick={() => controller.current?.cancel()}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
