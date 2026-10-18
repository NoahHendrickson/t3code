// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";
import { VOICE_RECORDING_LIMIT_SECONDS } from "@t3tools/client-runtime/voice-input";

type ModelSpecification = {
  readonly file: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
};

type SpeechModels = {
  readonly speech: ModelSpecification;
  readonly vad: ModelSpecification;
};

/**
 * Large v3 Turbo, quantized: far fewer misheard words than Small for a model
 * that still transcribes a long dictation in about a second on Apple Silicon
 * Metal. Silero VAD cuts non-speech out before Whisper sees it, so background
 * noise and pauses are not transcribed or turned into invented text.
 */
const DEFAULT_MODELS: SpeechModels = {
  speech: {
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    bytes: 574041195,
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
  },
  vad: {
    file: "ggml-silero-v6.2.0.bin",
    url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin",
    bytes: 885098,
    sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
  },
};

/**
 * Whisper reads the prompt as text that came before the recording, so it
 * biases spelling toward these terms. A bare list rather than a sentence, so
 * there is no transcript-like phrase for a short, unclear clip to echo.
 */
const VOCABULARY_PROMPT =
  "T3 Code, Claude, Codex, Cursor, Grok, Antigravity, OpenCode, TypeScript, React, " +
  "Electron, Vite, Effect, composer, sidebar, worktree, pull request, commit, CLI, API.";
// Bound by the same limit that arms the recorder, so raising it upstream can
// never leave a full-length recording rejected here after the fact.
const MAX_AUDIO_BYTES = 44 + 16_000 * 2 * VOICE_RECORDING_LIMIT_SECONDS;

/** Only accept the bounded mono PCM format emitted by the recorder. */
export function validateVoiceWav(wav: Uint8Array): void {
  const data = Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength);
  if (
    data.length < 46 ||
    data.length > MAX_AUDIO_BYTES ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 16) !== "WAVEfmt " ||
    data.readUInt32LE(4) !== data.length - 8 ||
    data.readUInt32LE(16) !== 16 ||
    data.readUInt16LE(20) !== 1 ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== 16_000 ||
    data.readUInt32LE(28) !== 32_000 ||
    data.readUInt16LE(32) !== 2 ||
    data.readUInt16LE(34) !== 16 ||
    data.toString("ascii", 36, 40) !== "data" ||
    data.readUInt32LE(40) !== data.length - 44 ||
    data.length % 2 !== 0
  )
    throw new Error("Invalid voice recording. Record up to five minutes and try again.");
}

export function runWhisper(binary: string, args: string[], signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(binary, args, {
      // Metal residency sets only pay off for a process that runs many graphs;
      // here their 500 ms heartbeat thread just holds exit for up to half a second.
      env: { ...process.env, GGML_METAL_NO_RESIDENCY: "1" },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    // Kill only the process we spawned. Wait for close before releasing its files or slot.
    const abort = () => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    let error: Error | undefined;
    let diagnostic = "";
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-2048);
    });
    child.on("error", (cause) => {
      error = cause;
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new Error("Voice input cancelled."));
      else if (error)
        reject(new Error("Could not start the local speech engine.", { cause: error }));
      else if (code !== 0)
        reject(
          new Error("Local transcription failed. Please record again.", {
            cause: new Error(`whisper-cli exited ${code}: ${diagnostic}`),
          }),
        );
      else resolve();
    });
  });
}

/**
 * One whisper process at a time, app-wide: each run loads the 547 MiB model,
 * so concurrent runs would only fight for memory and GPU. Requests queue FIFO
 * behind that slot. `requestKey` identifies a request so that a cancel (from
 * its renderer, or from its window going away) aborts that request alone,
 * whether it is running or still waiting.
 */
