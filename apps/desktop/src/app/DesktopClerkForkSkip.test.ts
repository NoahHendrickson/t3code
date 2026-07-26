/**
 * Fork-owned — see `.fork/customizations.yaml#fork-clerk-launch-resilience`.
 *
 * A build with no baked Clerk publishable key skips the bridge entirely:
 * createClerkBridge calls protocol.registerSchemesAsPrivileged, which throws
 * once Electron is "ready", and layer construction races that event — a race
 * a keyless build has nothing to win. Unlike DesktopClerk.test.ts, this file
 * deliberately does NOT define __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__, so the
 * module under test resolves no hostname and takes the skip path.
 */

import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import { vi } from "vite-plus/test";

const { createClerkBridgeMock, storageMock } = vi.hoisted(() => ({
  createClerkBridgeMock: vi.fn(),
  storageMock: vi.fn(),
}));

vi.mock("@clerk/electron", () => ({
  createClerkBridge: createClerkBridgeMock,
}));

vi.mock("@clerk/electron/storage", () => ({
  storage: storageMock,
}));

import * as DesktopClerk from "./DesktopClerk.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const makeDesktopClerkLayer = () => {
  const environment = DesktopEnvironment.DesktopEnvironment.of({
    stateDir: "/tmp/t3-state",
    isDevelopment: false,
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

  return DesktopClerk.layer.pipe(
    Layer.provide(Layer.succeed(DesktopEnvironment.DesktopEnvironment, environment)),
  );
};

describe("DesktopClerk keyless-build skip", () => {
  it.effect("skips the bridge, warns, and still provides the service", () => {
    const messages: unknown[] = [];
    const logger = Logger.make(({ message }) => {
      messages.push(message);
    });

    return Effect.gen(function* () {
      const context = yield* Effect.scoped(Layer.build(makeDesktopClerkLayer())).pipe(
        Effect.provide(Logger.layer([logger], { mergeWithExisting: false })),
      );

      // The bridge was never attempted — the skip is deterministic, not a
      // survived failure.
      assert.equal(createClerkBridgeMock.mock.calls.length, 0);
      assert.equal(storageMock.mock.calls.length, 0);
      // The skip is reported: this warning is the sole signal that cloud
      // sign-in is off.
      assert.isTrue(
        messages.some((message) => String(message).includes("skipping the Clerk bridge")),
      );
      // The service is still provided; its bridge-independent configure
      // (single-instance lock) must keep working on the degraded path.
      const service = Context.get(context, DesktopClerk.DesktopClerk);
      assert.isDefined(service.configure);
    });
  });
});
