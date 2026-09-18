import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import {
  bindDictationComposer,
  cancelDictation,
  dictationComposerOwnerChanged,
  getDictationSnapshot,
  isDictationAvailable,
  settleDictationWithoutControls,
  startDictation,
  stopDictation,
  subscribeDictation,
  subscribeDictationLevel,
  unbindDictationComposer,
  type DictationTarget,
} from "./forkDictationHost";

const INITIAL_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

/**
 * The composer's view of the app-level dictation session (`forkDictationHost`).
 * While mounted, the composer is the session's target: a start from the mic,
 * the keyboard anywhere in the window, or a retained callback lands in the
 * thread this composer is showing. The composer reads `blocksSubmission` /
 * `freezesEditor` directly; the mic button only renders state and calls
 * `start` / `stop` / `cancel`.
 *
 * `disabled` gates starting only: a session that starts while the composer
 * is disabled goes to the host's fallback (a toast) rather than the draft. A
 * recording already in flight survives the composer becoming disabled (a
 * question arriving mid-sentence) and is settled by the user. When the
 * composer hides the controls themselves (an approval replaces the action
 * cluster) the recording is transcribed on the spot, so a live mic is never
 * left with no button to end it.
 *
 * State is reported only for a session pinned to this composer's owner; a
 * fallback session in flight leaves the composer idle and editable.
 */
export function useForkDictationController(input: DictationTarget) {
  // Handing the ref mirror below to the host in a layout effect each commit
  // costs this hook its React Compiler memoization. Stated so the loss is
  // deliberate: ChatComposer itself does not compile either, so nothing
  // downstream keys on the returned object's identity.
  "use no memo";
  // ChatComposer is `memo(fn)`, and react-dom applies useEffectEvent impls only
  // for FunctionComponent fibers — memo and forwardRef hosts are skipped
  // outright (`case 11: case 15: break;` in commitBeforeMutationEffects,
  // react-dom 19.2.6). An effect event declared here would keep its mount-time
  // closure forever and route every later recording into the first thread
  // opened. Audit on a React bump: grep useEffectEvent, check whether the host
  // component is memoized or a forwardRef.
  //
  // The mirror syncs in the layout phase rather than during render (the shape
  // BranchToolbar and mobile's useVoiceInputController use) because a
  // render-phase write can latch an input from a concurrent render that never
  // commits. The owner-change cancel below is a layout effect for the same
  // reason: layout effects run in declaration order, so the mirror and the
  // cancel land in one uninterruptible commit with no window between them.
  // The ref object itself is the host's binding: one identity per mounted
  // composer, with `current` always the latest input.
  const binding = useRef(input);
  useLayoutEffect(() => {
    binding.current = input;
    bindDictationComposer(binding);
  });

  const previousOwnerRef = useRef(input.ownerKey);
  useLayoutEffect(() => {
    if (previousOwnerRef.current === input.ownerKey) return;
    previousOwnerRef.current = input.ownerKey;
    dictationComposerOwnerChanged();
  }, [input.ownerKey]);

  useEffect(() => () => unbindDictationComposer(binding), []);

  const snapshot = useSyncExternalStore(subscribeDictation, getDictationSnapshot);
  const own = snapshot.ownerKey === input.ownerKey;
  const state = own ? snapshot.state : INITIAL_STATE;

  return {
    isAvailable: isDictationAvailable(),
    state,
    downloadPercent: own ? snapshot.downloadPercent : null,
    // Specific failure text from the bridge or recorder wins over the
    // controller's generic message, but only while an error is showing.
    error: state.phase === "error" ? (snapshot.detail ?? state.error) : null,
    errorAction: state.phase === "error" ? state.errorAction : null,
    blocksSubmission: voiceInputBlocksSubmission(state),
    freezesEditor: voiceInputFreezesEditor(state),
    subscribeLevel: subscribeDictationLevel,
    // Host functions resolve the composer on screen at call time, so a caller
    // that retains these (memoizing ForkDictationControl, hoisting start into
    // a command action) still reaches the thread currently shown.
    start: startDictation,
    stop: stopDictation,
    cancel: cancelDictation,
    settleWithoutControls: settleDictationWithoutControls,
  };
}

export type ForkDictation = ReturnType<typeof useForkDictationController>;
