import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { VoiceInputController } from "@t3tools/client-runtime/voice-input";
import { BrowserVoiceRecorder, recordingToWav, releaseRecording } from "./BrowserVoiceRecorder";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

class FakeMediaRecorder extends EventTarget {
  state = "inactive";
  mimeType = "audio/webm";
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob(["audio"]) }));
      this.dispatchEvent(new Event("stop"));
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const recorder = new BrowserVoiceRecorder();
  const released = deferred<void>();
  const transcribe = vi.fn(async () => "spoken words");
  const commit = vi.fn();
  const controller = new VoiceInputController({
    recorder,
    getTranscriber: () => ({ prepare: async () => ({ locale: "en", transcribe }) }),
    requestPermission: async () => ({ granted: true, canAskAgain: true }),
    configureRecording: async () => {},
    releaseRecording: async () => {
      recorder.release();
      released.resolve();
    },
    deleteRecording: releaseRecording,
    readDraft: () => ({
      ownerKey: "thread",
      text: "",
      selection: { start: 0, end: 0 },
      revision: 0,
    }),
    commitDraft: commit,
    onStateChange: () => {},
  });
  recorder.onLimit = () => {
    void controller.stop();
  };
  recorder.onInterrupted = (message) => {
    void controller.interruptRecording(message);
  };
  return {
    recorder,
    controller,
    track,
    stream,
    getUserMedia,
    released,
    transcribe,
    commit,
    revoke,
  };
}

describe("desktop microphone lifecycle", () => {
  it("stops the microphone before transcription and revokes the recording after insertion", async () => {
    const f = fixture();
    f.transcribe.mockImplementation(async () => {
      expect(f.track.stop).toHaveBeenCalledOnce();
      return "spoken words";
    });
    await f.controller.start();
    expect(f.controller.currentState.phase).toBe("recording");
    await f.controller.stop();
    expect(f.commit).toHaveBeenCalledWith("spoken words", { start: 12, end: 12 });
    expect(f.revoke).toHaveBeenCalledWith(f.recorder.uri);
    // The registry entry goes with the URL, or every dictation would pin its Blob.
    await expect(recordingToWav(f.recorder.uri!, new AbortController().signal)).rejects.toThrow(
      "no longer available",
    );
  });

  it("cancels recording without transcribing or inserting it", async () => {
    const f = fixture();
    await f.controller.start();
    f.controller.cancel();
    await f.released.promise;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.revoke).toHaveBeenCalledWith(f.recorder.uri);
    expect(f.transcribe).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("releases a microphone granted after cancellation without starting to record", async () => {
    const f = fixture();
    const requested = deferred<void>();
    const permission = deferred<typeof f.stream>();
    f.getUserMedia.mockImplementation(() => {
      requested.resolve();
      return permission.promise;
    });
    const starting = f.controller.start();
    await requested.promise;
    f.controller.cancel();
    permission.resolve(f.stream);
    await starting;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.recorder.uri).toBeNull();
    expect(f.controller.currentState.phase).toBe("idle");
  });

  it("discards interrupted recordings when the microphone disconnects", async () => {
    const f = fixture();
    await f.controller.start();
    f.track.dispatchEvent(new Event("ended"));
    await f.released.promise;
    expect(f.controller.currentState.phase).toBe("error");
    expect(f.transcribe).not.toHaveBeenCalled();
    expect(f.track.stop).toHaveBeenCalledOnce();
  });

  it("explains denied permission and can start again after permission is restored", async () => {
    const f = fixture();
    const errors = vi.fn();
    f.recorder.onError = errors;
    f.getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    await f.controller.start();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("system settings"));
    await f.controller.start();
    expect(f.controller.currentState.phase).toBe("recording");
    await f.controller.stop();
  });
});
