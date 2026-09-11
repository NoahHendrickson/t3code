import type { VoiceRecorder } from "@t3tools/client-runtime/voice-input";

export function encodeVoiceWav(samples: Float32Array): Uint8Array {
  const wav = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(wav.buffer);
  const label = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  label(0, "RIFF");
  view.setUint32(4, wav.length - 8, true);
  label(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return wav;
}

/**
 * Recordings keyed by the object URL the shared controller passes around. The
 * bytes are read from the Blob directly: fetching a blob: URL fails under the
 * packaged app's CSP (connect-src has no blob:) and is not needed.
 */
const recordings = new Map<string, Blob>();

export function releaseRecording(uri: string): void {
  recordings.delete(uri);
  URL.revokeObjectURL(uri);
}

export async function recordingToWav(uri: string, signal: AbortSignal): Promise<Uint8Array | null> {
  const blob = recordings.get(uri);
  if (!blob) throw new Error("The recording is no longer available.");
  const bytes = await blob.arrayBuffer();
  signal.throwIfAborted();
  const decoder = new OfflineAudioContext(1, 1, 16_000);
  const decoded = await decoder.decodeAudioData(bytes);
  signal.throwIfAborted();
  const length = Math.min(16_000 * 300, Math.ceil(decoded.duration * 16_000));
  if (length === 0) return null;
  const context = new OfflineAudioContext(1, length, 16_000);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const audio = await context.startRendering();
  signal.throwIfAborted();
  const samples = audio.getChannelData(0);
  // Digital silence should never reach Whisper, which can invent text for empty audio.
  if (!samples.some((sample) => Math.abs(sample) > 0.0001)) return null;
  return encodeVoiceWav(samples);
}

export class BrowserVoiceRecorder implements VoiceRecorder {
  uri: string | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private stopped: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private meter: { context: AudioContext; timer: ReturnType<typeof setInterval> } | null = null;
  onLimit: () => void = () => {};
  onInterrupted: () => void = () => {};
  onError: (message: string) => void = () => {};
  /** RMS input level in 0..1, sampled at 20 Hz while recording. */
  onLevel: (level: number) => void = () => {};

  async prepareToRecordAsync(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (error) {
      this.onError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access for this app in system settings, then try again."
          : "Could not open your microphone. Check that it is connected and available.",
      );
      throw error;
    }
    this.uri = null;
    this.recorder = new MediaRecorder(this.stream);
    this.stream
      .getAudioTracks()
      .forEach((track) =>
        track.addEventListener("ended", () => this.onInterrupted(), { once: true }),
      );
  }

  record({ forDuration }: { forDuration: number }): void {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Microphone is not ready.");
    const chunks: Blob[] = [];
    this.stopped = new Promise((resolve) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          this.uri = URL.createObjectURL(blob);
          recordings.set(this.uri, blob);
          resolve();
        },
        { once: true },
      );
      recorder.addEventListener("error", () => this.onInterrupted());
    });
    recorder.start();
    this.timer = setTimeout(() => this.onLimit(), forDuration * 1000);
    if (this.stream) this.startMeter(this.stream);
  }

  async stop(): Promise<void> {
    clearTimeout(this.timer);
    this.stopMeter();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    await this.stopped;
  }

  release(): void {
    clearTimeout(this.timer);
    this.stopMeter();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  /** Best effort: the recording must not depend on the level meter. */
  private startMeter(stream: MediaStream): void {
    this.stopMeter();
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    try {
      context.createMediaStreamSource(stream).connect(analyser);
    } catch {
      void context.close().catch(() => {});
      return;
    }
    const samples = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      this.onLevel(Math.sqrt(sum / samples.length));
    }, 50);
    this.meter = { context, timer };
  }

  private stopMeter(): void {
    if (!this.meter) return;
    clearInterval(this.meter.timer);
    void this.meter.context.close().catch(() => {});
    this.meter = null;
  }
}
