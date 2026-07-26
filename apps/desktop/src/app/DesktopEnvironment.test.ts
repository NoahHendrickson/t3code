import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const makeEnvironmentLayer = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest(env))));

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(makeEnvironmentLayer(overrides, env)));

describe("DesktopEnvironment", () => {
  it.effect("derives state paths and development identity inside Effect", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: " /tmp/t3 ",
          T3CODE_COMMIT_HASH: " 0123456789abcdef ",
          T3CODE_PORT: "4949",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
          T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH: " /remote/server.mjs ",
          T3CODE_OTLP_TRACES_URL: " http://127.0.0.1:4318/v1/traces ",
          T3CODE_OTLP_EXPORT_INTERVAL_MS: "2500",
        },
      );

      assert.equal(environment.isDevelopment, true);
      assert.equal(environment.appDataDirectory, "/Users/alice/Library/Application Support");
      assert.equal(environment.baseDir, "/tmp/t3");
      assert.equal(environment.stateDir, "/tmp/t3/userdata");
      assert.equal(environment.desktopSettingsPath, "/tmp/t3/userdata/desktop-settings.json");
      assert.equal(environment.clientSettingsPath, "/tmp/t3/userdata/client-settings.json");
      assert.equal(
        environment.savedEnvironmentRegistryPath,
        "/tmp/t3/userdata/saved-environments.json",
      );
      assert.equal(environment.serverSettingsPath, "/tmp/t3/userdata/settings.json");
      assert.equal(environment.logDir, "/tmp/t3/userdata/logs");
      assert.equal(environment.browserArtifactsDir, "/tmp/t3/userdata/browser-artifacts");
      assert.equal(environment.rootDir, "/repo");
      assert.equal(environment.appRoot, "/repo");
      assert.equal(environment.backendEntryPath, "/repo/apps/server/dist/bin.mjs");
      assert.equal(environment.backendCwd, "/repo");
      assert.equal(environment.appUserModelId, "com.t3tools.t3code.dev");
      assert.equal(environment.linuxWmClass, "t3code-dev");
      assert.deepEqual(
        Option.map(environment.devServerUrl, (url) => url.href),
        Option.some("http://localhost:5173/"),
      );
      assert.deepEqual(environment.devRemoteT3ServerEntryPath, Option.some("/remote/server.mjs"));
      assert.deepEqual(environment.configuredBackendPort, Option.some(4949));
      assert.deepEqual(environment.commitHashOverride, Option.some("0123456789abcdef"));
      assert.deepEqual(environment.otlpTracesUrl, Option.some("http://127.0.0.1:4318/v1/traces"));
      assert.equal(environment.otlpExportIntervalMs, 2500);
    }),
  );

  it.effect("stores production state under userdata in an explicit home", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: "/tmp/t3",
        },
      );

      assert.equal(environment.isDevelopment, false);
      assert.equal(environment.stateDir, "/tmp/t3/userdata");
      assert.equal(environment.logDir, "/tmp/t3/userdata/logs");
      assert.equal(environment.browserArtifactsDir, "/tmp/t3/userdata/browser-artifacts");
      assert.equal(environment.serverSettingsPath, "/tmp/t3/userdata/settings.json");
    }),
  );

  it.effect("keeps implicit development state separate from production state", () =>
    Effect.gen(function* () {
      const development = yield* makeEnvironment(
        {},
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      const production = yield* makeEnvironment();

      assert.equal(development.stateDir, "/Users/alice/.t3/dev");
      assert.equal(production.baseDir, "/Users/alice/.t3-fork");
      assert.equal(production.stateDir, "/Users/alice/.t3-fork/userdata");
    }),
  );

  // fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
  const assertRefused = (exit: Exit.Exit<unknown, unknown>) => {
    assert.isTrue(Exit.isFailure(exit));
    // Assert the intended refusal, not just any defect — a broken refusal
    // (e.g. calling a nonexistent API) would also surface as a failure.
    if (Exit.isFailure(exit)) {
      assert.include(String(Cause.squash(exit.cause)), "Refusing to start");
    }
  };

  it.effect("refuses upstream's ~/.t3 as an explicit home for non-development builds", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(makeEnvironment({}, { T3CODE_HOME: "/Users/alice/.t3" }));
      assertRefused(exit);
    }),
  );

  it.effect("refuses a literal, unexpanded ~/.t3", () =>
    Effect.gen(function* () {
      // The server child expands a leading "~" when it resolves T3CODE_HOME
      // itself, so a literal value must be judged by the server's semantics —
      // treating it as a cwd-relative path would skip the refusal while the
      // child opened the real database.
      const exit = yield* Effect.exit(makeEnvironment({}, { T3CODE_HOME: "~/.t3" }));
      assertRefused(exit);
    }),
  );

  it.effect("refuses case variants of upstream's base on case-insensitive platforms", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(makeEnvironment({}, { T3CODE_HOME: "/Users/alice/.T3" }));
      assertRefused(exit);
    }),
  );

  it.effect("refuses paths inside upstream's base, not just its root", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        makeEnvironment({}, { T3CODE_HOME: "/Users/alice/.t3/userdata" }),
      );
      assertRefused(exit);
    }),
  );

  it.effect("refuses upstream's ~/.t3 for packaged builds even in development", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        makeEnvironment(
          { isPackaged: true },
          { T3CODE_HOME: "/Users/alice/.t3", VITE_DEV_SERVER_URL: "http://localhost:5173" },
        ),
      );
      assertRefused(exit);
    }),
  );

  it.effect("still honors a custom explicit home that is not upstream's", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({}, { T3CODE_HOME: "/tmp/elsewhere" });
      assert.equal(environment.baseDir, "/tmp/elsewhere");
      assert.equal(environment.stateDir, "/tmp/elsewhere/userdata");
    }),
  );

  it.effect("expands a leading tilde in a custom home like the server does", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({}, { T3CODE_HOME: "~/custom-t3" });
      assert.equal(environment.baseDir, "/Users/alice/custom-t3");
      assert.equal(environment.stateDir, "/Users/alice/custom-t3/userdata");
    }),
  );

  it.effect("keeps a packaged build fork-owned even when a dev server URL is set", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        { isPackaged: true },
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      assert.equal(environment.baseDir, "/Users/alice/.t3-fork");
      assert.equal(environment.stateDir, "/Users/alice/.t3-fork/dev");
    }),
  );
  // fork:end fork-app-identity

  it.effect("uses a configured app user model id override", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_DESKTOP_APP_USER_MODEL_ID: " com.t3tools.t3code.dev.local ",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
        },
      );

      assert.equal(environment.appUserModelId, "com.t3tools.t3code.dev.local");
    }),
  );

  it.effect("resolves picker defaults without nullish sentinels", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment();

      assert.deepEqual(environment.resolvePickFolderDefaultPath(null), Option.none());
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: " " }),
        Option.none(),
      );
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: "~" }),
        Option.some("/Users/alice"),
      );
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: "~/project" }),
        Option.some("/Users/alice/project"),
      );
    }),
  );
});