export class LocalSpeechEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly requests = new Map<string, AbortController>();
  private swept = false;

  private readonly options: {
    binary: string;
    cacheDirectory: string;
    fetch?: typeof fetch;
    run?: typeof runWhisper;
    models?: SpeechModels;
  };

  constructor(options: LocalSpeechEngine["options"]) {
    this.options = options;
  }

  private get models() {
    return this.options.models ?? DEFAULT_MODELS;
  }

  private modelPath(specification: ModelSpecification) {
    return NodePath.join(this.options.cacheDirectory, specification.file);
  }

  /** Checked together, so hashing one unstamped model does not hold up the other. */
  private async missingModels(signal: AbortSignal): Promise<ModelSpecification[]> {
    const models = Object.values(this.models);
    const verified = await Promise.all(models.map((model) => this.verifyModel(model, signal)));
    return models.filter((_, index) => !verified[index]);
  }

  cancel(requestKey: string): void {
    this.requests.get(requestKey)?.abort();
  }

  dispose(): void {
    for (const abort of this.requests.values()) abort.abort();
  }

  private operate<T>(
    requestKey: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const abort = new AbortController();
    this.requests.set(requestKey, abort);
    const run = this.queue.then(async () => {
      try {
        if (abort.signal.aborted) throw new Error("Voice input was cancelled.");
        return await operation(abort.signal);
      } finally {
        if (this.requests.get(requestKey) === abort) this.requests.delete(requestKey);
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  prepare(requestKey: string, progress: (percent: number) => void): Promise<void> {
    return this.operate(requestKey, async (signal) => {
      try {
        await NodeFSP.access(this.options.binary);
      } catch {
        throw new Error(
          "The local speech engine is missing. Rebuild or reinstall the desktop app.",
        );
      }
      await NodeFSP.mkdir(this.options.cacheDirectory, { recursive: true });
      await this.sweepStaleFiles();
      // Re-checked every session (a stat plus the sidecar stamp, so it is
      // cheap): a model deleted to reclaim space must download again, not
      // fail every later dictation until the app restarts.
      const missing = await this.missingModels(signal);
      if (missing.length === 0) return;
      // One percentage across every missing file, so the label never restarts.
      const total = missing.reduce((sum, specification) => sum + specification.bytes, 0);
      let completed = 0;
      let lastPercent = -1;
      const report = (received: number) => {
        const percent = Math.floor(((completed + received) / total) * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        progress(percent);
      };
      report(0);
      for (const specification of missing) {
        await this.download(specification, signal, report);
        completed += specification.bytes;
      }
    });
  }

  private async download(
    specification: ModelSpecification,
    signal: AbortSignal,
    report: (received: number) => void,
  ): Promise<void> {
    const model = this.modelPath(specification);
    const temporary = `${model}.download`;
    try {
      const response = await (this.options.fetch ?? fetch)(specification.url, { signal });
      if (!response.ok || !response.body)
        throw new Error("Could not download the speech model. Check your connection and retry.");
      let received = 0;
      const hash = NodeCrypto.createHash("sha256");
      const meter = new NodeStream.Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > specification.bytes) {
            callback(new Error("Speech model download has an invalid size."));
            return;
          }
          hash.update(chunk);
          report(received);
          callback(null, chunk);
        },
      });
      const reader = response.body.getReader();
      async function* chunks() {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      await NodeStreamPromises.pipeline(
        NodeStream.Readable.from(chunks()),
        meter,
        NodeFS.createWriteStream(temporary, { mode: 0o600 }),
        { signal },
      );
      if (received !== specification.bytes || hash.digest("hex") !== specification.sha256)
        throw new Error("Speech model download was incomplete or damaged. Please retry.");
      signal.throwIfAborted();
      await NodeFSP.rename(temporary, model);
      await NodeFSP.writeFile(`${model}.sha256`, specification.sha256, { mode: 0o600 });
    } finally {
      await NodeFSP.rm(temporary, { force: true });
    }
  }

  /**
   * The cache holds only the current models and their stamps. Anything else is
   * a recording scratch directory a crash or force-quit left behind, or a model
   * a newer build replaced; the first session of each launch removes it.
   */
  private async sweepStaleFiles(): Promise<void> {
    if (this.swept) return;
    this.swept = true;
    const keep = new Set(
      Object.values(this.models).flatMap(({ file }) => [file, `${file}.sha256`]),
    );
    const entries = await NodeFSP.readdir(this.options.cacheDirectory).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => !keep.has(entry))
        .map((entry) =>
          NodeFSP.rm(NodePath.join(this.options.cacheDirectory, entry), {
            recursive: true,
            force: true,
          }),
        ),
    );
  }

  /**
   * The full hash runs once, when the model lands or when the sidecar stamp is
   * missing. Every later launch is a size check, so the first dictation of a
   * session does not stall on hashing the model.
   */
  private async verifyModel(
    specification: ModelSpecification,
    signal: AbortSignal,
  ): Promise<boolean> {
    const path = this.modelPath(specification);
    const info = await NodeFSP.stat(path).catch(() => null);
    if (info?.size !== specification.bytes) return false;
    const stamp = `${path}.sha256`;
    if ((await NodeFSP.readFile(stamp, "utf8").catch(() => null)) === specification.sha256)
      return true;
    const hash = NodeCrypto.createHash("sha256");
    for await (const chunk of NodeFS.createReadStream(path, { signal })) hash.update(chunk);
    if (hash.digest("hex") !== specification.sha256) return false;
    await NodeFSP.writeFile(stamp, specification.sha256, { mode: 0o600 });
    return true;
  }

  transcribe(requestKey: string, wav: Uint8Array): Promise<string> {
    return this.operate(requestKey, async (signal) => {
      validateVoiceWav(wav);
      if ((await this.missingModels(signal)).length > 0)
        throw new Error("The speech model is missing. Start dictation again to download it.");
      const { speech, vad } = this.models;
      const directory = await NodeFSP.mkdtemp(
        NodePath.join(this.options.cacheDirectory, "recording-"),
      );
      try {
        const audio = NodePath.join(directory, "audio.wav");
        const output = NodePath.join(directory, "transcript");
        await NodeFSP.writeFile(audio, wav, { mode: 0o600 });
        // English is fixed; auto-detect would only add a pass and misfire on
        // short clips. Non-speech token suppression keeps a noisy-but-silent
        // clip from turning into "Thank you." or "[MUSIC]". The prompt carries
        // into every 30-second window so the vocabulary holds for long takes.
        await (this.options.run ?? runWhisper)(
          this.options.binary,
          [
            "--model",
            this.modelPath(speech),
            "--file",
            audio,
            "--language",
            "en",
            "--threads",
            String(Math.min(8, Math.max(1, NodeOS.availableParallelism()))),
            "--flash-attn",
            "--suppress-nst",
            "--vad",
            "--vad-model",
            this.modelPath(vad),
            "--prompt",
            VOCABULARY_PROMPT,
            "--carry-initial-prompt",
            "--output-txt",
            "--output-file",
            output,
            "--no-prints",
          ],
          signal,
        );
        signal.throwIfAborted();
        // The text file holds one line per Whisper segment, and a segment ends
        // at a pause, not a sentence; dictation is one paragraph.
        return (await NodeFSP.readFile(`${output}.txt`, "utf8")).replace(/\s+/g, " ").trim();
      } finally {
        await NodeFSP.rm(directory, { recursive: true, force: true });
      }
    });
  }
}
