import * as MacPermissions from "./permissions/MacPermissions.ts";
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") throw err;
  });
}

import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
// @effect-diagnostics-next-line nodeBuiltinImport:off - Version output must flush before Electron exits, without acquiring the runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Electron from "electron";

import * as NetService from "@t3tools/shared/Net";
import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import type { RemoteT3RunnerOptions } from "@t3tools/ssh/tunnel";
import serverPackageJson from "../../server/package.json" with { type: "json" };

import * as DesktopIpc from "./ipc/DesktopIpc.ts";
import * as ElectronApp from "./electron/ElectronApp.ts";
import * as ElectronDialog from "./electron/ElectronDialog.ts";
import * as ElectronMenu from "./electron/ElectronMenu.ts";
import * as ElectronPowerMonitor from "./electron/ElectronPowerMonitor.ts";
import * as ElectronProtocol from "./electron/ElectronProtocol.ts";
import * as ElectronSafeStorage from "./electron/ElectronSafeStorage.ts";
import * as ElectronShell from "./electron/ElectronShell.ts";
import * as ElectronTheme from "./electron/ElectronTheme.ts";
import * as ElectronUpdater from "./electron/ElectronUpdater.ts";
import * as ElectronWindow from "./electron/ElectronWindow.ts";
import * as DesktopApp from "./app/DesktopApp.ts";
import * as DesktopAppActivation from "./app/DesktopAppActivation.ts";
import * as DesktopAppIdentity from "./app/DesktopAppIdentity.ts";
import * as DesktopConnectionCatalogStore from "./app/DesktopConnectionCatalogStore.ts";
import * as DesktopClerk from "./app/DesktopClerk.ts";
import * as DesktopApplicationMenu from "./window/DesktopApplicationMenu.ts";
import * as DesktopAssets from "./app/DesktopAssets.ts";
import * as DesktopBackendConfiguration from "./backend/DesktopBackendConfiguration.ts";
import * as DesktopBackendPool from "./backend/DesktopBackendPool.ts";
import * as DesktopLocalEnvironmentAuth from "./backend/DesktopLocalEnvironmentAuth.ts";
import * as DesktopNetworkInterfaces from "./backend/DesktopNetworkInterfaces.ts";
import * as DesktopEnvironment from "./app/DesktopEnvironment.ts";
import * as DesktopLifecycle from "./app/DesktopLifecycle.ts";
import * as DesktopLinuxUrlHandler from "./app/DesktopLinuxUrlHandler.ts";
import * as DesktopShutdown from "./app/DesktopShutdown.ts";
import * as DesktopObservability from "./app/DesktopObservability.ts";
import * as DesktopServerExposure from "./backend/DesktopServerExposure.ts";
import * as DesktopClientSettings from "./settings/DesktopClientSettings.ts";
import * as DesktopSavedEnvironments from "./settings/DesktopSavedEnvironments.ts";
import * as DesktopSnapShot from "./snapShot/DesktopSnapShot.ts";
import * as DesktopAppSettings from "./settings/DesktopAppSettings.ts";
import * as DesktopPreReadyFileSystem from "./app/DesktopPreReadyFileSystem.ts";
import * as DesktopPreReadyPlatform from "./app/DesktopPreReadyPlatform.ts";
import * as DesktopShellEnvironment from "./shell/DesktopShellEnvironment.ts";
import * as DesktopSshEnvironment from "./ssh/DesktopSshEnvironment.ts";
import * as DesktopSshPasswordPrompts from "./ssh/DesktopSshPasswordPrompts.ts";
import * as DesktopState from "./app/DesktopState.ts";
import * as DesktopLegacyLocalStorage from "./app/DesktopLegacyLocalStorage.ts";
import * as DesktopTelemetryPublisher from "./telemetry/DesktopTelemetryPublisher.ts";
import * as DesktopRendererHistory from "./telemetry/DesktopRendererHistory.ts";
import * as DesktopUpdates from "./updates/DesktopUpdates.ts";
import * as BrowserImport from "./preview/BrowserImport/BrowserImport.ts";
import * as LinuxBrowserSecret from "./preview/BrowserImport/LinuxBrowserSecret.ts";
import * as BrowserSession from "./preview/BrowserSession.ts";
import * as DesktopBrowserHost from "./preview/DesktopBrowserHost.ts";
import * as PreviewManager from "./preview/Manager.ts";
import * as DesktopWindow from "./window/DesktopWindow.ts";
import * as DesktopWslBackend from "./wsl/DesktopWslBackend.ts";
import * as DesktopWslEnvironment from "./wsl/DesktopWslEnvironment.ts";
import * as DesktopWslServerTree from "./wsl/DesktopWslServerTree.ts";

