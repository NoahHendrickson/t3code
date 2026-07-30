import { createClerkBridge } from "@clerk/electron";
import { storage } from "@clerk/electron/storage";
// fork:begin fork-clerk-launch-resilience — see .fork/customizations.yaml#fork-clerk-launch-resilience
import * as Electron from "electron";
// fork:end fork-clerk-launch-resilience
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import { clerkFrontendApiHostnameFromPublishableKey } from "@t3tools/shared/relayAuth";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

declare const __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__: string | undefined;

export class DesktopClerkBridgeInitializationError extends Schema.TaggedErrorClass<DesktopClerkBridgeInitializationError>()(
  "DesktopClerkBridgeInitializationError",
  {
    stateDir: Schema.String,
    isDevelopment: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to initialize the desktop Clerk bridge for state directory "${this.stateDir}" (development: ${this.isDevelopment}).`;
  }
}

export class DesktopClerkBridgeCleanupError extends Schema.TaggedErrorClass<DesktopClerkBridgeCleanupError>()(
  "DesktopClerkBridgeCleanupError",
  {
    stateDir: Schema.String,
    isDevelopment: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to clean up the desktop Clerk bridge for state directory "${this.stateDir}" (development: ${this.isDevelopment}).`;
  }
}

export class DesktopClerk extends Context.Service<
  DesktopClerk,
  {
    readonly configure: Effect.Effect<
      void,
      never,
      ElectronApp.ElectronApp | ElectronWindow.ElectronWindow | Scope.Scope
    >;
  }
>()("@t3tools/desktop/app/DesktopClerk") {}

export function resolveDesktopClerkFrontendApiHostname(
  publishableKey: string | undefined,
): string | undefined {
  const normalizedKey = publishableKey?.trim();
  if (!normalizedKey) return undefined;

  try {
    return clerkFrontendApiHostnameFromPublishableKey(normalizedKey);
  } catch {
    return undefined;
  }
}

export const desktopClerkFrontendApiHostname = resolveDesktopClerkFrontendApiHostname(
  typeof __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__ === "undefined"
    ? undefined
    : __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__,
);

export function createDesktopClerkBridge(stateDir: string, isDevelopment: boolean) {
  // fork:begin fork-clerk-launch-resilience — main.ts is the sole scheme registrar
  // main.ts already registered both renderer schemes' privileges at module
  // load with the exact set the bridge would ask for, so the bridge's own
  // registerSchemesAsPrivileged call adds nothing — and throws once Electron
  // is "ready", which layer construction can trail on a packaged boot (the
  // v0.1.7 dry run's launch isolation gate died exactly there). No-op the
  // registrar for the duration of the bridge call; everything else the
  // bridge does (token persistence, OAuth transport, passkeys) is untouched.
  // The optional reads are for unit tests, which import this module in plain
  // Node where the electron shim exposes no protocol object.
  const protocol = Electron.protocol as typeof Electron.protocol | undefined;
  const registerSchemesAsPrivileged = protocol?.registerSchemesAsPrivileged;
  if (protocol && registerSchemesAsPrivileged) {
    protocol.registerSchemesAsPrivileged = () => {};
  }
  try {
    // fork:end fork-clerk-launch-resilience
    return createClerkBridge({
      storage: storage({ path: stateDir }),
      passkeys: true,
      renderer: {
        scheme: ElectronProtocol.getDesktopScheme(isDevelopment),
        host: ElectronProtocol.DESKTOP_HOST,
      },
    });
    // fork:begin fork-clerk-launch-resilience — restore the real registrar
  } finally {
    if (protocol && registerSchemesAsPrivileged) {
      protocol.registerSchemesAsPrivileged = registerSchemesAsPrivileged;
    }
  }
  // fork:end fork-clerk-launch-resilience
}

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  // fork:begin fork-clerk-launch-resilience — see .fork/customizations.yaml#fork-clerk-launch-resilience
  // A build with no baked Clerk publishable key cannot sign in, so the
  // bridge is guaranteed dead weight — and a live hazard: createClerkBridge
  // calls protocol.registerSchemesAsPrivileged, which throws once Electron
  // is "ready", and layer construction races that event (CI runners lose
  // deterministically; a cold local boot rolls the same dice). Skip the
  // bridge outright when there is no key: deterministic, and the renderer's
  // scheme privileges come from main.ts's synchronous registration, which is
  // the sole registrar on this path. Keyed builds keep upstream's bridge —
  // including loud initialization AND cleanup failures, which must stay
  // fatal there rather than hide behind a warning — except its redundant
  // scheme re-registration, which createDesktopClerkBridge above suppresses
  // so a post-"ready" layer build cannot die on it. The singleton-lock
  // behavior in configure below is bridge-independent either way.
  if (desktopClerkFrontendApiHostname === undefined) {
    yield* Effect.logWarning(
      "No Clerk publishable key in this build; skipping the Clerk bridge (cloud sign-in unavailable).",
    );
  } else {
    // fork:end fork-clerk-launch-resilience
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => createDesktopClerkBridge(environment.stateDir, environment.isDevelopment),
        catch: (cause) =>
          new DesktopClerkBridgeInitializationError({
            stateDir: environment.stateDir,
            isDevelopment: environment.isDevelopment,
            cause,
          }),
      }),
      (bridge) =>
        Effect.try({
          try: () => bridge.cleanup(),
          catch: (cause) =>
            new DesktopClerkBridgeCleanupError({
              stateDir: environment.stateDir,
              isDevelopment: environment.isDevelopment,
              cause,
            }),
        }).pipe(Effect.orDie),
    );
    // fork:begin fork-clerk-launch-resilience — close the keyless-skip branch
  }
  // fork:end fork-clerk-launch-resilience

  return DesktopClerk.of({
    configure: Effect.gen(function* () {
      const electronApp = yield* ElectronApp.ElectronApp;
      const electronWindow = yield* ElectronWindow.ElectronWindow;
      const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
      const runPromise = Effect.runPromiseWith(context);

      if (!(yield* electronApp.requestSingleInstanceLock)) {
        yield* electronApp.quit;
        return yield* Effect.interrupt;
      }

      yield* electronApp.on("second-instance", () => {
        void runPromise(
          Effect.gen(function* () {
            const mainWindow = yield* electronWindow.currentMainOrFirst;
            if (Option.isSome(mainWindow)) {
              yield* electronWindow.reveal(mainWindow.value);
            }
          }),
        );
      });
    }).pipe(Effect.withSpan("desktop.clerk.configure")),
  });
});

export const layer = Layer.effect(DesktopClerk, make);
