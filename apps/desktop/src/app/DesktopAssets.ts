import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

export interface DesktopIconPaths {
  readonly ico: Option.Option<string>;
  readonly icns: Option.Option<string>;
  readonly png: Option.Option<string>;
}

export class DesktopAssetProbeError extends Schema.TaggedErrorClass<DesktopAssetProbeError>()(
  "DesktopAssetProbeError",
  {
    fileName: Schema.String,
    candidatePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to probe desktop asset "${this.fileName}" at ${this.candidatePath}.`;
  }
}

export class DesktopAssets extends Context.Service<
  DesktopAssets,
  {
    readonly iconPaths: Effect.Effect<DesktopIconPaths>;
    readonly resolveResourcePath: (
      fileName: string,
    ) => Effect.Effect<Option.Option<string>, DesktopAssetProbeError>;
  }
>()("@t3tools/desktop/app/DesktopAssets") {}

const resolveResourcePath = Effect.fn("desktop.assets.resolveResourcePath")(function* (
  fileName: string,
): Effect.fn.Return<
  Option.Option<string>,
  DesktopAssetProbeError,
  FileSystem.FileSystem | DesktopEnvironment.DesktopEnvironment
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const candidates = environment.resolveResourcePathCandidates(fileName);
  for (const candidate of candidates) {
    const exists = yield* fileSystem
      .exists(candidate)
      .pipe(
        Effect.mapError(
          (cause) => new DesktopAssetProbeError({ fileName, candidatePath: candidate, cause }),
        ),
      );
    if (exists) {
      return Option.some(candidate);
    }
  }
  return Option.none<string>();
});

// fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
// Fork art in place of upstream's blueprint/black tables: on darwin dev this
// is the runtime dock icon (DesktopAppIdentity), the slot the retired
// DesktopEnvironment.developmentDockIconPath used to fill. Dev keeps the
// orange dock art so installed variants stay distinguishable; the fork ships
// no per-channel ico/universal variants, so both brands share the release
// ico and universal render. Only the values and the directory segment below
// are fork-owned — the resolver logic is upstream's verbatim.
const sourceTreeIconFileNames = {
  dev: {
    ico: "n3-windows.ico",
    macPng: "n3-dev-macos-dock.png",
    universalPng: "n3-universal-1024.png",
  },
  prod: {
    ico: "n3-windows.ico",
    macPng: "n3-macos-dock.png",
    universalPng: "n3-universal-1024.png",
  },
} as const;
const sourceTreeIconDirectory = "fork";
// fork:end fork-app-identity

function resolveSourceTreeIconPath(
  environment: DesktopEnvironment.DesktopEnvironment["Service"],
  ext: keyof DesktopIconPaths,
): string | undefined {
  if (environment.isPackaged || ext === "icns") return undefined;
  const brand = environment.isDevelopment ? "dev" : "prod";
  const fileNames = sourceTreeIconFileNames[brand];
  const fileName =
    ext === "ico"
      ? fileNames.ico
      : environment.platform === "darwin"
        ? fileNames.macPng
        : fileNames.universalPng;
  // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
  return environment.path.join(environment.rootDir, "assets", sourceTreeIconDirectory, fileName);
  // fork:end fork-app-identity
}

const resolveIconPath = Effect.fn("desktop.assets.resolveIconPath")(function* (
  ext: keyof DesktopIconPaths,
): Effect.fn.Return<
  Option.Option<string>,
  DesktopAssetProbeError,
  FileSystem.FileSystem | DesktopEnvironment.DesktopEnvironment
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const sourceTreeIconPath = resolveSourceTreeIconPath(environment, ext);
  if (sourceTreeIconPath !== undefined) {
    const sourceTreeIconExists = yield* fileSystem.exists(sourceTreeIconPath).pipe(
      Effect.mapError(
        (cause) =>
          new DesktopAssetProbeError({
            fileName: `icon.${ext}`,
            candidatePath: sourceTreeIconPath,
            cause,
          }),
      ),
    );
    if (sourceTreeIconExists) {
      return Option.some(sourceTreeIconPath);
    }
  }

  return yield* resolveResourcePath(`icon.${ext}`);
});

export const make = Effect.gen(function* () {
  const context = yield* Effect.context<
    FileSystem.FileSystem | DesktopEnvironment.DesktopEnvironment
  >();
  const [ico, icns, png] = yield* Effect.all(
    [resolveIconPath("ico"), resolveIconPath("icns"), resolveIconPath("png")] as const,
    { concurrency: "unbounded" },
  );
  const iconPaths = { ico, icns, png } satisfies DesktopIconPaths;

  return DesktopAssets.of({
    iconPaths: Effect.succeed(iconPaths),
    resolveResourcePath: Effect.fn("desktop.assets.resolveResourcePath.scoped")(
      function* (fileName) {
        return yield* resolveResourcePath(fileName).pipe(Effect.provide(context));
      },
    ),
  });
});

export const layer = Layer.effect(DesktopAssets, make);
