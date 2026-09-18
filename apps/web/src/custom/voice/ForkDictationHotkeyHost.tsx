import { useEffect } from "react";
import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import {
  createDictationFallback,
  installDictationHotkeys,
  type DictationFallbackActions,
  type DictationFallbackPresenter,
} from "./forkDictationSession";
import { readForkVoiceInputBridge } from "./forkVoiceInputBridge";

type ToastId = ReturnType<typeof toastManager.add>;

/**
 * The words for a session with no composer to land in: one toast per session,
 * updated in place from preparing through listening to the transcript with a
 * Copy button. Closing a live toast by any route (corner X, swipe) cancels
 * the session, through the toast's own close callback rather than the corner
 * X alone. The finished toast (transcript or error) is detached from the
 * session: it stays until dismissed or copied, and dismissing it cannot
 * touch a session that started since.
 */
function createToastPresenter(actions: DictationFallbackActions): DictationFallbackPresenter {
  let liveId: ToastId | null = null;
  let downloadPercent: number | null = null;
  const live = (title: string, description: string) => {
    const options = {
      ...stackedThreadToast({ type: "loading", title, description, timeout: 0 }),
      onClose: () => {
        // Closed by the user while still live: end the session with it.
        if (liveId === null) return;
        liveId = null;
        actions.cancel();
      },
    };
    if (liveId === null) liveId = toastManager.add(options);
    else toastManager.update(liveId, options);
  };
  type FinishedOptions = ReturnType<typeof stackedThreadToast> & {
    onClose: (() => void) | undefined;
  };
  const finish = (build: (id: ToastId | null) => FinishedOptions) => {
    const id = liveId;
    liveId = null;
    if (id === null) toastManager.add(build(null));
    else toastManager.update(id, build(id));
  };
  return {
    onStateChange: (state: VoiceInputState, error: string | null) => {
      switch (state.phase) {
        case "preparing":
          downloadPercent = null;
          live("Preparing dictation", "Getting the microphone ready.");
          return;
        case "recording":
          live("Listening", "Tap Right Command to finish, or press Escape to cancel.");
          return;
        case "transcribing":
          live("Transcribing", "Press Escape to cancel.");
          return;
        case "error":
          finish(() => ({
            ...stackedThreadToast({
              type: "error",
              title: "Dictation failed",
              description: error ?? "Dictation failed.",
              ...(state.errorAction === "settings"
                ? {
                    actionProps: {
                      children: "Open microphone settings",
                      onClick: () => void readForkVoiceInputBridge()?.openMicrophoneSettings(),
                    },
                  }
                : {}),
              data: { hideCopyButton: true },
            }),
            onClose: actions.clearError,
          }));
          return;
        case "idle": {
          if (liveId === null) return;
          // Cancelled or interrupted before a transcript: nothing to keep.
          // Detach first so the toast's close callback does not cancel again.
          const id = liveId;
          liveId = null;
          toastManager.close(id);
          return;
        }
      }
    },
    onDownload: (percent) => {
      downloadPercent = percent;
      if (liveId === null) return;
      live(
        "Preparing dictation",
        downloadPercent === null
          ? "Getting the microphone ready."
          : `Downloading speech model ${downloadPercent}%`,
      );
    },
    onTranscript: (text) => {
      finish((id) => ({
        ...stackedThreadToast({
          type: "success",
          title: "Dictation ready to copy",
          description: text,
          timeout: 0,
          actionProps: {
            children: "Copy",
            onClick: () => {
              void writeTextToClipboard(text, "dictation")
                .then(() => {
                  if (id !== null) toastManager.close(id);
                })
                .catch(() => {
                  toastManager.add({ type: "error", title: "Could not copy the transcript." });
                });
            },
          },
        }),
        onClose: undefined,
      }));
    },
    dismiss: () => {
      if (liveId === null) return;
      const id = liveId;
      liveId = null;
      toastManager.close(id);
    },
  };
}

/**
 * Mounted once above the router (see `__root.tsx`): owns the fallback
 * dictation session for taps with no composer on screen, presents it as a
 * toast, and installs the right Command / Escape hotkeys for both it and the
 * composer's own session. Disposes all of it on unmount. Renders nothing,
 * and does nothing where the desktop voice bridge is absent.
 */
export function ForkDictationHotkeyHost() {
  useEffect(() => {
    const bridge = readForkVoiceInputBridge();
    if (!bridge) return;
    const fallback = createDictationFallback(bridge, createToastPresenter);
    const uninstall = installDictationHotkeys(fallback);
    return () => {
      uninstall();
      fallback.dispose();
    };
  }, []);
  return null;
}
