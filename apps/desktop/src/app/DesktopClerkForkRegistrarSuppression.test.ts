/**
 * Fork-owned — see `.fork/customizations.yaml#fork-clerk-launch-resilience`.
 *
 * Keyed builds create the Clerk bridge, and @clerk/electron's
 * createClerkBridge unconditionally re-registers the renderer scheme's
 * privileges — a call that throws once Electron is "ready", and layer
 * construction can trail "ready" on a packaged boot (the v0.1.7 dry run's
 * launch isolation gate died there). main.ts registers the same privilege
 * set at module load, so createDesktopClerkBridge suppresses the bridge's
 * redundant registration for the duration of the call and restores the real
 * registrar after. Unlike DesktopClerkForkSkip.test.ts, this file bakes a
 * key in; unlike DesktopClerk.test.ts, it mocks electron so the suppression
 * has a real registrar to swap out.
 */

import { assert, describe, it } from "@effect/vitest";
import { beforeEach, vi } from "vite-plus/test";

const { createClerkBridgeMock, registerSchemesAsPrivilegedSpy, storageMock } = vi.hoisted(() => ({
  createClerkBridgeMock: vi.fn(),
  registerSchemesAsPrivilegedSpy: vi.fn(),
  storageMock: vi.fn(),
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__ =
    `pk_test_${btoa("clerk.t3.codes$")}`;
});

vi.mock("electron", () => ({
  protocol: { registerSchemesAsPrivileged: registerSchemesAsPrivilegedSpy },
}));

vi.mock("@clerk/electron", () => ({
  createClerkBridge: createClerkBridgeMock,
}));

vi.mock("@clerk/electron/storage", () => ({
  storage: storageMock,
}));

import * as Electron from "electron";
import * as DesktopClerk from "./DesktopClerk.ts";

describe("DesktopClerk keyed-build registrar suppression", () => {
  beforeEach(() => {
    createClerkBridgeMock.mockReset();
    registerSchemesAsPrivilegedSpy.mockClear();
    storageMock.mockReset();
    storageMock.mockReturnValue({
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("suppresses the bridge's scheme re-registration, then restores the registrar", () => {
    const bridge = { cleanup: vi.fn(), isPrimaryInstance: true };
    createClerkBridgeMock.mockImplementation(() => {
      // What @clerk/electron does unconditionally when given a renderer.
      // Post-"ready" this throws in a real boot; suppression makes it a
      // no-op instead.
      Electron.protocol.registerSchemesAsPrivileged([]);
      return bridge;
    });

    assert.equal(DesktopClerk.createDesktopClerkBridge("/tmp/t3-state", false), bridge);
    assert.equal(registerSchemesAsPrivilegedSpy.mock.calls.length, 0);

    // The real registrar is back once the bridge call returns.
    Electron.protocol.registerSchemesAsPrivileged([]);
    assert.equal(registerSchemesAsPrivilegedSpy.mock.calls.length, 1);
  });

  it("restores the registrar even when the bridge throws", () => {
    createClerkBridgeMock.mockImplementationOnce(() => {
      throw new Error("bridge initialization failed");
    });

    assert.throws(() => DesktopClerk.createDesktopClerkBridge("/tmp/t3-state", false));

    Electron.protocol.registerSchemesAsPrivileged([]);
    assert.equal(registerSchemesAsPrivilegedSpy.mock.calls.length, 1);
  });
});
