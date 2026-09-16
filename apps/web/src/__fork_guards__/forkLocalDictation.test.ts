// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-local-dictation`.
 *
 * Pins the wire format the packaged helper expects, the draft-insertion
 * contract, and the composer owning the session. Thread targeting across
 * navigation is guarded separately in `forkDictationThreadOwnership.test.tsx`.
 */
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { VoiceInputController } from "@t3tools/client-runtime/voice-input";
import { encodeVoiceWav, releaseRecording } from "../custom/voice/BrowserVoiceRecorder";

const read = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("fork local dictation", () => {
  it("encodes bounded mono 16kHz PCM with correctly clipped signed samples", () => {
    const wav = encodeVoiceWav(new Float32Array([-2, -1, 0, 1, 2]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      -32768, -32768, 0, 32767, 32767,
    ]);
  });

  it("inserts speech at the captured cursor and leaves sending to the user", async () => {
    let text = "Fix  please";
    let cursor = 4;
    const controller = new VoiceInputController({
      recorder: {
        uri: "blob:recording",
        prepareToRecordAsync: async () => {},
        record: () => {},
        stop: async () => {},
      },
      getTranscriber: () => ({
        prepare: async () => ({ locale: "en", transcribe: async () => "the bug" }),
      }),
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      configureRecording: async () => {},
      releaseRecording: async () => {},
      deleteRecording: releaseRecording,
      readDraft: () => ({
        ownerKey: "thread-1",
        text,
        selection: { start: cursor, end: cursor },
        revision: 0,
      }),
      commitDraft: (next, selection) => {
        text = next;
        cursor = selection.start;
      },
      onStateChange: () => {},
    });
    await controller.start();
    await controller.stop();
    expect(text).toBe("Fix the bug please");
    expect(cursor).toBe(11);
    expect(controller.currentState.phase).toBe("idle");
  });

  it("discards a transcript only when the draft text itself changed underneath it", async () => {
    // What the composer wiring must satisfy: the read at commit time is
    // compared against the read at start. A question arriving mid-recording
    // swaps the editor to its answer field, so the composer must keep
    // reading the prompt draft (see the guard below) or the transcript is
    // judged stale and lost.
    const run = async (drafts: { atStart: string; atStop: string }) => {
      // The controller reads once at start, once as recording begins (the
      // captured draft) and once at commit; only the commit read differs.
      let recording = false;
      let committed: string | null = null;
      const controller = new VoiceInputController({
        recorder: {
          uri: "blob:recording",
          prepareToRecordAsync: async () => {},
          record: () => {},
          stop: async () => {},
        },
        getTranscriber: () => ({
          prepare: async () => ({ locale: "en", transcribe: async () => "the bug" }),
        }),
        requestPermission: async () => ({ granted: true, canAskAgain: true }),
        configureRecording: async () => {},
        releaseRecording: async () => {},
        deleteRecording: releaseRecording,
        readDraft: () => ({
          ownerKey: "thread-1",
          text: recording ? drafts.atStop : drafts.atStart,
          selection: { start: 4, end: 4 },
          revision: 0,
        }),
        commitDraft: (next) => {
          committed = next;
        },
        onStateChange: () => {},
      });
      await controller.start();
      recording = true;
      await controller.stop();
      return { committed, phase: controller.currentState.phase };
    };
    // Prompt preserved across the question: the transcript lands in it.
    expect(await run({ atStart: "Fix  please", atStop: "Fix  please" })).toEqual({
      committed: "Fix the bug please",
      phase: "idle",
    });
    // The answer field read instead (the bug): the transcript is discarded.
    const swapped = await run({ atStart: "Fix  please", atStop: "" });
    expect(swapped.committed).toBeNull();
  });

  it("keeps the composer owning the session, with the bridge and helper wired", () => {
    const composer = read("../components/chat/ChatComposer.tsx");
    const control = read("../custom/voice/ForkDictationControl.tsx");
    const controller = read("../custom/voice/useForkDictationController.ts");
    const preload = read("../../../desktop/src/preload.ts");
    const runtimeExports = read("../../../../packages/client-runtime/src/voice-input/index.ts");
    const packaging = read("../../../../scripts/build-desktop-artifact.ts");
    const theme = read("../theme.custom.css");
    const shell = read("../custom/ComposerShell.tsx");
    // Composer holds the hook and reads the gates directly, like mobile:
    // the send gate is the first clause of sendDisabledReason and the editor
    // gate sits in the prompt editor's `disabled` chain.
    expect(composer).toContain("useForkDictationController({");
    expect(composer).toMatch(
      /const sendDisabledReason =\s*(?:\/\*[^*]*\*\/\s*)*\(dictation\.blocksSubmission\s*\?/u,
    );
    expect(composer).toMatch(
      /disabled=\{\s*isConnecting \|\|\s*isComposerApprovalState \|\|\s*(?:\/\*[^*]*\*\/\s*)*dictation\.freezesEditor \|\|/u,
    );
    expect(composer).toContain("<ForkDictationNotices dictation={dictation} />");
    // While a question or approval is showing, the dictation draft is the
    // store's `prompt`, never `promptRef` (which mirrors the answer field then)
    // and never the editor snapshot (which is the answer editor).
    const hookArgument = composer.slice(
      composer.indexOf("useForkDictationController({"),
      composer.indexOf(
        "/* fork:end fork-local-dictation */",
        composer.indexOf("useForkDictationController({"),
      ),
    );
    expect(hookArgument).toMatch(/return \{ value: prompt, expandedCursor: prompt\.length \}/u);
    expect(hookArgument).toMatch(
      /if \(activePendingApproval !== null \|\| activePendingProgress\) \{\s*setPrompt\(text\);\s*return;/u,
    );
    expect(hookArgument).not.toContain("promptRef.current =");
    expect(hookArgument).not.toContain("value: promptRef.current");
    // Dictation borrows the send button. ChatComposer says when it owns the
    // slot: with nothing to send (the mic in place of a disabled send, but not
    // over a sending or connecting spinner) and for the whole of a live session
    // (the check, with a cancel X beside it). ComposerPrimaryActions hands the
    // slot over on every path that renders send, including while running, so
    // a session started from the mic always has its check. There it renders
    // before stop, so stop keeps the right edge and a live session's timeline,
    // X and check grow leftward without moving it; upstream's send while
    // running (mobile viewports) keeps its place after stop.
    const primary = read("../components/chat/ComposerPrimaryActions.tsx");
    expect(composer).toMatch(
      /const dictationOwnsPrimaryAction =\s*dictation\.isAvailable &&\s*\(dictation\.blocksSubmission \|\|\s*\(!composerSendState\.hasSendableContent && !isSendBusy && !isConnecting\)\)/u,
    );
    expect(composer).toContain(
      "dictationOwnsPrimaryAction ? { dictation, disabled: dictationDisabled } : null",
    );
    expect(primary).toMatch(
      /const sendButton = forkDictation \? \(\s*<ForkDictationPrimaryButton/u,
    );
    expect(primary).toMatch(
      /\{forkDictation \? sendButton : null\}[\s\S]{0,120}?\{renderStopGenerationButton\(false\)\}[\s\S]{0,200}?\{!forkDictation && showSendWhileRunning && hasSendableContent \? sendButton : null\}/u,
    );
    // The mic and check are the send button in every respect but glyph and
    // click: they wear its class list and its fork tone attribute, so the flat
    // white fill in dark applies to them as it does to send. That look is the
    // fork's normal button on every build: the tone is always "flat", the class
    // list never switches to the transparent stage-art variant, and the
    // Dev/Nightly stage art upstream still renders is hidden by the theme.
    expect(primary).not.toContain('"channel"');
    expect(primary).toMatch(/const sendButtonClassName =\s*"[^"]*bg-message-action[^"]*";/u);
    expect(primary).toContain('data-fork-composer-send-art=""');
    expect(theme).toMatch(/\[data-fork-composer-send-art\]\s*\{\s*display:\s*none;\s*\}/u);
    expect(primary).toMatch(/<button\s+type="submit"[^>]*className=\{sendButtonClassName\}/su);
    expect(control).toContain('className={cn(className, transcribing && "pointer-events-none")}');
    expect(control).toContain('data-fork-composer-action="send"');
    expect(control).toContain('data-fork-composer-send-tone="flat"');
    expect(control).toContain('data-fork-dictation-action={busy ? "done" : "dictate"}');
    expect(control).toMatch(/busy \? \(\s*<CheckIcon/u);
    expect(control).toMatch(/\) : \(\s*<MicrophoneIcon weight="fill"/u);
    // Once there is something to send, send takes its slot back and the mic
    // steps beside it as a ghost in attach's box, same filled glyph, so
    // dictation stays one click away while typing. Never alongside a live
    // session, whose X and check are in the slot.
    expect(composer).toMatch(
      /!dictationOwnsPrimaryAction \|\|[\s\S]{0,200}?<ForkDictationGhostMic/u,
    );
    expect(control).toMatch(
      /data-fork-composer-action="dictate"[\s\S]*?onClick=\{dictation\.start\}/u,
    );
    expect(control).toMatch(/icon=\{<MicrophoneIcon weight="fill" \/>\}/u);
    expect(theme).toMatch(
      /\.dark\s*:is\([^)]*\[data-fork-composer-action="dictate"\][^)]*\)\s*\{[^}]*color:\s*#ffffff/u,
    );
    expect(control).toContain(
      "onClick={recording ? dictation.stop : transcribing ? undefined : dictation.start}",
    );
    // The X is a ghost in attach's box, mounted only while a session is live.
    expect(control).toMatch(
      /\{busy \? \(\s*<Button[^>]*data-fork-composer-action="dictate-cancel"/su,
    );
    expect(theme).toContain('[data-fork-composer-action="dictate-cancel"]');
    // The level timeline is a canvas that fills the row to the left of the X,
    // mounted only while a session is live: dots for silence, bars for
    // speech, newest at the right edge, painted in its own colour (the
    // foreground; pure white in dark like the X).
    expect(control).toMatch(
      /\{busy \? <VoiceLevelTimeline subscribe=\{dictation\.subscribeLevel\} \/> : null\}/u,
    );
    expect(control).toContain("<canvas");
    expect(control).toContain('data-fork-dictation-timeline=""');
    expect(control).toContain('className="block h-6 min-w-0 flex-1 text-foreground"');
    expect(control).toContain("getComputedStyle(canvas).color");
    expect(control).not.toContain('"#ffffff"');
    expect(theme).toMatch(/\.dark \[data-fork-dictation-timeline\]\s*\{[^}]*color:\s*#ffffff/u);
    expect(theme).toMatch(/\[data-fork-dictation-timeline\]\s*\{[^}]*min-width:\s*96px/u);
    expect(controller).toContain("subscribeLevel");
    // In a started thread an empty prompt keeps the compact row: the cluster
    // fills attach's slot and the editor (gap 0, prompt collapsed, actions
    // flex). Typed text turns the row into the draft box's grid: attach keeps
    // its place beside the last line, the cluster spans the row beneath, and
    // the prompt reserves the cluster's idle width on the right so the lines
    // never reflow. prompt-empty is stamped on the row; the timeline's
    // presence keys the rest.
    const live = String.raw`:has\(\s*\[data-fork-dictation-timeline\]\s*\)`;
    const typed = String.raw`${live}:not\(\s*\[data-fork-composer-prompt-empty\]\s*\)`;
    expect(shell).toContain("promptEmpty");
    expect(shell).toContain("data-fork-composer-prompt-empty");
    expect(composer).toContain("promptEmpty={prompt.length === 0}");
    expect(theme).toMatch(
      new RegExp(
        String.raw`:not\(\[data-draft-hero\]\)\s*\[data-fork-composer-prompt-row\]${typed}\s*\{[^}]*display:\s*grid;[^}]*grid-template-areas:\s*"leading prompt"\s*"actions actions"`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`${typed}\s*\[data-fork-composer-leading-actions\]\s*\{[^}]*grid-area:\s*leading;\s*margin-inline-end:\s*6px`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`${typed}\s*\[data-chat-composer-inline-actions\]\s*\{[^}]*grid-area:\s*actions`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`\[data-fork-composer-prompt-row\]${live}\s*\[data-chat-composer-actions="right"\]\s*\{[^}]*width:\s*100%`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`:not\(\[data-draft-hero\]\)\s*\[data-fork-composer-prompt-row\]\[data-fork-composer-prompt-empty\]${live}\s*\{[^}]*gap:\s*0`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`\[data-fork-composer-prompt-empty\]${live}\s*\[data-fork-composer-prompt\]\s*\{[^}]*visibility:\s*hidden`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`\[data-fork-composer-prompt-empty\]${live}\s*\[data-chat-composer-inline-actions\]\s*\{[^}]*flex:\s*1 1 0`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`:not\(\[data-draft-hero\]\)\s*\[data-fork-composer-prompt-row\]${typed}\s*\[data-fork-composer-prompt\]\s*\{[^}]*padding-right:\s*calc\(24px \+ 24px\)`,
        "u",
      ),
    );
    expect(theme).toMatch(
      new RegExp(
        String.raw`${typed}:has\(\[data-fork-composer-action="dictate"\], \[data-fork-composer-action="stop"\]\)\s*\[data-fork-composer-prompt\]\s*\{[^}]*padding-right:\s*calc\(24px \+ 8px \+ 24px \+ 24px\)`,
        "u",
      ),
    );
    expect(theme).not.toMatch(/padding-left:\s*calc\(24px \+ 6px\)/u);
    // The ghost mic stays mounted (hidden) through a session that started over
    // typed text, so the reserve above still counts it.
    expect(composer).toMatch(
      /\(dictation\.blocksSubmission && composerSendState\.hasSendableContent\) \? \(\s*<ForkDictationGhostMic/u,
    );
    expect(composer).toContain("hidden={dictationOwnsPrimaryAction}");
    expect(control).toMatch(/data-fork-composer-action="dictate"\s*hidden=\{hidden\}/u);
    // Attach steps aside only where the cluster needs its slot, the compact
    // empty row: hidden by CSS rather than unmounted, so upstream's render
    // stands. Everywhere else it keeps its place, disabled for the session.
    expect(theme).toMatch(
      new RegExp(
        String.raw`:not\(\[data-draft-hero\]\)\s*\[data-fork-composer-prompt-row\]\[data-fork-composer-prompt-empty\]${live}\s*\[data-fork-composer-leading-actions\]\s*\{[^}]*display:\s*none`,
        "u",
      ),
    );
    expect(theme).not.toMatch(
      new RegExp(
        String.raw`\[data-fork-composer-prompt-row\]${live}\s*\[data-fork-composer-leading-actions\]\s*\{[^}]*display:\s*none`,
        "u",
      ),
    );
    expect(composer).toContain("const composerAttachAction = showComposerAttachAction ? (");
    expect(composer).toMatch(
      /data-fork-composer-action="attach"[\s\S]{0,200}?disabled=\{dictation\.blocksSubmission\}/u,
    );
    // Nothing animates: no tray, no slide or stagger, no separate blue mic.
    // The timeline appears in place, so no transition or delay keys on it.
    for (const gone of ["data-fork-dictation-tray", "aria-pressed", "trayState"]) {
      expect(control).not.toContain(gone);
    }
    expect(theme).not.toContain("data-fork-dictation-tray");
    expect(theme).not.toMatch(/\[data-fork-composer-action="dictate"\]\[aria-pressed/u);
    expect(theme).not.toContain("dictate-done");
    expect(theme).not.toMatch(/\[data-fork-dictation-timeline\][^{]*\{[^}]*transition/u);
    // When the send slot shows something else (an approval, a question, the
    // plan follow-up's Implement), a live recording settles instead of running
    // with no check on screen, and the keyboard cannot start one there.
    expect(composer).toMatch(
      /if \(!dictationControlsVisible\) settleDictationWithoutControls\(\)/u,
    );
    expect(composer).toMatch(/const dictationControlsVisible =[^;]*showPlanFollowUpPrompt/u);
    // A pending question takes the slot on every viewport (ComposerPrimaryActions
    // returns its pending-action branch before the send slot), so the gate is
    // the pending action itself, not the mobile-only answer strip: a desktop
    // recording must settle when a question arrives, not run on with no check.
    expect(composer).toMatch(/const dictationControlsVisible =[^;]*pendingPrimaryAction === null/u);
    expect(composer).not.toMatch(
      /const dictationControlsVisible =[^;]*showMobilePendingAnswerActions/u,
    );
    expect(composer).toMatch(/const dictationDisabled =[^;]*showPlanFollowUpPrompt/u);
    // The mic follows the editor's gate, not send's: an unassigned new-agent
    // draft (fork-new-agent-draft) blocks send until a project is chosen but
    // keeps the prompt editable, and dictation only writes into the prompt.
    expect(composer).toMatch(/const dictationDisabled =[^;]*promptLockedForProject;/u);
    expect(composer).not.toMatch(/const dictationDisabled =[^;]*projectSelectionRequired/u);
    // A send in flight keeps the spinner in the slot; the ghost mic beside
    // typed text and the keyboard must not start a session over it.
    expect(composer).toMatch(/const dictationDisabled =[^;]*isSendBusy/u);
    // The notices (download percentage, error popover) render beside the slot
    // whatever it shows, so a failed transcription is reported even after typed
    // text has put send back. The buttons render state only.
    expect(control).toContain("export function ForkDictationNotices");
    expect(control).toContain("if (!dictation.isAvailable) return null");
    expect(control).not.toContain("new VoiceInputController");
    // Microphone hover is "Dictate" on the frosted glass tooltip, a step
    // larger than the default chip. Recording/transcribing keep their labels.
    expect(control).toContain('variant="glass"');
    expect(control).toContain('data-fork-glass-tooltip=""');
    expect(control).toContain('{busy ? label : "Dictate"}');
    expect(control).not.toContain("Free and local");
    expect(theme).toMatch(
      /\[data-slot="tooltip-popup"\]\.dropdown-glass\[data-fork-glass-tooltip\]\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/u,
    );
    expect(theme).toMatch(
      /\[data-slot="tooltip-popup"\]\[data-fork-glass-tooltip\]\s*\{[^}]*font-size:\s*13px/u,
    );
    // Toggle is a tap of right Command, not a chord that would steal ⌘C.
    expect(controller).toContain('event.code === "MetaRight"');
    expect(controller).not.toContain('event.code === "Space"');
    expect(control).toContain("Dictate (Right Command)");
    expect(control).not.toContain("Ctrl+Shift+Space");
    // Fork IPC stays out of shared packages.
    expect(preload).toContain('"fork:voice-transcribe"');
    expect(preload).not.toContain("@t3tools/client-runtime");
    expect(runtimeExports).not.toMatch(/^\s*\w.*\bfork/imu);
    expect(packaging).toContain('to: "voice-input"');
    expect(packaging).toContain("NSMicrophoneUsageDescription");
  });
});