if (process.argv.includes("--version")) {
  try {
    NodeFS.writeSync(process.stdout.fd, `${Electron.app.getVersion()}\n`);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EPIPE") throw error;
  }
  Electron.app.exit(0);
}

// fork:begin fork-clerk-launch-resilience — see .fork/customizations.yaml#fork-clerk-launch-resilience
// The renderer's scheme privileges are otherwise registered only by the
// Clerk bridge — which keyless fork builds skip entirely (DesktopClerk), so
// this synchronous module-load registration is the sole registrar on the
// fork's own builds, and it is guaranteed to precede Electron's "ready"
// event (module evaluation completes before the event loop can emit it).
// Keyed builds create the Clerk bridge too, but its own registration is
// suppressed (createDesktopClerkBridge in DesktopClerk.ts): layer
// construction can trail "ready" on a packaged boot — the v0.1.7 dry run's
// launch isolation gate died on exactly that — and the bridge's privilege
// set is identical to this one, so this registration is the sole registrar
// on every path.
// Both schemes are registered so no env sniffing is needed; the privilege
// set mirrors @clerk/electron's. try/catch because this runs before the
// Effect runtime and any observability: a throw here would otherwise be a
// silent exit, the exact failure shape this customization exists to remove —
// a broken renderer with a logged reason beats that.
try {
  Electron.protocol.registerSchemesAsPrivileged(
    [ElectronProtocol.getDesktopScheme(false), ElectronProtocol.getDesktopScheme(true)].map(
      (scheme) => ({
        scheme,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      }),
    ),
  );
} catch (error) {
  // Pre-runtime, so no Effect logger exists yet; stderr is all there is.
  process.stderr.write(
    `Failed to register renderer scheme privileges at module load: ${String(error)}\n`,
  );
}
// fork:end fork-clerk-launch-resilience

const layerDesktopEnvironment = Layer.unwrap(
  Effect.gen(function* () {
    const metadata = yield* Effect.service(ElectronApp.ElectronApp).pipe(
      Effect.flatMap((app) => app.metadata),
    );
    const platform = yield* HostProcessPlatform;
    const processArch = yield* HostProcessArchitecture;
    return DesktopEnvironment.layer({
      dirname: __dirname,
      homeDirectory: NodeOS.homedir(),
      platform,
      processArch,
      ...metadata,
    });
  }),
);

// The remote runs the exact release this app is on, from its self-contained
// archive, so it needs neither Node nor npm. Development points the remote at
// a source checkout instead so the two sides can be iterated together.
const resolveDesktopSshCliRunner = (
  environment: DesktopEnvironment.DesktopEnvironment["Service"],
): RemoteT3RunnerOptions => {
  const devRemoteEntryPath = Option.getOrUndefined(environment.devRemoteT3ServerEntryPath);
  if (environment.isDevelopment && devRemoteEntryPath !== undefined) {
    return {
      nodeScriptPath: devRemoteEntryPath,
      nodeEngineRange: serverPackageJson.engines.node,
    };
  }
  /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
     A packaged fork build carries its own 0.1.x app version, which names no
     pingdotgg/t3code release, so the archive download 404s and the launch aborts.
     The remote runs the upstream release this fork is synced to instead: the
     source tree's package version, which tracks upstream and is bundled here at
     build time (fork-release.yml only stamps its version into the staged app). */
  return { archiveVersion: serverPackageJson.version };
  /* fork:end fork-app-identity */
};

const layerDesktopSshEnvironment = Layer.unwrap(
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    return DesktopSshEnvironment.layer({
      resolveCliRunner: Effect.succeed(resolveDesktopSshCliRunner(environment)),
    });
  }),
);

const layerElectron = Layer.mergeAll(
  ElectronApp.layer,
  ElectronDialog.layer,
  ElectronMenu.layer,
  ElectronPowerMonitor.layer,
  ElectronProtocol.layer,
  ElectronSafeStorage.layer,
  ElectronShell.layer,
  ElectronTheme.layer,
  ElectronUpdater.layer,
  ElectronWindow.layer,
  DesktopIpc.layer(Electron.ipcMain),
);

const layerDesktopFoundation = Layer.mergeAll(
  MacPermissions.layer,
  DesktopState.layer,
  DesktopShutdown.layer,
  DesktopLegacyLocalStorage.layer,
  DesktopAppSettings.layer,
  DesktopClientSettings.layer,
  DesktopConnectionCatalogStore.layer.pipe(Layer.provideMerge(DesktopSavedEnvironments.layer)),
  DesktopAssets.layer,
  DesktopObservability.layer,
  DesktopRendererHistory.layer,
).pipe(Layer.provideMerge(layerDesktopEnvironment));

const layerDesktopSsh = layerDesktopSshEnvironment.pipe(
  Layer.provideMerge(DesktopSshPasswordPrompts.layer()),
);

