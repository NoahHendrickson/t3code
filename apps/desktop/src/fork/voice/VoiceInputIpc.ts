// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DesktopEnvironment } from "../../app/DesktopEnvironment.ts";
import * as DesktopIpc from "../../ipc/DesktopIpc.ts";
import { LocalSpeechEngine } from "./LocalSpeechEngine.ts";

/**
 * Fork-owned, device-local IPC. Audio never crosses an environment connection.
 * Preload wraps these channels into `forkDesktopBridge.voiceInput`; the
 * renderer mirrors the shape in `apps/web/src/custom/voice/forkVoiceInputBridge.ts`.
 * Neither side goes through `packages/contracts` or `client-runtime`.
 */
export type VoiceInputIpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

const Request = Schema.Struct({ requestId: Schema.String });
const Recording = Schema.Struct({ requestId: Schema.String, wav: Schema.Uint8Array });
const decodeRequest = Schema.decodeUnknownEffect(Request);
const decodeRecording = Schema.decodeUnknownEffect(Recording);
class VoiceInputError extends Schema.TaggedError<VoiceInputError>()("VoiceInputError", {
  message: Schema.String,
}) {}
const isVoiceInputError = Schema.is(VoiceInputError);

const respond = <T>() =>
  Effect.match({
    onSuccess: (value: T): VoiceInputIpcResult<T> => ({ ok: true, value }),
    onFailure: (error: unknown): VoiceInputIpcResult<T> => ({
      ok: false,
      error: isVoiceInputError(error) ? error.message : "Invalid voice input request.",
    }),
  });

export const installVoiceInputIpc = Effect.fn("desktop.fork.installVoiceInput")(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  const environment = yield* DesktopEnvironment;
  const engine = new LocalSpeechEngine({
    binary: environment.isPackaged
      ? NodePath.join(environment.resourcesPath, "voice-input", "whisper-cli")
      : NodePath.join(
          environment.rootDir,
          "native/voice-input/build",
          `${environment.platform}-${environment.processArch}`,
          "whisper-cli",
        ),
    cacheDirectory: NodePath.join(Electron.app.getPath("userData"), "voice-input"),
  });
  yield* Effect.addFinalizer(() => Effect.sync(() => engine.dispose()));

  // Engine work is owned by the window that asked for it, and dies with it.
  const withWindow = <T>(
    event: DesktopIpc.DesktopIpcInvokeEvent | undefined,
    requestId: string,
    operation: (owner: string, sender: Electron.WebContents) => Promise<T>,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const sender = event ? Electron.webContents.fromId(event.sender.id) : undefined;
        if (!sender || sender.getType() !== "window")
          throw new Error("Voice input requires a desktop window.");
        const owner = `${sender.id}:${requestId}`;
        const cancel = () => engine.cancel(owner);
        sender.once("destroyed", cancel);
        sender.on("render-process-gone", cancel);
        try {
          return await operation(owner, sender);
        } finally {
          sender.removeListener("destroyed", cancel);
          sender.removeListener("render-process-gone", cancel);
        }
      },
      catch: (cause) =>
        new VoiceInputError({
          message: cause instanceof Error ? cause.message : "Local dictation failed.",
        }),
    });

  yield* ipc.handle({
    channel: "fork:voice-prepare",
    handler: Effect.fn("desktop.fork.voice.prepare")(function* (raw, event) {
      const { requestId } = yield* decodeRequest(raw);
      return yield* withWindow(event, requestId, (owner, sender) =>
        engine.prepare(owner, (percent) => {
          if (!sender.isDestroyed()) sender.send("fork:voice-download", { requestId, percent });
        }),
      );
    }, respond<void>()),
  });

  yield* ipc.handle({
    channel: "fork:voice-transcribe",
    handler: Effect.fn("desktop.fork.voice.transcribe")(function* (raw, event) {
      const { requestId, wav } = yield* decodeRecording(raw);
      return yield* withWindow(event, requestId, (owner) => engine.transcribe(owner, wav));
    }, respond<string>()),
  });

  yield* ipc.handle({
    channel: "fork:voice-cancel",
    handler: Effect.fn("desktop.fork.voice.cancel")(function* (raw, event) {
      const { requestId } = yield* decodeRequest(raw);
      if (event) engine.cancel(`${event.sender.id}:${requestId}`);
    }, respond<void>()),
  });
});
