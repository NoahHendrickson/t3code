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
  readonly isDevelopment: boolean;
  readonly linuxWmClass: string;
  readonly linuxDesktopEntryName: string;
  readonly passwordStore: LinuxPasswordStoreSwitch | null;
}

/* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
   A packaged fork build registers and window-matches its own desktop entry,
   never an installed upstream release's. */
export const resolveLinuxDesktopEntryName = (isDevelopment: boolean): string =>
  isDevelopment ? "com.t3tools.T3Code.Development.desktop" : "com.t3tools.T3Code.Fork.desktop";
/* fork:end fork-app-identity */

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

const WAYLAND_COLOR_MANAGER_FEATURE = "WaylandWpColorManagerV1";

const featureListNames = (value: string | null): ReadonlyArray<string> =>
  (value ?? "").split(",").flatMap((entry) => entry.trim().match(/^\*?([^<:]+)/)?.[1] ?? []);

// A stale HYPRLAND_INSTANCE_SIGNATURE is often inherited into other desktops, so only
// trust the session's desktop names.
const isHyprlandSession = (env: NodeJS.ProcessEnv): boolean =>
  (trimNonEmpty(env.XDG_CURRENT_DESKTOP) ?? trimNonEmpty(env.XDG_SESSION_DESKTOP) ?? "")
    .split(":")
    .some((name) => name.trim().toLowerCase() === "hyprland");

const HyprctlVersionJson = fromLenientJson(
  Schema.Struct({
    version: Schema.String,
    tag: Schema.String,
    commit: Schema.String,
    dirty: Schema.Boolean,
  }),
);
const decodeHyprctlVersionJson = Schema.decodeSync(HyprctlVersionJson);

// Hyprland 0.48.0 added wp-color-manager-v1 (hyprwm/Hyprland#9444) advertising
// FEATURE_SET_PRIMARIES while rejecting set_primaries outside debug mode, which Chromium
// treats as a fatal protocol error. 0.51.0 accepts them (hyprwm/Hyprland#11499).
// Only stock builds of these releases count. Matching the commit as well as the tag
// keeps later development builds that still report an old VERSION and tag (Nix
// synthesizes `v${VERSION}`) on the default.
const AFFECTED_HYPRLAND_RELEASE_COMMITS: ReadonlyMap<string, string> = new Map([
  ["0.48.0", "5ee35f914f921e5696030698e74fb5566a804768"],
  ["0.48.1", "29e2e59fdbab8ed2cc23a20e3c6043d5decb5cdc"],
  ["0.49.0", "9958d297641b5c84dcff93f9039d80a5ad37ab00"],
  ["0.50.0", "c4a4c341568944bd4fb9cd503558b2de602c0213"],
  ["0.50.1", "4e242d086e20b32951fdc0ebcbfb4d41b5be8dcc"],
]);

const hasBrokenColorManager = (readHyprctlVersionJson: () => string): boolean => {
  try {
    const { version, tag, commit, dirty } = decodeHyprctlVersionJson(readHyprctlVersionJson());
    return (
      AFFECTED_HYPRLAND_RELEASE_COMMITS.get(version) === commit && tag === `v${version}` && !dirty
    );
  } catch {
    return false;
  }
};

export function resolveLinuxDisableFeaturesSwitch(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly ozonePlatform: string | null;
  readonly enableFeatures: string | null;
  readonly disableFeatures: string | null;
  readonly readHyprctlVersionJson: () => string;
}): string | null {
  if (input.ozonePlatform !== "wayland" || !isHyprlandSession(input.env)) return null;
  if (featureListNames(input.enableFeatures).includes(WAYLAND_COLOR_MANAGER_FEATURE)) return null;
  if (featureListNames(input.disableFeatures).includes(WAYLAND_COLOR_MANAGER_FEATURE)) return null;
  if (!hasBrokenColorManager(input.readHyprctlVersionJson)) return null;
  return input.disableFeatures === null
    ? WAYLAND_COLOR_MANAGER_FEATURE
    : `${input.disableFeatures},${WAYLAND_COLOR_MANAGER_FEATURE}`;
}

export function resolveEarlyLinuxElectronOptions(
  input: EarlyLinuxElectronOptionsInput,
): EarlyLinuxElectronOptions {
  const preference = resolveEarlyLinuxPasswordStorePreference(input);
  const isDevelopment = isDevelopmentEnvironment(input.env);
  return {
    /* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity */
    // A packaged fork build must window-match its own desktop entry
    // (StartupWMClass, written by build-desktop-artifact.ts). Upstream's
    // pre-ready refactor rederives the class here without reading
    // DesktopEnvironment.linuxWmClass, so the fork value has to be restated.
    isDevelopment,
    linuxWmClass: isDevelopment ? "t3code-dev" : "t3code-fork",
    /* fork:end fork-app-identity */
    linuxDesktopEntryName: resolveLinuxDesktopEntryName(isDevelopment),
    passwordStore: resolveLinuxPasswordStoreSwitch({
      preference,
      env: input.env,
    }),
  };
}

/** Remember the explicit Chromium scale across AppImage updates, which drop launch arguments. */
export function restoreEarlyLinuxDeviceScaleFactor(
  input: EarlyDesktopSettingsInput & {
    readonly commandLine: {
      readonly hasSwitch: (name: string) => boolean;
      readonly getSwitchValue: (name: string) => string;
      readonly appendSwitch: (name: string, value: string) => void;
    };
    readonly writeFileString: (path: string, value: string) => void;
  },
): void {
  // Keep this separate from desktop-settings.json: the settings service rewrites
  // that document, and Chromium needs the value before that service is available.
  const path = input.joinPath(
    resolveEarlyDesktopSettingsPath(input),
    "..",
    "linux-device-scale-factor",
  );
  const switchName = "force-device-scale-factor";
  const isValid = (value: string) =>
    value.trim().length > 0 && Number.isFinite(Number(value)) && Number(value) > 0;
  if (input.commandLine.hasSwitch(switchName)) {
    const value = input.commandLine.getSwitchValue(switchName);
    if (isValid(value)) {
      try {
        input.writeFileString(path, value);
      } catch {
        // A read-only state directory must not prevent startup with the explicit switch.
      }
    }
    return;
  }
  try {
    const value = input.readFileString(path).trim();
    if (isValid(value)) input.commandLine.appendSwitch(switchName, value);
  } catch {
    // First launch, missing state, or unreadable state: keep Chromium's default.
  }
}
