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
 *
 * Filesystem isolation is forked at the *base* directory (~/.t3-fork), not the
 * "userdata" leaf. The packaged app is two processes: the desktop resolves its
 * own state directory, and the bundled server child re-derives its own from
 * the bootstrap t3Home. A leaf rename in the desktop alone shipped in v0.1.1
 * and passed every static check here while the server child opened the real
 * ~/.t3/userdata/state.sqlite read-write — see
 * .fork/notes/FORK-DATA-ISOLATION-HANDOFF.md. The guards below therefore pin the whole
 * chain: the fork's base directory, the t3Home handoff, and both halves
 * appending upstream's own leaves to that one input.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_APP_BASE_NAME } from "../custom/forkBranding";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const read = (relativePath: string): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");

const DESKTOP_ENVIRONMENT = "apps/desktop/src/app/DesktopEnvironment.ts";
const DESKTOP_BACKEND_CONFIGURATION = "apps/desktop/src/backend/DesktopBackendConfiguration.ts";
const SERVER_CONFIG = "apps/server/src/config.ts";
const BUILD_SCRIPT = "scripts/build-desktop-artifact.ts";
const FORK_RELEASE_WORKFLOW = ".github/workflows/fork-release.yml";

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
    expect(script).toContain('"no3y Code"');
    // Upstream reads productName from the desktop package.json ("T3 Code
    // (Alpha)") — the exact name of the installed release's bundle.
    expect(script).not.toContain("desktopPackageJson.productName");
  });

  it("brands the rendered app as the fork, not upstream", () => {
    // The packaged build gets its name over the desktop bridge, so this
    // fallback is the only thing a dev or hosted session has. Upstream's is
    // "T3 Code" — leaving it meant every dev session ran under upstream's name
    // while the installed app ran under the fork's, which is precisely the
    // confusion the rename was asked for.
    expect(FORK_APP_BASE_NAME).toBe("no3y Code");
    const branding = read("apps/web/src/branding.ts");
    expect(branding).toContain("?? FORK_APP_BASE_NAME");
    expect(branding).not.toContain('?? "T3 Code"');
  });

  it("shows that name in the sidebar rather than upstream's wordmark", () => {
    const chrome = read("apps/web/src/components/sidebar/SidebarChrome.tsx");
    expect(chrome).toContain("{APP_BASE_NAME}");
    // The borrowed T3 glyph, which read as a mismatch beside a different name.
    expect(chrome).not.toContain("T3Wordmark");
  });

  it("keeps the release workflow on the fork's install name", () => {
    // fork-release.yml is fork-owned (see fork-desktop-release), so upstream
    // drift-watching can never catch it going stale against this
    // customization's naming — and it did go stale: v0.1.1's release notes
    // told users to de-quarantine "T3 Code (Alpha).app", a bundle the fork
    // never installs as. Pin the strings that must track the product name.
    const workflow = read(FORK_RELEASE_WORKFLOW);
    expect(workflow).toContain('"/Applications/no3y Code.app"');
    expect(workflow).toContain("name: no3y Code");
    // The install-path shape specifically: a "T3 Code Fork.app" mention
    // survives legitimately in the v0.1.1 cleanup instructions.
    expect(workflow).not.toContain("/Applications/T3 Code");
  });

  it("packages with the fork's own artwork", () => {
    // Upstream art would make a fork build indistinguishable from the real
    // app in the Dock and /Applications, exactly where the two must be
    // tell-apart-able. Desktop icons and bundled splash/favicon come from
    // assets/fork; packaging must not fall back to upstream channel art.
    const script = read(BUILD_SCRIPT);
    expect(script).toContain('"assets/fork/n3-macos-1024.png"');
    expect(script).toContain('"assets/fork/n3-universal-1024.png"');
    expect(script).toContain('"assets/fork/n3-windows.ico"');
    expect(script).toContain('"assets/fork/n3-web-favicon.ico"');
    expect(script).toContain("applyForkWebBrandAssets");
    expect(script).not.toContain("BRAND_ASSET_PATHS.productionMacIconPng");
    expect(script).not.toContain("BRAND_ASSET_PATHS.nightlyMacIconPng");
    expect(script).not.toContain("applyWebBrandAssets(");

    const launcher = read("apps/desktop/scripts/electron-launcher.mjs");
    expect(launcher).toContain('"fork"');
    expect(launcher).toContain('"n3-macos-1024.png"');
    expect(launcher).not.toContain("blueprint-macos-1024.png");

    // Dev (`vp run dev`) serves apps/web/public — keep it byte-identical to
    // the fork sources so local tabs don't silently fall back to T3 blueprint.
    for (const [source, target] of [
      ["assets/fork/n3-web-favicon.ico", "apps/web/public/favicon.ico"],
      ["assets/fork/n3-web-favicon-16x16.png", "apps/web/public/favicon-16x16.png"],
      ["assets/fork/n3-web-favicon-32x32.png", "apps/web/public/favicon-32x32.png"],
      ["assets/fork/n3-web-apple-touch-180.png", "apps/web/public/apple-touch-icon.png"],
    ] as const) {
      expect(NodeFS.readFileSync(NodePath.join(repoRoot, target))).toEqual(
        NodeFS.readFileSync(NodePath.join(repoRoot, source)),
      );
    }
  });

  it("keeps packaged state out of the shared ~/.t3 base directory", () => {
    const environment = read(DESKTOP_ENVIRONMENT);
    // The condition and the refusal below share these two named inputs; the
    // complement relationship between them is load-bearing, so pin the names
    // rather than hand-maintained boolean algebra.
    expect(environment).toContain(
      "const isUnpackagedDevelopment = isDevelopment && !input.isPackaged",
    );
    expect(environment).toContain(
      'isUnpackagedDevelopment ? upstreamBaseDir : path.join(homeDirectory, ".t3-fork")',
    );
    // The exact upstream default, which resolves a packaged fork build to the
    // installed release's ~/.t3 — the directory holding its live database.
    expect(environment).not.toContain('() => path.join(homeDirectory, ".t3"))');
  });

  it("fails loudly when T3CODE_HOME points at upstream's ~/.t3", () => {
    // An explicit T3CODE_HOME wins over the fork default on both halves of
    // the app, so ~/.t3 in the environment would put the fork back on the
    // real app's live database — the one remaining path to the v0.1.1
    // incident. The environment must refuse it rather than silently share a
    // SQLite file with another running application. The behavioral assertions
    // live in DesktopEnvironment.test.ts; this pins the refusal's existence
    // against an upstream merge dropping the hunk.
    const environment = read(DESKTOP_ENVIRONMENT);
    expect(environment).toContain("Refusing to start");
  });

  it("derives desktop and server state from the same base directory", () => {
    // The isolation rests on one invariant: the desktop's baseDir is the single
    // input — handed to the server child as bootstrap t3Home — and both sides
    // append upstream's own leaves to it. A fork-side leaf rename breaks this
    // silently: the desktop writes the renamed directory while the server
    // child, which owns state.sqlite, re-derives upstream's and opens the real
    // database. That exact bug shipped in v0.1.1 and passed this guard's
    // previous, desktop-only assertions.
    const environment = read(DESKTOP_ENVIRONMENT);
    const backendConfiguration = read(DESKTOP_BACKEND_CONFIGURATION);
    const serverConfig = read(SERVER_CONFIG);
    // The desktop hands the server its own baseDir, nothing narrower.
    expect(backendConfiguration).toContain("t3Home: environment.baseDir");
    // Both halves append the same upstream leaf to that one input.
    expect(environment).toContain('? "dev" : "userdata"');
    expect(serverConfig).toContain('? "dev" : "userdata"');
    expect(environment).not.toContain('"userdata-fork"');
    // The server also derives its shared sibling directories from baseDir, so
    // forking the base isolates caches/ and worktrees/ too. If upstream stops
    // deriving any of these from baseDir, the fork must notice.
    expect(serverConfig).toContain('join(baseDir, "caches")');
    expect(serverConfig).toContain('join(baseDir, "worktrees")');
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
