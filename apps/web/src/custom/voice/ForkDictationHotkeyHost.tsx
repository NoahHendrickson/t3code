import { useEffect } from "react";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import {
  cancelDictation,
  installDictationHotkeys,
  setDictationFallbackPresenter,
  type DictationFallbackView,
} from "./forkDictationHost";
import { readForkVoiceInputBridge } from "./forkVoiceInputBridge";

type ToastId = ReturnType<typeof toastManager.add>;

/**
 * The words for a session with no composer to land in: one toast per session,
 * updated in place from preparing through listening to the transcript with a
 * Copy button. The finished toast stays until dismissed (or copied) so the
 * words are never lost; the corner X on a live one cancels the session.
 */
function createToastPresenter() {
  let toastId: ToastId | null = null;
  const show = (options: ReturnType<typeof stackedThreadToast>) => {
    if (toastId === null) toastId = toastManager.add(options);
    else toastManager.update(toastId, options);
  };
  return (view: DictationFallbackView) => {
    switch (view.kind) {
      case "preparing":
        show(
          stackedThreadToast({
            type: "loading",
            title: "Preparing dictation",
            description:
              view.downloadPercent === null
                ? "Getting the microphone ready."
                : `Downloading speech model ${view.downloadPercent}%`,
            timeout: 0,
            data: { onClose: cancelDictation },
          }),
        );
        return;
      case "recording":
        show(
          stackedThreadToast({
            type: "loading",
            title: "Listening",
            description: "Tap Right Command to finish, or press Escape to cancel.",
            timeout: 0,
            data: { onClose: cancelDictation },
          }),
        );
        return;
      case "transcribing":
        show(
          stackedThreadToast({
            type: "loading",
            title: "Transcribing",
            description: "Press Escape to cancel.",
            timeout: 0,
            data: { onClose: cancelDictation },
          }),
        );
        return;
      case "delivered": {
        const finished = toastId;
        show(
          stackedThreadToast({
            type: "success",
            title: "Dictation ready to copy",
            description: view.text,
            timeout: 0,
            actionProps: {
              children: "Copy",
              onClick: () => {
                void writeTextToClipboard(view.text, "dictation")
                  .then(() => {
                    if (finished !== null) toastManager.close(finished);
                  })
                  .catch(() => {
                    toastManager.add({ type: "error", title: "Could not copy the transcript." });
                  });
              },
            },
            data: {},
          }),
        );
        toastId = null;
        return;
      }
      case "error":
        show(
          stackedThreadToast({
            type: "error",
            title: "Dictation failed",
            description: view.message,
            ...(view.errorAction === "settings"
              ? {
                  actionProps: {
                    children: "Open microphone settings",
                    onClick: () => void readForkVoiceInputBridge()?.openMicrophoneSettings(),
                  },
                }
              : {}),
            // The X clears the controller's error so the next tap starts clean.
            data: { onClose: cancelDictation, hideCopyButton: true },
          }),
        );
        toastId = null;
        return;
      case "dismissed":
        if (toastId !== null) toastManager.close(toastId);
        toastId = null;
        return;
    }
  };
}

/**
 * Mounted once above the router (see `__root.tsx`): installs the right
 * Command / Escape hotkeys for the app-level dictation session and presents
 * sessions that have no composer on screen as a toast. Renders nothing, and
 * does nothing where the desktop voice bridge is absent.
 */
export function ForkDictationHotkeyHost() {
  useEffect(() => {
    setDictationFallbackPresenter(createToastPresenter());
    const uninstall = installDictationHotkeys();
    return () => {
      uninstall();
      setDictationFallbackPresenter(null);
    };
  }, []);
  return null;
}
