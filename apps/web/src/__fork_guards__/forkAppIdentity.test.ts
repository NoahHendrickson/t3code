// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-app-identity`.
 *
 * A packaged fork build must stay a *different application* from an installed
 * upstream release. Upstream derives these identities from `isDevelopment`,
 * and a fork release build is not a development build, so every one of them
 * collapses onto upstream's value unless the fork overrides it.
 *
 * The consequences of losing this quietly are not cosmetic: the build installs
 * over "T3 Code (Alpha).app", and on launch resolves to the same
 * ~/.t3/userdata holding the real app's state.sqlite, secrets and tokens.
 * An upstream rework of either file could drop these hunks in a clean merge,
 * so each one is asserted from both sides — the fork value present, and
 * upstream's shared production value absent.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const read = (relativePath: string): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");

const DESKTOP_ENVIRONMENT = "apps/desktop/src/app/DesktopEnvironment.ts";
const BUILD_SCRIPT = "scripts/build-desktop-artifact.ts";

describe("fork guard: fork-app-identity", () => {
  it("packages under a fork-owned bundle id", () => {
    const script = read(BUILD_SCRIPT);
    expect(script).toContain('const DESKTOP_APP_ID = "com.t3tools.t3code.fork"');
    // The exact upstream declaration, which would make macOS treat a fork
    // build as the same application as the installed release.
    expect(script).not.toContain('const DESKTOP_APP_ID = "com.t3tools.t3code"');
  });

  it("installs under a fork-owned app name", () => {
    const script = read(BUILD_SCRIPT);
    expect(script).toContain('"T3 Code Fork"');
    // Upstream reads productName from the desktop package.json ("T3 Code
    // (Alpha)") — the exact name of the installed release's bundle.
    expect(script).not.toContain("desktopPackageJson.productName");
  });

  it("keeps production state out of the shared userdata directory", () => {
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain('? "dev" : "userdata-fork"');
    expect(environment).not.toContain('? "dev" : "userdata"');
  });

  it("keeps production user data out of the shared electron directory", () => {
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain('isDevelopment ? "t3code-dev" : "t3code-fork"');
    expect(environment).not.toContain('isDevelopment ? "t3code-dev" : "t3code"');
  });

  it("never adopts upstream's legacy user data directory", () => {
    // resolveUserDataPath prefers the legacy directory whenever it exists, so
    // leaving this pointed at "T3 Code (Alpha)" would hand the fork the real
    // app's data even with every name above separated.
    // Matched as the whole ternary rather than a bare name, so the surrounding
    // comment explaining the hazard doesn't read as the hazard itself.
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain('isDevelopment ? "T3 Code (Dev)" : "T3 Code (Fork)"');
    expect(environment).not.toContain('isDevelopment ? "T3 Code (Dev)" : "T3 Code (Alpha)"');
  });

  it("registers a fork-owned app user model id", () => {
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain('"com.t3tools.t3code.fork"');
    expect(environment).not.toMatch(/:\s*"com\.t3tools\.t3code",/u);
  });

  it("leaves development paths alone", () => {
    // Renaming these would strand the dev state that exists today, and `vp dev`
    // in this repo is already the fork — there is nothing to collide with.
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain('"t3code-dev"');
    expect(environment).toContain('"T3 Code (Dev)"');
    expect(environment).toContain('"com.t3tools.t3code.dev"');
  });
});
