import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

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

const layerEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(NodeServices.layer, NodePath.layerPosix, DesktopConfig.layerTest(env)),
    ),
  );

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) => DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(layerEnvironment(overrides, env)));

describe("DesktopEnvironment", () => {
  it.effect("uses the packaged Windows server sidecar as the backend root", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({
        platform: "win32",
        isPackaged: true,
        appPath: "/install/resources/app.asar",
        resourcesPath: "/install/resources",
      });

      assert.equal(environment.appRoot, "/install/resources/app.asar");
      assert.equal(environment.serverRoot, "/install/resources/server.asar");
      assert.equal(
        environment.backendEntryPath,
        "/install/resources/server.asar/apps/server/dist/bin.mjs",
      );
      assert.equal(
        environment.clientAssetsDir,
        "/install/resources/server.asar/apps/server/dist/client",
      );
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
});
