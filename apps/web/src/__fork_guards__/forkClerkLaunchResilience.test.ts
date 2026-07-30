// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-clerk-launch-resilience`.
 *
 * The renderer's scheme privileges are otherwise registered inside
 * @clerk/electron's createClerkBridge during Effect layer construction, which
 * races Electron's "ready" event; registerSchemesAsPrivileged throws once the
 * app is ready. CI runners lose that race deterministically — the v0.1.2
 * launch isolation gate caught the app exiting before its server started.
 * Three hunks close it: main.ts registers the scheme privileges
 * synchronously at module load, DesktopClerk skips the bridge entirely when
 * no publishable key is baked in, and createDesktopClerkBridge suppresses
 * the bridge's redundant re-registration in keyed builds (the v0.1.7 dry
 * run's launch isolation gate died on it post-"ready") — so main.ts is the
 * sole registrar on every path and keyed builds keep upstream's loud
 * failures.
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

const MAIN = "apps/desktop/src/main.ts";
const DESKTOP_CLERK = "apps/desktop/src/app/DesktopClerk.ts";

/** The fenced fork hunk in main.ts, so assertions cannot match prose. */
const readMainHunk = (): string => {
  const main = read(MAIN);
  const start = main.indexOf("// fork:begin fork-clerk-launch-resilience");
  const end = main.indexOf("// fork:end fork-clerk-launch-resilience");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("fork-clerk-launch-resilience hunk not found in main.ts");
  }
  return main.slice(start, end);
};

describe("fork guard: fork-clerk-launch-resilience", () => {
  it("registers scheme privileges at module load, before any layer or ready hook", () => {
    const main = read(MAIN);
    const hunk = readMainHunk();
    expect(hunk).toContain("Electron.protocol.registerSchemesAsPrivileged(");
    // Both schemes, no env sniffing.
    expect(hunk).toContain(
      "[ElectronProtocol.getDesktopScheme(false), ElectronProtocol.getDesktopScheme(true)]",
    );
    // Execution position, approximated hard: the registration precedes the
    // first layer definition, any whenReady mention, and the runtime
    // bootstrap. A copy of this code inside a ready callback or an uncalled
    // function would sit after these anchors.
    const registrationAt = main.indexOf("registerSchemesAsPrivileged");
    for (const anchor of ["Layer.unwrap", "NodeRuntime.runMain"]) {
      const anchorAt = main.indexOf(anchor);
      expect(anchorAt).toBeGreaterThan(-1);
      expect(registrationAt).toBeLessThan(anchorAt);
    }
    // The full privilege set @clerk/electron registers — losing any of these
    // breaks the renderer only on the keyless path, the hardest place to
    // notice. Asserted against the hunk, not the file, so comments can't
    // satisfy them.
    for (const privilege of [
      "standard: true",
      "secure: true",
      "supportFetchAPI: true",
      "corsEnabled: true",
      "stream: true",
    ]) {
      expect(hunk).toContain(privilege);
    }
    // The registration itself is guarded: before the Effect runtime exists, a
    // throw here would be a silent exit.
    expect(hunk).toContain("} catch (error) {");
  });

  it("skips the Clerk bridge when no publishable key is baked in", () => {
    const clerk = read(DESKTOP_CLERK);
    expect(clerk).toContain("desktopClerkFrontendApiHostname === undefined");
    expect(clerk).toContain("skipping the Clerk bridge");
    // Keyed builds keep upstream's loud failures — no catch may swallow the
    // bridge's initialization error.
    expect(clerk).not.toContain('catchTag("DesktopClerkBridgeInitializationError"');
  });

  it("makes main.ts the sole scheme registrar on keyed builds too", () => {
    const clerk = read(DESKTOP_CLERK);
    // The bridge's own registration is suppressed for the duration of the
    // createClerkBridge call and the real registrar restored in a finally.
    // Losing the no-op reintroduces the post-"ready" throw the v0.1.7 dry
    // run died on; losing the restore breaks any later registration.
    expect(clerk).toContain("protocol.registerSchemesAsPrivileged = () => {}");
    expect(clerk).toContain("} finally {");
    expect(clerk).toContain("protocol.registerSchemesAsPrivileged = registerSchemesAsPrivileged");
  });
});
