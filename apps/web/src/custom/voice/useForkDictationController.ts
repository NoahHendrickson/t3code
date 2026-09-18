import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  voiceInputBlocksSubmission,
  voiceInputFreezesEditor,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import {
  createDictationSession,
  registerDictationComposer,
  type DictationSession,
} from "./forkDictationSession";
import { readForkVoiceInputBridge } from "./forkVoiceInputBridge";

const INITIAL_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

/**
 * Composer-owned dictation session, mirroring mobile's `useVoiceInputController`.
 * The composer reads `blocksSubmission` / `freezesEditor` directly; the mic
 * button only renders state and calls `start` / `stop` / `cancel`. The
 * keyboard lives at the root (`ForkDictationHotkeyHost`): this hook registers
 * the mounted composer so a right Command tap anywhere in the window starts
 * into the thread on screen, and unregisters (disposing the session) on unmount.
 *
 * `disabled` gates starting only; a tap while disabled goes to the root's
 * fallback session instead. A recording already in flight survives the
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

const NO_SESSION: DictationSession | null = null;

export function useForkDictationController(input: DictationInput) {
  // Handing the ref mirror below into a render-phase initializer costs this
  // hook its React Compiler memoization ("Cannot access refs during render").
  // Stated so the loss is deliberate: ChatComposer itself does not compile
  // either, so nothing downstream keys on the returned object's identity.
  "use no memo";
  const [state, setState] = useState(INITIAL_STATE);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
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
  const inputRef = useRef(input);
  useLayoutEffect(() => {
    inputRef.current = input;
  });
  // Initialization only registers callbacks; none reads the input until an event.
  // oxlint-disable-next-line react/refs
  const [session] = useState(() => {
    const bridge = readForkVoiceInputBridge();
    if (!bridge) return NO_SESSION;
    // The controller's stale-draft check already compares owner and text, which
    // is what a switched thread or an edited prompt changes; the revision stays fixed.
    return createDictationSession(bridge, {
      readDraft: () => {
        const current = inputRef.current;
        const snapshot = current.readDraft();
        return {
          ownerKey: current.ownerKey,
          text: snapshot.value,
          selection: { start: snapshot.expandedCursor, end: snapshot.expandedCursor },
          revision: 0,
        };
      },
      commitDraft: (text, selection) => inputRef.current.commitDraft(text, selection.start),
      onStateChange: (next) => {
        if (next.phase === "preparing") {
          setDetail(null);
          setDownloadPercent(null);
        }
        setState(next);
        if (next.phase === "error") inputRef.current.focusEditor();
      },
      onDetail: setDetail,
      onDownload: setDownloadPercent,
    });
  });
  const controller = session?.controller ?? null;

  const previousOwnerRef = useRef(input.ownerKey);
  useLayoutEffect(() => {
    if (previousOwnerRef.current === input.ownerKey) return;
    previousOwnerRef.current = input.ownerKey;
    controller?.ownerChanged();
  }, [controller, input.ownerKey]);

  // Registered once per mount; every callback reads the mirror, so the root
  // hotkeys always reach the thread this composer is showing now.
  useEffect(() => {
    if (!controller) return;
    const unregister = registerDictationComposer({
      controller,
      canStart: () => !inputRef.current.disabled,
      contains: (target) => {
        const composer = inputRef.current.getComposerElement();
        return target instanceof Node && composer?.contains(target) === true;
      },
      cancel: () => {
        controller.cancel();
        inputRef.current.focusEditor();
      },
    });
    return () => {
      unregister();
      controller.dispose();
    };
  }, [controller]);

  // Through the mirror, not the render scope: a caller that retains these
  // (memoizing ForkDictationControl, hoisting start into a command action)
  // would otherwise regress the click path to the old thread while the
  // keyboard path kept working.
  const start = () => {
    if (!inputRef.current.disabled) void controller?.start();
  };
  const stop = () => void controller?.stop();
  const cancel = () => {
    controller?.cancel();
    inputRef.current.focusEditor();
  };
  // For the composer whose controls just left the screen: a recording is
  // transcribed on the spot rather than left running with nothing to end it.
  const settleWithoutControls = () => {
    if (!controller) return;
    const { phase } = controller.currentState;
    if (phase === "recording") void controller.stop();
    else if (phase === "preparing") controller.cancel();
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
    subscribeLevel: session?.subscribeLevel ?? ((_listener: (level: number) => void) => () => {}),
    start,
    stop,
    cancel,
    settleWithoutControls,
  };
}

export type ForkDictation = ReturnType<typeof useForkDictationController>;