const layerDesktopServerExposure = DesktopServerExposure.layer.pipe(
  Layer.provideMerge(DesktopNetworkInterfaces.layer),
  Layer.provideMerge(layerDesktopFoundation),
);

const layerDesktopPreview = PreviewManager.layer.pipe(
  Layer.provideMerge(DesktopBrowserHost.layer),
  // Merged rather than provided so the IPC handlers can reach the import
  // service alongside the manager; both sit on the same BrowserSession.
  Layer.provideMerge(BrowserImport.layer.pipe(Layer.provide(LinuxBrowserSecret.layer))),
  Layer.provideMerge(BrowserSession.layer),
  Layer.provideMerge(layerDesktopFoundation),
);

const layerDesktopWindow = DesktopWindow.layer.pipe(
  Layer.provideMerge(layerDesktopServerExposure),
  Layer.provideMerge(layerDesktopPreview),
);

const layerDesktopSnapShot = DesktopSnapShot.layer.pipe(
  Layer.provideMerge(layerDesktopWindow),
  Layer.provideMerge(layerDesktopFoundation),
);
const layerDesktopAppActivation = DesktopAppActivation.layer.pipe(
  Layer.provide(layerDesktopWindow),
);

// Pool layer instantiates the backend factory once for the Windows
// primary instance and exposes it via pool.primary. Consumers go through
// the pool now; the legacy DesktopBackendManager service is gone. The
// WSL second instance gets registered later in the migration. See
// DesktopBackendPool.ts header for the full rollout plan.
const layerDesktopBackend = DesktopBackendPool.layer.pipe(
  Layer.provideMerge(DesktopAppIdentity.layer),
  Layer.provideMerge(DesktopBackendConfiguration.layer),
  Layer.provideMerge(DesktopWslEnvironment.layer),
  Layer.provideMerge(DesktopWslServerTree.layer),
  Layer.provideMerge(DesktopTelemetryPublisher.layer),
  Layer.provideMerge(layerDesktopWindow),
);

// WSL orchestrator hangs off the backend layer because it needs the
// pool + configuration + serverExposure; it pulls NetService and the
// foundation services through the same provideMerge chain.
const layerDesktopWslBackend = DesktopWslBackend.layer.pipe(
  Layer.provideMerge(layerDesktopBackend),
);

const layerDesktopLocalEnvironmentAuth = DesktopLocalEnvironmentAuth.layer.pipe(
  Layer.provideMerge(layerDesktopBackend),
);

const layerDesktopApplication = Layer.mergeAll(
  DesktopLifecycle.layer,
  layerDesktopAppActivation,
  DesktopApplicationMenu.layer,
  DesktopLinuxUrlHandler.layer,
  DesktopShellEnvironment.layer,
  layerDesktopSsh,
).pipe(
  Layer.provideMerge(layerDesktopSnapShot),
  Layer.provideMerge(DesktopUpdates.layer),
  Layer.provideMerge(layerDesktopWslBackend),
  Layer.provideMerge(layerDesktopLocalEnvironmentAuth),
);

// Clerk resolves userData before Electron is ready, so it gets the synchronous FileSystem.
const layerDesktopClerk = DesktopClerk.layer.pipe(
  Layer.provide(DesktopPreReadyFileSystem.layer),
  Layer.provideMerge(ElectronShell.layer),
  Layer.provideMerge(layerDesktopEnvironment),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(ElectronApp.layer),
);

const layerDesktopApplicationRuntime = layerDesktopApplication.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(NodeHttpClient.layerUndici),
  Layer.provideMerge(NetService.layer),
  Layer.provideMerge(layerElectron),
);

// Acquire strict pre-ready setup before Clerk. Nothing before the Clerk bridge
// may yield, or Electron can emit ready before Clerk registers its scheme.
const layerDesktopRuntime = layerDesktopClerk.pipe(
  Layer.flatMap((clerkContext) =>
    layerDesktopApplicationRuntime.pipe(Layer.provideMerge(Layer.succeedContext(clerkContext))),
  ),
  Layer.provideMerge(DesktopPreReadyPlatform.layer),
);

// fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
// The ~/.t3 refusal (DesktopEnvironment) fires during layer construction,
// before any of DesktopApp's fatal-startup dialog handlers exist. Without
// this tap a GUI launch with T3CODE_HOME pointed at upstream's base bounces
// in the Dock and quits, with the actionable message lost to a discarded
// stderr. dialog.showErrorBox is safe before app "ready".
DesktopApp.program.pipe(
  Effect.provide(layerDesktopRuntime),
  Effect.tapCause((cause) =>
    Effect.sync(() => {
      const message = String(Cause.squash(cause));
      if (message.includes("Refusing to start")) {
        Electron.dialog.showErrorBox("no3y Code cannot start", message);
      }
    }),
  ),
  NodeRuntime.runMain,
);
// fork:end fork-app-identity
