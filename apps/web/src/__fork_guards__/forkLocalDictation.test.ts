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
    expect(composer).toContain("<ForkDictationControl dictation={dictation}");
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
    // While dictating in a started thread the cluster drops under the prompt
    // at full width, so the timeline spans the composer and the text keeps
    // its lines.
    expect(composer).toContain(
      'data-fork-composer-dictating={dictation.blocksSubmission ? "true" : undefined}',
    );
    expect(theme).toMatch(
      /\[data-fork-composer-dictating="true"\]\s*\[data-fork-composer-prompt-row\]\s*\{[^}]*flex-direction:\s*column/u,
    );
    expect(theme).toMatch(
      /\[data-fork-composer-dictating="true"\]\s*\[data-chat-composer-actions="right"\]\s*\{[^}]*width:\s*100%/u,
    );
    // A hidden action cluster settles the recording instead of orphaning it.
    expect(composer).toMatch(
      /if \(!dictationControlsVisible\) settleDictationWithoutControls\(\)/u,
    );
    // The mic, X and check share the attach/send box and hover from theme.custom.css.
    for (const action of ["dictate", "dictate-cancel", "dictate-done"]) {
      expect(control).toContain(`data-fork-composer-action="${action}"`);
      expect(theme).toContain(`[data-fork-composer-action="${action}"]`);
    }
    // The mic stays a mic and slides left as a tray opens beside it with the
    // level timeline, X and check: the tray is always mounted (inert while
    // shut) and theme.custom.css transitions its flex-grow 0 → 1, so it fills
    // the row where there is free space (the draft box) and its content
    // width where there is none.
    expect(control).toContain('data-fork-dictation-tray={busy ? "open" : "closed"} inert={!busy}');
    expect(control).toMatch(/<MicrophoneIcon \/>\s*<\/TooltipTrigger>/u);
    // The wrapper never changes size on its own; only the tray animates, so
    // the mic's slide is continuous in both directions.
    expect(control).toContain('className="relative flex min-w-0 flex-1 items-center justify-end"');
    expect(control).not.toContain('busy ? "min-w-0 flex-1"');
    expect(theme).toMatch(
      /\[data-fork-dictation-tray\]\s*\{[^}]*flex:\s*0 1 0px;[^}]*transition:\s*flex-grow/u,
    );
    expect(theme).toMatch(/\[data-fork-dictation-tray="open"\]\s*\{[^}]*flex-grow:\s*1/u);
    // The timeline is a canvas that fills the tray: dots for silence, bars
    // for speech, newest at the right edge.
    expect(control).toContain("<canvas");
    expect(control).toContain('className="block h-6 flex-1"');
    // The tray reports no content width of its own; its animated min-width
    // stands in, so a content-sized cluster shrinks in step with the collapse
    // instead of snapping once flex-grow hits zero.
    expect(theme).toMatch(
      /\[data-fork-dictation-tray\]\s*\{[^}]*contain:\s*inline-size;[^}]*transition:[^}]*min-width 240ms/u,
    );
    expect(theme).toMatch(
      /\[data-fork-dictation-tray="open"\]\s*\{[^}]*min-width:\s*var\(--fork-dictation-tray-min\)/u,
    );
    expect(control).toContain("new ResizeObserver(paint)");
    // Bars, X and check stagger in behind the slide, in that order.
    for (const item of ["bars", "cancel", "done"]) {
      expect(control).toContain(`data-fork-dictation-tray-item="${item}"`);
    }
    const delayOf = (item: string) =>
      Number(
        theme.match(
          new RegExp(
            `\\[data-fork-dictation-tray="open"\\]\\s*\\[data-fork-dictation-tray-item="${item}"\\]\\s*\\{[^}]*transition-delay:\\s*(\\d+)ms`,
            "u",
          ),
        )?.[1],
      );
    expect(delayOf("bars")).toBeLessThan(delayOf("cancel"));
    expect(delayOf("cancel")).toBeLessThan(delayOf("done"));
    // While live, the mic is pressed on a blue chip with a glowing blue glyph;
    // the timeline is white like the X and check beside it.
    expect(control).toContain("aria-pressed={busy}");
    expect(control).toContain('const BAR_COLOR = "#ffffff"');
    expect(theme).toMatch(
      /\[data-fork-composer-action="dictate"\]\[aria-pressed="true"\]\s*\{[^}]*background:\s*rgb\(24 124 255 \/ 16%\)/u,
    );
    expect(theme).toMatch(
      /\[data-fork-composer-action="dictate"\]\[aria-pressed="true"\]\s*svg\s*\{[^}]*drop-shadow/u,
    );
    // The button renders state only.
    expect(control).toContain("if (!dictation.isAvailable) return null");
    expect(control).not.toContain("new VoiceInputController");
    // Idle microphone hover is "Dictate" on the frosted glass tooltip, a
    // step larger than the default chip. Recording/transcribing keep labels.
    expect(control).toContain('variant="glass"');
    expect(control).toContain('data-fork-glass-tooltip=""');
    expect(control).toContain('{recording || transcribing ? label : "Dictate"}');
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
