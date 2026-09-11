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
const model = {
  file: "ggml-test.bin",
  url: "https://example.test/model",
  bytes: 3,
  sha256: NodeCrypto.createHash("sha256").update(modelBytes).digest("hex"),
};
const installedFiles = [model.file, `${model.file}.sha256`];
async function fixture(options: Partial<ConstructorParameters<typeof LocalSpeechEngine>[0]> = {}) {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "voice-engine-test-"));
  directories.push(directory);
  const fetchModel = vi.fn<typeof fetch>(async () => new Response(modelBytes));
  const engine = new LocalSpeechEngine({
    binary: process.execPath,
    cacheDirectory: directory,
    model,
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
    await engine.prepare("one", () => {});
    await engine.prepare("two", () => {});
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, model.file)))).toEqual(
      modelBytes,
    );
    const offline = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    const restarted = new LocalSpeechEngine({
      binary: process.execPath,
      cacheDirectory: directory,
      model,
      fetch: offline,
    });
    await restarted.prepare("three", () => {});
    expect(offline).not.toHaveBeenCalled();
  });

  it("hashes an unstamped model once and trusts the stamp afterwards", async () => {
    const { directory } = await fixture();
    await NodeFSP.writeFile(NodePath.join(directory, model.file), modelBytes);
    const engine = new LocalSpeechEngine({
      binary: process.execPath,
      cacheDirectory: directory,
      model,
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
      model,
      fetch: async () => new Response(modelBytes),
    });
    await restarted.prepare("two", () => {});
    expect(new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, model.file)))).toEqual(
      modelBytes,
    );
  });

  it("rejects damaged downloads, removes partial files, and allows retry", async () => {
    const fetchModel = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 2, 3])))
      .mockResolvedValueOnce(new Response(modelBytes));
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
        if (fetches > 1) return new Response(modelBytes);
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
    expect(fetches).toBe(2);
  });

  it("reads only the helper's transcript output and deletes temporary recordings", async () => {
    const run = vi.fn<typeof runWhisper>(async (_binary, args) => {
      const audio = args[args.indexOf("--file") + 1]!;
      expect(await NodeFSP.readFile(audio)).toEqual(wav());
      const output = args[args.indexOf("--output-file") + 1]!;
      await NodeFSP.writeFile(`${output}.txt`, " Add local dictation. \n");
    });
    const { engine, directory } = await fixture({ run });
    await engine.prepare("owner", () => {});
    expect(await engine.transcribe("owner", wav())).toBe("Add local dictation.");
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
