import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  DEFAULT_LINUX_PASSWORD_STORE,
  normalizeLinuxPasswordStorePreference,
  resolveLinuxPasswordStoreSwitch,
  type LinuxPasswordStoreSwitch,
  type LinuxPasswordStorePreference,
} from "../linuxSecretStorage.ts";
import { resolveDesktopStateDir, type JoinPath } from "./DesktopStatePaths.ts";

interface EarlyDesktopSettingsInput {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly readFileString: (path: string) => string;
  /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
  // A packaged build is fork-owned even when a dev-server URL leaks into its
  // environment — same carve-out DesktopEnvironment applies. Optional so the
  // pure module's tests stay unchanged; the one Electron caller passes it.
  readonly isPackaged?: boolean;
  /* fork:end fork-app-identity */
}

type EarlyLinuxElectronOptionsInput = EarlyDesktopSettingsInput;

export interface EarlyLinuxElectronOptions {
  readonly linuxWmClass: string;
  readonly passwordStore: LinuxPasswordStoreSwitch | null;
}

const trimNonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const EarlyDesktopSettingsJson = fromLenientJson(
  Schema.Struct({
    linuxPasswordStore: Schema.optionalKey(Schema.Unknown),
  }),
);
const decodeEarlyDesktopSettingsJson = Schema.decodeSync(EarlyDesktopSettingsJson);

const isDevelopmentEnvironment = (env: NodeJS.ProcessEnv): boolean =>
  trimNonEmpty(env.VITE_DEV_SERVER_URL) !== null;

/* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
// Mirrors DesktopEnvironment's fork base-dir resolution so the pre-ready
// settings read and the app proper agree on one directory. An explicit
// T3CODE_HOME (trimmed, "~" expanded the way the server child expands it)
// wins; an unpackaged development run keeps upstream's ~/.t3; anything else
// is fork-owned under ~/.t3-fork. Upstream's resolveDesktopBaseDir defaults
// to ~/.t3 unconditionally — routing through it here made this read an
// installed upstream release's desktop-settings.json on packaged builds.
// The ~/.t3 refusal itself stays in DesktopEnvironment: a refused
// configuration dies at startup moments after this read, so nothing acted on
// the wrong value for longer than the splash.
function resolveEarlyForkBaseDir(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly isPackaged?: boolean;
  readonly joinPath: JoinPath;
}): string {
  const configured = trimNonEmpty(input.env.T3CODE_HOME);
  if (configured !== null) {
    return configured === "~"
      ? input.homeDirectory
      : configured.startsWith("~/") || configured.startsWith("~\\")
        ? input.joinPath(input.homeDirectory, configured.slice(2))
        : configured;
  }
  const isUnpackagedDevelopment = isDevelopmentEnvironment(input.env) && input.isPackaged !== true;
  return input.joinPath(input.homeDirectory, isUnpackagedDevelopment ? ".t3" : ".t3-fork");
}
/* fork:end fork-app-identity */

function resolveEarlyDesktopSettingsPath(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
  readonly isPackaged?: boolean;
  /* fork:end fork-app-identity */
}): string {
  const t3Home = Option.fromUndefinedOr(input.env.T3CODE_HOME);
  /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
  const baseDir = resolveEarlyForkBaseDir(input);
  /* fork:end fork-app-identity */
  const stateDir = resolveDesktopStateDir({
    baseDir,
    isDevelopment: isDevelopmentEnvironment(input.env),
    joinPath: input.joinPath,
    t3Home,
  });
  return input.joinPath(stateDir, "desktop-settings.json");
}

export function resolveEarlyLinuxPasswordStorePreference(
  input: EarlyDesktopSettingsInput,
): LinuxPasswordStorePreference {
  const settingsPath = resolveEarlyDesktopSettingsPath(input);
  try {
    const parsed = decodeEarlyDesktopSettingsJson(input.readFileString(settingsPath));
    return normalizeLinuxPasswordStorePreference(parsed.linuxPasswordStore);
  } catch {
    return DEFAULT_LINUX_PASSWORD_STORE;
  }
}

export function resolveEarlyLinuxElectronOptions(
  input: EarlyLinuxElectronOptionsInput,
): EarlyLinuxElectronOptions {
  const preference = resolveEarlyLinuxPasswordStorePreference(input);
  return {
    /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
    // A packaged fork build must window-match its own t3code-fork.desktop
    // (StartupWMClass, written by build-desktop-artifact.ts). Upstream's
    // pre-ready refactor rederives the class here without reading
    // DesktopEnvironment.linuxWmClass, so the fork value has to be restated.
    linuxWmClass: isDevelopmentEnvironment(input.env) ? "t3code-dev" : "t3code-fork",
    /* fork:end fork-app-identity */
    passwordStore: resolveLinuxPasswordStoreSwitch({
      preference,
      env: input.env,
    }),
  };
}
