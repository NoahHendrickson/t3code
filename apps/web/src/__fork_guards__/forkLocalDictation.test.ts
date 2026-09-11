// @effect-diagnostics nodeBuiltinImport:off
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

  it("keeps the composer owning the session, with the bridge and helper wired", () => {
    const composer = read("../components/chat/ChatComposer.tsx");
    const control = read("../custom/voice/ForkDictationControl.tsx");
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
    // A hidden action cluster settles the recording instead of orphaning it.
    expect(composer).toMatch(
      /if \(!dictationControlsVisible\) settleDictationWithoutControls\(\)/u,
    );
    // The mic, X and check share the attach/send box and hover from theme.custom.css.
    for (const action of ["dictate", "dictate-cancel"]) {
      expect(control).toContain(`data-fork-composer-action="${action}"`);
      expect(theme).toContain(`[data-fork-composer-action="${action}"]`);
    }
    // The button renders state only.
    expect(control).toContain("if (!dictation.isAvailable) return null");
    expect(control).not.toContain("new VoiceInputController");
    // Fork IPC stays out of shared packages.
    expect(preload).toContain('"fork:voice-transcribe"');
    expect(preload).not.toContain("@t3tools/client-runtime");
    expect(runtimeExports).not.toMatch(/^\s*\w.*\bfork/imu);
    expect(packaging).toContain('to: "voice-input"');
    expect(packaging).toContain("NSMicrophoneUsageDescription");
  });
});
