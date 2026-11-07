import { useEffect, useLayoutEffect, useRef } from "react";
import type { useEnvironmentSpeechInput } from "~/speech/useEnvironmentSpeechInput";
import { useOwnsGlobalInput } from "../splitThreads/splitPaneContext";

type SpeechInput = ReturnType<typeof useEnvironmentSpeechInput>;

/**
 * The fork's dictation controls (ghost mic, send-slot check and X, notices)
 * drawn over upstream's environment speech input, which owns recording,
 * transcription, setup and Send-while-dictating.
 */
export function forkDictationFromSpeech(speech: SpeechInput) {
  const { state } = speech;
  return {
    isAvailable: speech.available,
    state,
    level: speech.level,
    error: state.phase === "error" ? state.error : null,
    errorAction: state.phase === "error" ? state.errorAction : null,
    blocksSubmission: speech.blocksSubmission,
    freezesEditor: speech.freezesEditor,
    start: () => {
      void speech.start();
    },
    stop: () => {
      void speech.stop();
    },
    cancel: speech.cancel,
    /** For a composer whose controls just left the screen: nothing would be left to end it. */
    settleWithoutControls: () => {
      if (state.phase === "recording") void speech.stop();
      else if (state.phase === "preparing") speech.cancel();
    },
  };
}

export type ForkDictation = ReturnType<typeof forkDictationFromSpeech>;

export type ForkDictationTarget = {
  readonly dictation: () => ForkDictation;
  readonly canStart: () => boolean;
};

let target: ForkDictationTarget | null = null;

/** The latest registration wins; its cleanup only clears itself. */
export function registerForkDictationTarget(next: ForkDictationTarget): () => void {
  target = next;
  return () => {
    if (target === next) target = null;
  };
}

/**
 * Registers the composer on screen as the right Command tap's target while
 * its pane owns window input (focused in a split, not behind Settings or
 * Usage). Reads through a layout-phase mirror: ChatComposer is memoized, so
 * an effect event would keep its first render's closure.
 */
export function useForkDictationHotkeyTarget(dictation: ForkDictation, disabled: boolean): void {
  const latest = useRef({ dictation, disabled });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- mirrors the live session for the window-level hotkey, which reads it outside render
  useLayoutEffect(() => {
    latest.current = { dictation, disabled };
  });
  const ownsInput = useOwnsGlobalInput();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this composer with the window-level right Command hotkey
  useEffect(() => {
    if (!ownsInput) return;
    return registerForkDictationTarget({
      dictation: () => latest.current.dictation,
      canStart: () => !latest.current.disabled,
    });
  }, [ownsInput]);
  // Losing input (another pane focused, or Settings or Usage over the thread) leaves no
  // hotkey to end a live recording, so it settles into its own draft.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- settles a live recording when this pane stops owning window input
  useEffect(() => {
    if (!ownsInput) latest.current.dictation.settleWithoutControls();
  }, [ownsInput]);
}

function extraModifiersHeld(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey;
}

/** Right Command by itself. Fires on keyup of a tap so ⌘C and friends stay chords. */
function isRightCommandTap(event: KeyboardEvent): boolean {
  return event.code === "MetaRight" && !event.repeat && !extraModifiersHeld(event);
}

/**
 * Window-level: a bare right Command tap starts dictation into the composer
 * on screen and a second tap finishes it. Arming on keydown and disarming on
 * any other key, pointer or wheel keeps ⌘-chords, ⌘-click and ⌘-scroll
 * intact; metaKey still true on keyup means left ⌘ is held too. Escape is
 * upstream's dictation shortcut's.
 */
export function installForkDictationHotkey(): () => void {
  let armed = false;
  const onKeyDown = (event: KeyboardEvent) => {
    armed = isRightCommandTap(event) && !event.defaultPrevented;
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const tapped = armed && isRightCommandTap(event) && !event.metaKey && !event.defaultPrevented;
    armed = false;
    if (!tapped || !target) return;
    const dictation = target.dictation();
    if (!dictation.isAvailable) return;
    if (dictation.blocksSubmission) {
      if (dictation.state.phase !== "recording") return;
      dictation.stop();
    } else if (target.canStart()) {
      dictation.start();
    } else {
      return;
    }
    event.preventDefault();
  };
  const disarm = () => {
    armed = false;
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
