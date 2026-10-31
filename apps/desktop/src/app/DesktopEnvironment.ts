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
import { resolveLinuxDesktopEntryName } from "./DesktopEarlyElectronStartup.ts";
import { resolveDesktopStateDir } from "./DesktopStatePaths.ts";
import { isNightlyDesktopVersion } from "../updates/updateChannels.ts";
import type { OtlpProtocol } from "@t3tools/shared/observability";

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
    readonly serverRoot: string;
    readonly backendEntryPath: string;
    readonly clientAssetsDir: string;
    readonly backendCwd: string;
    readonly preloadPath: string;
    readonly compileCachePath: string;
    readonly appUpdateYmlPath: string;
    readonly devServerUrl: Option.Option<URL>;
    readonly devRemoteT3ServerEntryPath: Option.Option<string>;
    readonly configuredBackendPort: Option.Option<number>;
    readonly commitHashOverride: Option.Option<string>;
    readonly otlpTracesUrl: Option.Option<string>;
    readonly otlpMetricsUrl: Option.Option<string>;
    readonly otlpLogsUrl: Option.Option<string>;
    readonly otlpExportIntervalMs: number;
    readonly otlpHeaders: Option.Option<Record<string, string>>;
    readonly otlpProtocol: OtlpProtocol;
    readonly branding: DesktopAppBranding;
    readonly displayName: string;
    readonly appUserModelId: string;
    readonly linuxDesktopEntryName: string;
    readonly linuxWmClass: string;
    readonly linuxApplicationsDir: string;
    readonly desktopLauncherPath: Option.Option<string>;
    readonly appImagePath: Option.Option<string>;
    readonly defaultDesktopSettings: DesktopAppSettings.DesktopSettings;
    readonly runtimeInfo: DesktopRuntimeInfo;
    readonly resolvePickFolderDefaultPath: (rawOptions: unknown) => Option.Option<string>;
    readonly resolveResourcePathCandidates: (fileName: string) => readonly string[];
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

  return isNightlyDesktopVersion(input.appVersion) ? "Nightly" : "Beta";
}

export function resolveDesktopAppBranding(input: {
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
  // A fork build must not share ~/.t3 with an installed upstream release. Forking the base dir
  // isolates every derived path (stateDir, the server child's t3Home, caches/, worktrees/).
  // Only an unpackaged dev run keeps ~/.t3; a packaged build stays fork-owned.
  const upstreamBaseDir = path.join(homeDirectory, ".t3");
  const isUnpackagedDevelopment = isDevelopment && !input.isPackaged;
  // The server child expands a leading "~" in T3CODE_HOME (os-jank.ts expandHomePath) and
  // upstream's desktop does not, so a literal "~/.t3" would split the two halves across
  // directories. Mirror the server's expansion so one variable means one directory.
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
  // A custom T3CODE_HOME still wins, except upstream's own base: ~/.t3 would put this process
  // and the server child on the real app's live state.sqlite, so it fails loudly. Both sides
  // are canonicalized (realpath, case-folded off Linux); anything inside that base is refused.
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
  const serverRoot =
    input.isPackaged && input.platform === "win32"
      ? path.join(input.resourcesPath, "server.asar")
      : appRoot;
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
    serverRoot,
    backendEntryPath: path.join(serverRoot, "apps/server/dist/bin.mjs"),
    clientAssetsDir: path.join(serverRoot, "apps/server/dist/client"),
    backendCwd: input.isPackaged ? homeDirectory : appRoot,
    preloadPath: path.join(input.dirname, "preload.cjs"),
    compileCachePath: path.join(input.dirname, "compileCache.cjs"),
    appUpdateYmlPath: input.isPackaged
      ? path.join(resourcesPath, "app-update.yml")
      : path.join(input.appPath, "dev-app-update.yml"),
    devServerUrl,
    devRemoteT3ServerEntryPath: config.devRemoteT3ServerEntryPath,
    configuredBackendPort: config.configuredBackendPort,
    commitHashOverride: config.commitHashOverride,
    otlpTracesUrl: config.otlpTracesUrl,
    otlpMetricsUrl: config.otlpMetricsUrl,
    otlpLogsUrl: config.otlpLogsUrl,
    otlpExportIntervalMs: config.otlpExportIntervalMs,
    otlpHeaders: config.otlpHeaders,
    otlpProtocol: config.otlpProtocol,
    branding,
    displayName,
    // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
    appUserModelId: Option.getOrElse(config.appUserModelIdOverride, () =>
      isDevelopment ? "com.t3tools.t3code.dev" : "com.t3tools.t3code.fork",
    ),
    linuxDesktopEntryName: resolveLinuxDesktopEntryName(isDevelopment),
    linuxWmClass: isDevelopment ? "t3code-dev" : "t3code-fork",
    // fork:end fork-app-identity
    linuxApplicationsDir,
    desktopLauncherPath: config.desktopLauncherPath,
    appImagePath: config.appImagePath,
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
  });
});

export const layer = (input: MakeDesktopEnvironmentInput) =>
  Layer.effect(DesktopEnvironment, make(input));
