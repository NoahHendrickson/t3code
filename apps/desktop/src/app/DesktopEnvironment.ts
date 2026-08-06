import type {
  DesktopAppBranding,
  DesktopAppStageLabel,
  DesktopRuntimeArch,
  DesktopRuntimeInfo,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopConfig from "./DesktopConfig.ts";
import { resolveDesktopStateDir } from "./DesktopStatePaths.ts";
import { isNightlyDesktopVersion } from "../updates/updateChannels.ts";

export interface MakeDesktopEnvironmentInput {
  readonly dirname: string;
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly processArch: string;
  readonly appVersion: string;
  readonly appPath: string;
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly runningUnderArm64Translation: boolean;
}

export class DesktopEnvironment extends Context.Service<
  DesktopEnvironment,
  {
    readonly path: Path.Path;
    readonly dirname: string;
    readonly platform: NodeJS.Platform;
    readonly processArch: string;
    readonly isPackaged: boolean;
    readonly isDevelopment: boolean;
    readonly appVersion: string;
    readonly appPath: string;
    readonly resourcesPath: string;
    readonly homeDirectory: string;
    readonly appDataDirectory: string;
    readonly baseDir: string;
    readonly stateDir: string;
    readonly desktopSettingsPath: string;
    readonly clientSettingsPath: string;
    readonly savedEnvironmentRegistryPath: string;
    readonly serverSettingsPath: string;
    readonly logDir: string;
    readonly browserArtifactsDir: string;
    readonly rootDir: string;
    readonly appRoot: string;
    readonly backendEntryPath: string;
    readonly backendCwd: string;
    readonly preloadPath: string;
    readonly appUpdateYmlPath: string;
    readonly devServerUrl: Option.Option<URL>;
    readonly devRemoteT3ServerEntryPath: Option.Option<string>;
    readonly configuredBackendPort: Option.Option<number>;
    readonly commitHashOverride: Option.Option<string>;
    readonly otlpTracesUrl: Option.Option<string>;
    readonly otlpExportIntervalMs: number;
    readonly branding: DesktopAppBranding;
    readonly displayName: string;
    readonly appUserModelId: string;
    readonly linuxDesktopEntryName: string;
    readonly linuxWmClass: string;
    readonly linuxApplicationsDir: string;
    readonly appImagePath: Option.Option<string>;
    readonly userDataDirName: string;
    readonly legacyUserDataDirName: string;
    readonly defaultDesktopSettings: DesktopAppSettings.DesktopSettings;
    readonly runtimeInfo: DesktopRuntimeInfo;
    readonly resolvePickFolderDefaultPath: (rawOptions: unknown) => Option.Option<string>;
    readonly resolveResourcePathCandidates: (fileName: string) => readonly string[];
    readonly developmentDockIconPath: string;
  }
>()("@t3tools/desktop/app/DesktopEnvironment") {}

// fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
const APP_BASE_NAME = "no3y Code";
// fork:end fork-app-identity

function resolveDesktopAppStageLabel(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppStageLabel {
  if (input.isDevelopment) {
    return "Dev";
  }

  return isNightlyDesktopVersion(input.appVersion) ? "Nightly" : "Alpha";
}

function resolveDesktopAppBranding(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppBranding {
  const stageLabel = resolveDesktopAppStageLabel(input);
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    displayName: `${APP_BASE_NAME} (${stageLabel})`,
  };
}

function normalizeDesktopArch(arch: string): DesktopRuntimeArch {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "x64";
  return "other";
}

function resolveDesktopRuntimeInfo(input: {
  readonly platform: NodeJS.Platform;
  readonly processArch: string;
  readonly runningUnderArm64Translation: boolean;
}): DesktopRuntimeInfo {
  const appArch = normalizeDesktopArch(input.processArch);

  if (input.platform !== "darwin") {
    return {
      hostArch: appArch,
      appArch,
      runningUnderArm64Translation: false,
    };
  }

  const hostArch = appArch === "arm64" || input.runningUnderArm64Translation ? "arm64" : appArch;

  return {
    hostArch,
    appArch,
    runningUnderArm64Translation: input.runningUnderArm64Translation,
  };
}

const make = Effect.fn("desktop.environment.make")(function* (
  input: MakeDesktopEnvironmentInput,
): Effect.fn.Return<
  DesktopEnvironment["Service"],
  Config.ConfigError,
  Path.Path | FileSystem.FileSystem
> {
  const path = yield* Path.Path;
  const config = yield* DesktopConfig.DesktopConfig;
  const homeDirectory = input.homeDirectory;
  const devServerUrl = config.devServerUrl;
  const isDevelopment = Option.isSome(devServerUrl);
  const appDataDirectory =
    input.platform === "win32"
      ? Option.getOrElse(config.appDataDirectory, () =>
          path.join(homeDirectory, "AppData", "Roaming"),
        )
      : input.platform === "darwin"
        ? path.join(homeDirectory, "Library", "Application Support")
        : Option.getOrElse(config.xdgConfigHome, () => path.join(homeDirectory, ".config"));
  // Mirror DesktopStatePaths.normalizeConfiguredBaseDir: a blank T3CODE_HOME
  // is unset, so baseDir and resolveDesktopStateDir agree on whether one was
  // configured.
  const configuredBaseDir = config.t3Home.pipe(
    Option.map((value) => value.trim()),
    Option.filter((value) => value.length > 0),
  );
  // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
  // A fork build must not share ~/.t3 with an installed upstream release. The
  // base directory is the one input both halves of the app derive shared
  // state from: the desktop resolves stateDir from it below, and hands it to
  // the bundled server child as bootstrap t3Home
  // (DesktopBackendConfiguration), which derives its own stateDir plus caches/
  // and worktrees/ from it. Forking the base — rather than renaming the
  // "userdata" leaf, which the server re-derives independently and would not
  // pick up — keeps both derivations upstream's and isolates all three shared
  // directories at once. Only an unpackaged development run (`vp dev` — this
  // repo is already the fork) keeps upstream's ~/.t3; a packaged build stays
  // fork-owned even when a dev server URL is set.
  const upstreamBaseDir = path.join(homeDirectory, ".t3");
  const isUnpackagedDevelopment = isDevelopment && !input.isPackaged;
  // The server child resolves T3CODE_HOME itself and expands a leading "~"
  // (apps/server/src/os-jank.ts expandHomePath); upstream's desktop does not,
  // so a literal "~/.t3" would send the two halves to different directories —
  // the child onto upstream's live database. Mirror the server's expansion so
  // one variable means one directory in both processes.
  const expandedBaseDir = Option.map(configuredBaseDir, (value) =>
    value === "~"
      ? homeDirectory
      : value.startsWith("~/") || value.startsWith("~\\")
        ? path.join(homeDirectory, value.slice(2))
        : value,
  );
  const baseDir = Option.getOrElse(expandedBaseDir, () =>
    isUnpackagedDevelopment ? upstreamBaseDir : path.join(homeDirectory, ".t3-fork"),
  );
  // A custom T3CODE_HOME still wins — an explicit override is a deliberate,
  // self-consistent choice (the server child resolves the same variable) —
  // with one exception: upstream's own base. With T3CODE_HOME=~/.t3 this
  // process AND the server child (whose env read has precedence over the
  // bootstrap t3Home) would both land on the real app's live state.sqlite.
  // That is the exact incident this customization exists to prevent, and it
  // must fail loudly instead of silently sharing a database with another
  // running application. The comparison canonicalizes both sides — realpath
  // where the paths exist, case-folded off Linux (macOS's default filesystem
  // is case-insensitive) — and refuses anything inside upstream's base, not
  // just its exact spelling.
  const fileSystem = yield* FileSystem.FileSystem;
  const canonicalize = (value: string) =>
    Effect.map(fileSystem.realPath(value).pipe(Effect.orElseSucceed(() => value)), (resolved) =>
      input.platform === "linux" ? resolved : resolved.toLowerCase(),
    );
  const canonicalBaseDir = yield* canonicalize(path.resolve(baseDir));
  const canonicalUpstreamBaseDir = yield* canonicalize(upstreamBaseDir);
  if (
    !isUnpackagedDevelopment &&
    (canonicalBaseDir === canonicalUpstreamBaseDir ||
      canonicalBaseDir.startsWith(canonicalUpstreamBaseDir + path.sep))
  ) {
    return yield* Effect.die(
      new Error(
        `Refusing to start: the configured T3 home directory (${baseDir}) resolves ` +
          "into upstream T3 Code's own state directory, and a fork build must never " +
          "open the real app's database. Unset T3CODE_HOME or point it at a " +
          "fork-owned directory such as ~/.t3-fork.",
      ),
    );
  }
  // fork:end fork-app-identity
  const rootDir = path.resolve(input.dirname, "../../..");
  const appRoot = input.isPackaged ? input.appPath : rootDir;
  const branding = resolveDesktopAppBranding({
    isDevelopment,
    appVersion: input.appVersion,
  });
  const displayName = branding.displayName;
  const stateDir = resolveDesktopStateDir({
    baseDir,
    isDevelopment,
    joinPath: path.join,
    t3Home: config.t3Home,
  });
  // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
  // Electron-side identity stays forked: both builds are non-development, so
  // without these overrides they share the same Electron user data directory —
  // and the legacy directory upstream migrates from, which is why
  // legacyUserDataDirName is redirected too rather than left pointing at
  // upstream's "T3 Code (Alpha)".
  const userDataDirName = isDevelopment ? "t3code-dev" : "t3code-fork";
  // "T3 Code (Fork)" is a deliberate sentinel: it has never named a real
  // directory and must never start to. resolveUserDataPath prefers the legacy
  // directory whenever one exists, so its only job is to never match anything
  // — in particular, do NOT "fix" it to upstream's "T3 Code (Alpha)" (hands
  // the fork the real app's data) or to a name a fork build once shipped.
  const legacyUserDataDirName = isDevelopment ? "T3 Code (Dev)" : "T3 Code (Fork)";
  // fork:end fork-app-identity
  const linuxApplicationsDir = path.join(
    Option.getOrElse(config.xdgDataHome, () => path.join(homeDirectory, ".local", "share")),
    "applications",
  );
  const resourcesPath = input.resourcesPath;

  return DesktopEnvironment.of({
    path,
    dirname: input.dirname,
    platform: input.platform,
    processArch: input.processArch,
    isPackaged: input.isPackaged,
    isDevelopment,
    appVersion: input.appVersion,
    appPath: input.appPath,
    resourcesPath,
    homeDirectory,
    appDataDirectory,
    baseDir,
    stateDir,
    desktopSettingsPath: path.join(stateDir, "desktop-settings.json"),
    clientSettingsPath: path.join(stateDir, "client-settings.json"),
    savedEnvironmentRegistryPath: path.join(stateDir, "saved-environments.json"),
    serverSettingsPath: path.join(stateDir, "settings.json"),
    logDir: path.join(stateDir, "logs"),
    browserArtifactsDir: path.join(stateDir, "browser-artifacts"),
    rootDir,
    appRoot,
    backendEntryPath: path.join(appRoot, "apps/server/dist/bin.mjs"),
    backendCwd: input.isPackaged ? homeDirectory : appRoot,
    preloadPath: path.join(input.dirname, "preload.cjs"),
    appUpdateYmlPath: input.isPackaged
      ? path.join(resourcesPath, "app-update.yml")
      : path.join(input.appPath, "dev-app-update.yml"),
    devServerUrl,
    devRemoteT3ServerEntryPath: config.devRemoteT3ServerEntryPath,
    configuredBackendPort: config.configuredBackendPort,
    commitHashOverride: config.commitHashOverride,
    otlpTracesUrl: config.otlpTracesUrl,
    otlpExportIntervalMs: config.otlpExportIntervalMs,
    branding,
    displayName,
    // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
    appUserModelId: Option.getOrElse(config.appUserModelIdOverride, () =>
      isDevelopment ? "com.t3tools.t3code.dev" : "com.t3tools.t3code.fork",
    ),
    linuxDesktopEntryName: isDevelopment ? "t3code-dev.desktop" : "t3code-fork.desktop",
    linuxWmClass: isDevelopment ? "t3code-dev" : "t3code-fork",
    // fork:end fork-app-identity
    linuxApplicationsDir,
    appImagePath: config.appImagePath,
    userDataDirName,
    legacyUserDataDirName,
    defaultDesktopSettings: DesktopAppSettings.resolveDefaultDesktopSettings(input.appVersion),
    runtimeInfo: resolveDesktopRuntimeInfo({
      platform: input.platform,
      processArch: input.processArch,
      runningUnderArm64Translation: input.runningUnderArm64Translation,
    }),
    resolvePickFolderDefaultPath: (rawOptions) => {
      if (typeof rawOptions !== "object" || rawOptions === null) {
        return Option.none();
      }

      const { initialPath } = rawOptions as { initialPath?: unknown };
      if (typeof initialPath !== "string") {
        return Option.none();
      }

      const trimmedPath = initialPath.trim();
      if (trimmedPath.length === 0) {
        return Option.none();
      }

      if (trimmedPath === "~") {
        return Option.some(homeDirectory);
      }

      if (trimmedPath.startsWith("~/") || trimmedPath.startsWith("~\\")) {
        return Option.some(path.join(homeDirectory, trimmedPath.slice(2)));
      }

      return Option.some(path.resolve(trimmedPath));
    },
    resolveResourcePathCandidates: (fileName) => [
      path.join(input.dirname, "../resources", fileName),
      path.join(input.dirname, "../prod-resources", fileName),
      path.join(resourcesPath, "resources", fileName),
      path.join(resourcesPath, fileName),
    ],
    // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
    developmentDockIconPath: path.join(rootDir, "assets", "fork", "n3-dev-macos-dock.png"),
    // fork:end fork-app-identity
  });
});

export const layer = (input: MakeDesktopEnvironmentInput) =>
  Layer.effect(DesktopEnvironment, make(input));
