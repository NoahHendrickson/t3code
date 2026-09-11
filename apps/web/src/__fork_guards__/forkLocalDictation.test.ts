// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { VoiceInputController } from "@t3tools/client-runtime/voice-input";
import { encodeVoiceWav } from "../custom/voice/BrowserVoiceRecorder";

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
      deleteRecording: () => {},
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

  it("retains the native bridge, packaged helper, and composer submission gate", () => {
    const composer = read("../components/chat/ChatComposer.tsx");
    const control = read("../custom/voice/ForkDictationControl.tsx");
    const preload = read("../../../desktop/src/preload.ts");
    const packaging = read("../../../../scripts/build-desktop-artifact.ts");
    expect(composer).toContain("<ForkDictationControl");
    expect(composer).toContain("if (voiceInputBusyRef.current)");
    expect(control).toContain("if (!bridge) return null");
    expect(control).toContain("instance.cancel()");
    expect(preload).toContain('"fork:voice-transcribe"');
    expect(packaging).toContain('to: "voice-input"');
    expect(packaging).toContain("NSMicrophoneUsageDescription");
  });
});
