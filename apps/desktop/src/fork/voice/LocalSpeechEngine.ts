// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";

/**
 * English-only quantized Small: dictated prompts are English, and the .en
 * models beat multilingual ones at the same size. q5_1 keeps Small's accuracy
 * at 181 MiB instead of 466.
 */
const DEFAULT_MODEL = {
  file: "ggml-small.en-q5_1.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin",
  bytes: 190098681,
  sha256: "bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30",
};
const MAX_AUDIO_BYTES = 44 + 16_000 * 2 * 300;

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
 * One whisper process at a time, app-wide: each run loads the 181 MiB model,
 * so concurrent runs would only fight for memory and GPU. Requests queue FIFO
 * behind that slot. `requestKey` identifies a request so that a cancel (from
 * its renderer, or from its window going away) aborts that request alone,
 * whether it is running or still waiting.
 */
export class LocalSpeechEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly requests = new Map<string, AbortController>();
  private modelVerified = false;

  private readonly options: {
    binary: string;
    cacheDirectory: string;
    fetch?: typeof fetch;
    run?: typeof runWhisper;
    model?: typeof DEFAULT_MODEL;
  };

  constructor(options: LocalSpeechEngine["options"]) {
    this.options = options;
  }

  private get model() {
    return this.options.model ?? DEFAULT_MODEL;
  }

  private get modelPath() {
    return NodePath.join(this.options.cacheDirectory, this.model.file);
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
      const model = this.modelPath;
      if (this.modelVerified) return;
      if (await this.verifyModel(model, signal)) {
        this.modelVerified = true;
        return;
      }
      progress(0);
      const specification = this.model;
      const temporary = `${model}.download`;
      try {
        const response = await (this.options.fetch ?? fetch)(specification.url, { signal });
        if (!response.ok || !response.body)
          throw new Error("Could not download the speech model. Check your connection and retry.");
        let received = 0;
        let lastPercent = -1;
        const hash = NodeCrypto.createHash("sha256");
        const meter = new NodeStream.Transform({
          transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length;
            if (received > specification.bytes) {
              callback(new Error("Speech model download has an invalid size."));
              return;
            }
            hash.update(chunk);
            const percent = Math.floor((received / specification.bytes) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              progress(percent);
            }
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
        this.modelVerified = true;
      } finally {
        await NodeFSP.rm(temporary, { force: true });
      }
    });
  }

  /**
   * The full hash runs once, when the model lands or when the sidecar stamp is
   * missing. Every later launch is a size check, so the first dictation of a
   * session does not stall on hashing 181 MiB.
   */
  private async verifyModel(path: string, signal: AbortSignal): Promise<boolean> {
    const info = await NodeFSP.stat(path).catch(() => null);
    const specification = this.model;
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
      if (!this.modelVerified) throw new Error("Prepare the speech model before recording.");
      const directory = await NodeFSP.mkdtemp(
        NodePath.join(this.options.cacheDirectory, "recording-"),
      );
      try {
        const audio = NodePath.join(directory, "audio.wav");
        const output = NodePath.join(directory, "transcript");
        await NodeFSP.writeFile(audio, wav, { mode: 0o600 });
        // English is fixed by the .en model; auto-detect would only add a pass
        // and misfire on short clips. Non-speech token suppression keeps a
        // noisy-but-silent clip from turning into "Thank you." or "[MUSIC]".
        await (this.options.run ?? runWhisper)(
          this.options.binary,
          [
            "--model",
            this.modelPath,
            "--file",
            audio,
            "--language",
            "en",
            "--threads",
            String(Math.min(8, Math.max(1, NodeOS.availableParallelism()))),
            "--flash-attn",
            "--suppress-nst",
            "--output-txt",
            "--output-file",
            output,
            "--no-prints",
          ],
          signal,
        );
        signal.throwIfAborted();
        return (await NodeFSP.readFile(`${output}.txt`, "utf8")).trim();
      } finally {
        await NodeFSP.rm(directory, { recursive: true, force: true });
      }
    });
  }
}
