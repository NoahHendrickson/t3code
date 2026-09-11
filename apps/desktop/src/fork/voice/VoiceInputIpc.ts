// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DesktopEnvironment } from "../../app/DesktopEnvironment.ts";
import * as DesktopIpc from "../../ipc/DesktopIpc.ts";
import { LocalSpeechEngine } from "./LocalSpeechEngine.ts";
import type { DesktopVoiceInputResult } from "@t3tools/client-runtime/voice-input";

const Request = Schema.Struct({ requestId: Schema.String });
const Recording = Schema.Struct({ requestId: Schema.String, wav: Schema.Uint8Array });
const decodeRequest = Schema.decodeUnknownEffect(Request);
const decodeRecording = Schema.decodeUnknownEffect(Recording);
class VoiceInputError extends Schema.TaggedError<VoiceInputError>()("VoiceInputError", {
  message: Schema.String,
}) {}
const isVoiceInputError = Schema.is(VoiceInputError);

export const installVoiceInputIpc = Effect.fn("desktop.fork.installVoiceInput")(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  const environment = yield* DesktopEnvironment;
  const platform = environment.platform;
  const arch = environment.processArch;
  const binaryName = platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const engine = new LocalSpeechEngine({
    binary: environment.isPackaged
      ? NodePath.join(environment.resourcesPath, "voice-input", binaryName)
      : NodePath.join(
          environment.rootDir,
          "native/voice-input/build",
          `${platform}-${arch}`,
          binaryName,
        ),
    cacheDirectory: NodePath.join(Electron.app.getPath("userData"), "voice-input"),
  });
  yield* Effect.addFinalizer(() => Effect.sync(() => engine.dispose()));

  for (const action of ["prepare", "transcribe", "cancel"] as const) {
    yield* ipc.handle({
      channel: `fork:voice-${action}`,
      handler: Effect.fn(`desktop.fork.voice.${action}`)(
        function* (raw, event) {
          const { requestId } = yield* decodeRequest(raw);
          const recording = action === "transcribe" ? yield* decodeRecording(raw) : null;
          return yield* Effect.tryPromise({
            try: async () => {
              if (!event) throw new Error("Voice input requires a desktop window.");
              const sender = Electron.webContents.fromId(event.sender.id);
              if (!sender || sender.getType() !== "window")
                throw new Error("Voice input requires a desktop window.");
              const owner = `${sender.id}:${requestId}`;
              if (action === "cancel") {
                engine.cancel(owner);
                return;
              }
              const cancel = () => engine.cancel(owner);
              sender.once("destroyed", cancel);
              sender.on("render-process-gone", cancel);
              try {
                if (action === "prepare")
                  return await engine.prepare(owner, (percent) => {
                    if (!sender.isDestroyed())
                      sender.send("fork:voice-download", { requestId, percent });
                  });
                if (!recording) throw new Error("A voice recording is required.");
                return await engine.transcribe(owner, recording.wav);
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
        },
        Effect.match({
          onSuccess: (value): DesktopVoiceInputResult => ({ ok: true, value }),
          onFailure: (error): DesktopVoiceInputResult => ({
            ok: false,
            error: isVoiceInputError(error) ? error.message : "Invalid voice input request.",
          }),
        }),
      ),
    });
  }
});
