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
  url: "https://example.test/model",
  bytes: 3,
  sha256: NodeCrypto.createHash("sha256").update(modelBytes).digest("hex"),
};
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
    expect(
      new Uint8Array(await NodeFSP.readFile(NodePath.join(directory, "ggml-small.bin"))),
    ).toEqual(modelBytes);
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

  it("rejects damaged downloads, removes partial files, and allows retry", async () => {
    const fetchModel = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 2, 3])))
      .mockResolvedValueOnce(new Response(modelBytes));
    const { engine, directory } = await fixture({ fetch: fetchModel });
    await expect(engine.prepare("one", () => {})).rejects.toThrow("damaged");
    expect(await NodeFSP.readdir(directory)).toEqual([]);
    await engine.prepare("retry", () => {});
    expect(await NodeFSP.readdir(directory)).toEqual(["ggml-small.bin"]);
  });

  it("cancels a download only for its owner and holds the slot until it settles", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const finished = Promise.withResolvers<Response>();
    const { engine } = await fixture({
      fetch: async (_url, options) => {
        started.resolve(options!.signal!);
        return finished.promise;
      },
    });
    const preparation = engine.prepare("owner", () => {});
    const rejected = expect(preparation).rejects.toThrow();
    const signal = await started.promise;
    engine.cancel("other");
    expect(signal.aborted).toBe(false);
    engine.cancel("owner");
    expect(signal.aborted).toBe(true);
    await expect(engine.prepare("next", () => {})).rejects.toThrow("finishing");
    finished.resolve(new Response(modelBytes));
    await rejected;
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
    expect(await NodeFSP.readdir(directory)).toEqual(["ggml-small.bin"]);
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
    engine.cancel("owner");
    expect(signal.aborted).toBe(true);
    await expect(engine.prepare("next", () => {})).rejects.toThrow("finishing");
    stopped.resolve();
    await rejected;
    expect(await NodeFSP.readdir(directory)).toEqual(["ggml-small.bin"]);
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
