// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LocalSpeechEngine, runWhisper, validateVoiceWav } from "./LocalSpeechEngine.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => NodeFSP.rm(directory, { recursive: true, force: true })),
  );
});
const modelBytes = new Uint8Array([1, 2, 3]);
const vadBytes = new Uint8Array([4, 5]);
const model = {
  file: "ggml-test.bin",
  url: "https://example.test/model",
  bytes: 3,
  sha256: NodeCrypto.createHash("sha256").update(modelBytes).digest("hex"),
};
const vad = {
  file: "ggml-vad-test.bin",
  url: "https://example.test/vad",
  bytes: 2,
  sha256: NodeCrypto.createHash("sha256").update(vadBytes).digest("hex"),
};
const models = { speech: model, vad };
const installedFiles = [model.file, `${model.file}.sha256`, vad.file, `${vad.file}.sha256`].sort();
const serve = async (url: string | URL | Request) =>
  new Response(String(url) === vad.url ? vadBytes : modelBytes);
async function fixture(options: Partial<ConstructorParameters<typeof LocalSpeechEngine>[0]> = {}) {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "voice-engine-test-"));
  directories.push(directory);
  const fetchModel = vi.fn<typeof fetch>(serve);
  const engine = new LocalSpeechEngine({
    binary: process.execPath,
    cacheDirectory: directory,
    models,
    fetch: fetchModel,
    ...options,
  });
  return { directory, fetchModel, engine };
}
function wav() {
  const bytes = Buffer.alloc(46);
  bytes.write("RIFF");
  bytes.writeUInt32LE(38, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(2, 40);
  return bytes;
}

describe("local speech engine", () => {
  it("downloads once, validates integrity, and reuses the model across launches", async () => {
    const { engine, fetchModel, directory } = await fixture();
    const progress: number[] = [];
    await engine.prepare("one", (percent) => progress.push(percent));
    await engine.prepare("two", () => {});
    expect(fetchModel).toHaveBeenCalledTimes(2);
    // One scale across both files: it never restarts and ends at 100.
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(100);
    expect(new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, vad.file)))).toEqual(
      vadBytes,
    );
    expect(new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, model.file)))).toEqual(
      modelBytes,
    );
    const offline = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    const restarted = new LocalSpeechEngine({
      binary: process.execPath,
      cacheDirectory: directory,
      models,
      fetch: offline,
    });
    await restarted.prepare("three", () => {});
    expect(offline).not.toHaveBeenCalled();
  });

  it("hashes an unstamped model once and trusts the stamp afterwards", async () => {
    const { directory } = await fixture();
    await NodeFSP.writeFile(NodePath.join(directory, model.file), modelBytes);
    await NodeFSP.writeFile(NodePath.join(directory, vad.file), vadBytes);
    const engine = new LocalSpeechEngine({
      binary: process.execPath,
      cacheDirectory: directory,
      models,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    await engine.prepare("one", () => {});
    expect(await NodeFSP.readFile(NodePath.join(directory, `${model.file}.sha256`), "utf8")).toBe(
      model.sha256,
    );
    // A same-size file with a wrong stamp is not trusted.
    await NodeFSP.writeFile(NodePath.join(directory, `${model.file}.sha256`), "stale");
    await NodeFSP.writeFile(NodePath.join(directory, model.file), new Uint8Array([9, 2, 3]));
    const restarted = new LocalSpeechEngine({
      binary: process.execPath,
      cacheDirectory: directory,
      models,
      fetch: serve,
    });
    await restarted.prepare("two", () => {});
    expect(new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, model.file)))).toEqual(
      modelBytes,
    );
  });

  it("downloads again when the model was deleted after a session verified it", async () => {
    const { engine, fetchModel, directory } = await fixture();
    await engine.prepare("one", () => {});
    await NodeFSP.rm(NodePath.join(directory, model.file));
    await expect(engine.transcribe("one", wav())).rejects.toThrow("missing");
    await engine.prepare("two", () => {});
    expect(fetchModel).toHaveBeenCalledTimes(3);
    expect((await NodeFSP.readdir(directory)).sort()).toEqual(installedFiles);
  });

  it("clears crash leftovers and models a newer build replaced", async () => {
    const { engine, directory } = await fixture();
    const stale = NodePath.join(directory, "recording-stale");
    await NodeFSP.mkdir(stale, { recursive: true });
    await NodeFSP.writeFile(NodePath.join(stale, "audio.wav"), wav());
    await NodeFSP.writeFile(NodePath.join(directory, "ggml-small.en-q5_1.bin"), modelBytes);
    await NodeFSP.writeFile(NodePath.join(directory, "ggml-small.en-q5_1.bin.sha256"), "old");
    await NodeFSP.writeFile(NodePath.join(directory, `${model.file}.download`), modelBytes);
    await engine.prepare("one", () => {});
    expect((await NodeFSP.readdir(directory)).sort()).toEqual(installedFiles);
  });

  it("rejects damaged downloads, removes partial files, and allows retry", async () => {
    const fetchModel = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 2, 3])))
      .mockImplementation(serve);
    const { engine, directory } = await fixture({ fetch: fetchModel });
    await expect(engine.prepare("one", () => {})).rejects.toThrow("damaged");
    expect(await NodeFSP.readdir(directory)).toEqual([]);
    await engine.prepare("retry", () => {});
    expect((await NodeFSP.readdir(directory)).sort()).toEqual(installedFiles);
  });

  it("queues requests behind the single whisper slot and cancels each by its own key", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const finished = Promise.withResolvers<Response>();
    let fetches = 0;
    const { engine } = await fixture({
      fetch: async (_url, options) => {
        fetches += 1;
        if (fetches > 1) return serve(_url);
        started.resolve(options!.signal!);
        return finished.promise;
      },
    });
    const first = engine.prepare("window-1:a", () => {});
    const rejected = expect(first).rejects.toThrow();
    const signal = await started.promise;
    // Later requests wait their turn; a waiting one can be dropped without
    // disturbing the running one.
    const second = engine.prepare("window-2:b", () => {});
    const third = engine.prepare("window-2:c", () => {});
    engine.cancel("window-2:c");
    expect(signal.aborted).toBe(false);
    engine.cancel("window-2:b");
    expect(signal.aborted).toBe(false);
    engine.cancel("window-1:a");
    expect(signal.aborted).toBe(true);
    finished.resolve(new Response(modelBytes));
    await rejected;
    await expect(second).rejects.toThrow("cancelled");
    await expect(third).rejects.toThrow("cancelled");
    // The queue keeps serving after cancellations.
    await expect(engine.prepare("window-2:d", () => {})).resolves.toBeUndefined();
    expect(fetches).toBe(3);
  });

  it("joins the helper's per-segment lines into one paragraph and deletes recordings", async () => {
    const run = vi.fn<typeof runWhisper>(async (_binary, args) => {
      const audio = args[args.indexOf("--file") + 1]!;
      expect(await NodeFSP.readFile(audio)).toEqual(wav());
      const output = args[args.indexOf("--output-file") + 1]!;
      // whisper-cli breaks lines at pauses, mid-sentence, with a leading space.
      await NodeFSP.writeFile(`${output}.txt`, " Add local dictation\n and ship it. \n");
    });
    const { engine, directory } = await fixture({ run });
    await engine.prepare("owner", () => {});
    expect(await engine.transcribe("owner", wav())).toBe("Add local dictation and ship it.");
    expect((await NodeFSP.readdir(directory)).sort()).toEqual(installedFiles);
  });

  it("cancels inference and deletes audio even when the helper fails", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const stopped = Promise.withResolvers<void>();
    const { engine, directory } = await fixture({
      run: async (_binary, _args, signal) => {
        started.resolve(signal);
        await stopped.promise;
        signal.throwIfAborted();
      },
    });
    await engine.prepare("owner", () => {});
    const inference = engine.transcribe("owner", wav());
    const rejected = expect(inference).rejects.toThrow();
    const signal = await started.promise;
    const next = engine.prepare("next", () => {});
    engine.cancel("owner");
    expect(signal.aborted).toBe(true);
    stopped.resolve();
    await rejected;
    // The queued request runs once the cancelled inference has settled.
    await expect(next).resolves.toBeUndefined();
    expect((await NodeFSP.readdir(directory)).sort()).toEqual(installedFiles);
  });

  it("rejects malformed or oversized audio before inference", () => {
    expect(() => validateVoiceWav(wav())).not.toThrow();
    expect(() => validateVoiceWav(new Uint8Array(4))).toThrow("Invalid");
    const stereo = wav();
    stereo.writeUInt16LE(2, 22);
    expect(() => validateVoiceWav(stereo)).toThrow("Invalid");
    expect(() => validateVoiceWav(new Uint8Array(10_000_000))).toThrow("Invalid");
  });

  it("waits for an owned child to exit when cancelled", async () => {
    const abort = new AbortController();
    const result = runWhisper(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      abort.signal,
    );
    const rejected = expect(result).rejects.toThrow("cancelled");
    abort.abort();
    await rejected;
  });
});
