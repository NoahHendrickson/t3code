import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

export class DesktopUserDataInitializationError extends Schema.TaggedError<DesktopUserDataInitializationError>()(
  "DesktopUserDataInitializationError",
  {
    operation: Schema.Literals(["inspect", "read", "create-directory", "write"]),
    resourcePath: Schema.String,
    category: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not initialize Electron user data during ${this.operation} at ${this.resourcePath} (${this.category}).`;
  }

  static fromFileSystem(
    cause: PlatformError.PlatformError,
    operation: DesktopUserDataInitializationError["operation"],
    resourcePath: string,
  ) {
    return new DesktopUserDataInitializationError({
      operation,
      resourcePath,
      category: cause.reason._tag,
      cause,
    });
  }
}

/** Select Electron's profile independently of the server's T3 home. */
export const resolveUserDataPath = Effect.fn("desktop.userData.resolveUserDataPath")(
  function* (input: {
    readonly appDataDirectory: string;
    readonly isDevelopment: boolean;
    readonly platform: NodeJS.Platform;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
    // Electron-side identity stays forked: both builds are non-development,
    // so without this override a fork build would open upstream's own
    // "t3code-v2" profile. Upstream's V2 stepped its profile from "t3code" to
    // "t3code-v2" and imports the V1 profile's localStorage; the fork takes
    // the same step from its own V1 profile "t3code-fork" to "t3code-fork-v2"
    // (DesktopLegacyLocalStorage names "t3code-fork" as the import source,
    // and the Windows Local State copy below sources it where upstream
    // sources "t3code"). The legacy slot mirrors upstream's Alpha-era
    // profile, which the fork never had: "T3 Code (Fork)" is a deliberate
    // sentinel that has never named a real directory and must never start
    // to. Do NOT "fix" it to upstream's "T3 Code (Alpha)" (hands the fork the
    // real app's Windows credential keys) or to a name a fork build once
    // shipped. Development keeps upstream's pair: `vp dev` here is already
    // the fork.
    const names = input.isDevelopment
      ? { current: "t3code-dev", legacy: "T3 Code (Dev)" }
      : { current: "t3code-fork-v2", legacy: "T3 Code (Fork)" };
    // fork:end fork-app-identity
    const destinationPath = path.join(input.appDataDirectory, names.current);
    const legacyPath = path.join(input.appDataDirectory, names.legacy);
    const inspect = (resourcePath: string) =>
      fs
        .exists(resourcePath)
        .pipe(
          Effect.mapError((cause) =>
            DesktopUserDataInitializationError.fromFileSystem(cause, "inspect", resourcePath),
          ),
        );
    if (input.isDevelopment) {
      return (yield* inspect(legacyPath)) ? legacyPath : destinationPath;
    }
    // Chromium databases require their own profile for each running version.
    if (input.platform !== "win32") return destinationPath;
    const destinationState = path.join(destinationPath, "Local State");
    if (yield* inspect(destinationState)) return destinationPath;
    const legacyState = path.join(legacyPath, "Local State");
    const sourceState = (yield* inspect(legacyState))
      ? legacyState
      : // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
        path.join(input.appDataDirectory, "t3code-fork", "Local State");
    // fork:end fork-app-identity
    if (!(yield* inspect(sourceState))) return destinationPath;
    // Windows safeStorage keys live here. Copy only these preferences, never locked databases.
    const state = yield* fs
      .readFileString(sourceState)
      .pipe(
        Effect.mapError((cause) =>
          DesktopUserDataInitializationError.fromFileSystem(cause, "read", sourceState),
        ),
      );
    yield* fs
      .makeDirectory(destinationPath, { recursive: true })
      .pipe(
        Effect.mapError((cause) =>
          DesktopUserDataInitializationError.fromFileSystem(
            cause,
            "create-directory",
            destinationPath,
          ),
        ),
      );
    yield* fs.writeFileString(destinationState, state, { flag: "wx" }).pipe(
      Effect.catchIf(
        (error) => error.reason._tag === "AlreadyExists",
        () => Effect.void,
      ),
      Effect.mapError((cause) =>
        DesktopUserDataInitializationError.fromFileSystem(cause, "write", destinationState),
      ),
    );
    return destinationPath;
  },
);
