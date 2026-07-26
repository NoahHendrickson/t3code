// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-clerk-launch-resilience`.
 *
 * The renderer's scheme privileges are otherwise registered inside
 * @clerk/electron's createClerkBridge during Effect layer construction, which
 * races Electron's "ready" event; registerSchemesAsPrivileged throws once the
 * app is ready. CI runners lose that race deterministically — the v0.1.2
 * launch isolation gate caught the app exiting before its server started —
 * and a cold local boot rolls the same dice. Two hunks close it: main.ts
 * registers the scheme privileges synchronously at module load (guaranteed
 * pre-ready), and DesktopClerk degrades a bridge initialization failure to a
 * warning instead of crashing a build that has no cloud sign-in to lose.
 *
 * An upstream rework of either file could drop these hunks in a clean merge;
 * each assertion pins an executable line, not prose.
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

describe("fork guard: fork-clerk-launch-resilience", () => {
  it("registers scheme privileges synchronously at module load", () => {
    const main = read(MAIN);
    expect(main).toContain("Electron.protocol.registerSchemesAsPrivileged(");
    // Both schemes, no env sniffing — the winning bridge's own pre-ready
    // registration replaces the list with identical content for the active
    // scheme.
    expect(main).toContain(
      "[ElectronProtocol.getDesktopScheme(false), ElectronProtocol.getDesktopScheme(true)]",
    );
    // The registration must precede the runtime bootstrap that builds the
    // Clerk layer.
    expect(main.indexOf("registerSchemesAsPrivileged")).toBeLessThan(
      main.indexOf("NodeRuntime.runMain"),
    );
    // The privilege set mirrors @clerk/electron's — losing supportFetchAPI
    // or standard would break the renderer only on the degraded path, the
    // hardest place to notice.
    expect(main).toContain("supportFetchAPI: true");
    expect(main).toContain("standard: true");
  });

  it("degrades a failed Clerk bridge instead of refusing to start", () => {
    const clerk = read(DESKTOP_CLERK);
    expect(clerk).toContain('Effect.catchTag("DesktopClerkBridgeInitializationError"');
  });
});
