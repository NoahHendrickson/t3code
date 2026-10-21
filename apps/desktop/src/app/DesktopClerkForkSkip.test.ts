/**
 * Fork-owned — see `.fork/customizations.yaml#fork-clerk-launch-resilience`.
 *
 * A build with no baked Clerk publishable key skips the bridge entirely:
 * createClerkBridge calls protocol.registerSchemesAsPrivileged, which throws
 * once Electron is "ready", and layer construction races that event — a race
 * a keyless build has nothing to win. Unlike DesktopClerk.test.ts, this file
 * deliberately does NOT define __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__, so the
 * module under test resolves no hostname and takes the skip path.
 *
 * Upstream takes Electron's single-instance lock itself, before the bridge
 * exists, so skipping the bridge must not skip the lock. The lock tests below
 * pin that on both outcomes — a suite that only checked the service exists
 * would pass with every keyless launch silently admitting a second instance.
 */

import { assert, describe, it } from "@effect/vitest";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import { beforeEach, vi } from "vite-plus/test";

const { createClerkBridgeMock, requestSingleInstanceLockMock, storageMock } = vi.hoisted(() => ({
  createClerkBridgeMock: vi.fn(),
  requestSingleInstanceLockMock: vi.fn(),
  storageMock: vi.fn(),
}));

vi.mock("electron", () => ({}));

vi.mock("@clerk/electron", () => ({
  createClerkBridge: createClerkBridgeMock,
}));

vi.mock("@clerk/electron/storage", () => ({
  storage: storageMock,
}));

import * as HostProcess from "@t3tools/shared/HostProcess";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopClerk from "./DesktopClerk.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopWebLinks from "./DesktopWebLinks.ts";

interface ConfigureProbe {
  readonly registeredEvents: string[];
  readonly quits: () => number;
  readonly electronApp: ElectronApp.ElectronApp["Service"];
}

function configureProbe(): ConfigureProbe {
  const registeredEvents: string[] = [];
  let quits = 0;
  const electronApp = {
    setPath: () => Effect.void,
    requestSingleInstanceLock: Effect.sync(() => requestSingleInstanceLockMock()),
    quit: Effect.sync(() => {
      quits += 1;
    }),
    on: (eventName: string) =>
      Effect.sync(() => {
        registeredEvents.push(eventName);
      }),
  } as unknown as ElectronApp.ElectronApp["Service"];
  return { registeredEvents, quits: () => quits, electronApp };
}

const makeDesktopClerkLayer = (electronApp: ElectronApp.ElectronApp["Service"]) => {
  const environment = DesktopEnvironment.DesktopEnvironment.of({
    stateDir: "/tmp/t3-state",
    isDevelopment: false,
    appDataDirectory: "/tmp/app-data",
    platform: "darwin",
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

  return DesktopClerk.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        NodePath.layerPosix,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, environment),
        Layer.succeed(ElectronApp.ElectronApp, electronApp),
        // The layer reads the shell for sign-in hand-offs; the skip path never
        // opens anything, so an inert stub is enough.
        Layer.succeed(ElectronShell.ElectronShell, {
          openExternal: () => Effect.succeed(true),
          openSystemSettings: () => Effect.succeed(false),
          copyText: () => Effect.void,
        }),
        FileSystem.layerNoop({ exists: () => Effect.succeed(false) }),
      ),
    ),
  );
};

const runConfigure = (probe: ConfigureProbe) =>
  Effect.exit(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(makeDesktopClerkLayer(probe.electronApp));
        const service = Context.get(context, DesktopClerk.DesktopClerk);
        yield* service.configure.pipe(
          Effect.provideService(ElectronApp.ElectronApp, probe.electronApp),
          Effect.provideService(
            ElectronWindow.ElectronWindow,
            {} as unknown as ElectronWindow.ElectronWindow["Service"],
          ),
          Effect.provideService(HostProcess.Arguments, ["t3"]),
          Effect.provideService(DesktopWebLinks.DesktopWebLinks, {
            receive: () => Effect.void,
          } as unknown as DesktopWebLinks.DesktopWebLinks["Service"]),
        );
      }),
    ),
  );

describe("DesktopClerk keyless-build skip", () => {
  beforeEach(() => {
    createClerkBridgeMock.mockReset();
    requestSingleInstanceLockMock.mockReset();
    storageMock.mockReset();
  });

  it.effect("skips the bridge, warns, and still provides the service", () => {
    const messages: unknown[] = [];
    const logger = Logger.make(({ message }) => {
      messages.push(message);
    });

    return Effect.gen(function* () {
      requestSingleInstanceLockMock.mockReturnValue(true);
      const probe = configureProbe();
      const context = yield* Effect.scoped(
        Layer.build(makeDesktopClerkLayer(probe.electronApp)),
      ).pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));

      // The bridge was never attempted — the skip is deterministic, not a
      // survived failure.
      assert.equal(createClerkBridgeMock.mock.calls.length, 0);
      assert.equal(storageMock.mock.calls.length, 0);
      // The skip is reported: this warning is the sole signal that cloud
      // sign-in is off.
      assert.isTrue(
        messages.some((message) => String(message).includes("skipping the Clerk bridge")),
      );
      const service = Context.get(context, DesktopClerk.DesktopClerk);
      assert.isDefined(service.configure);
    });
  });

  it.effect("still takes the lock and keeps the primary instance running", () =>
    Effect.gen(function* () {
      requestSingleInstanceLockMock.mockReturnValue(true);
      const probe = configureProbe();

      const exit = yield* runConfigure(probe);

      // The lock does not ride on the bridge, so the keyless path must still
      // have asked Electron for it.
      assert.equal(requestSingleInstanceLockMock.mock.calls.length, 1);
      assert.isTrue(Exit.isSuccess(exit));
      assert.equal(probe.quits(), 0);
      // Deep-link forwarding survives the degraded path: the primary still
      // listens for provider auth hand-offs and second instances.
      assert.includeMembers(probe.registeredEvents, ["second-instance", "open-url"]);
    }),
  );

  it.effect("quits and interrupts bootstrap when another instance holds the lock", () =>
    Effect.gen(function* () {
      requestSingleInstanceLockMock.mockReturnValue(false);
      const probe = configureProbe();

      const exit = yield* runConfigure(probe);

      assert.equal(requestSingleInstanceLockMock.mock.calls.length, 1);
      // The secondary instance stops bootstrap before whenReady can fire:
      // quit, then interrupt — and never registers a handler.
      assert.equal(probe.quits(), 1);
      assert.isTrue(Exit.hasInterrupts(exit));
      assert.deepEqual(probe.registeredEvents, []);
    }),
  );
});
