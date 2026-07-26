// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-desktop-release`.
 *
 * The fork's own release path. The build being correct is CI's job; what this
 * guards is the two properties that are dangerous to lose quietly:
 *
 *   1. It fires on `workflow_dispatch` and nothing else. A `schedule:` or
 *      `push:` trigger added here would publish releases from the fork
 *      unattended — the exact failure `release-upstream-only` exists to stop,
 *      reintroduced through the fork's own door.
 *   2. It never publishes to a package registry. Fork builds carry upstream's
 *      package names, so an `npm publish` here would push fork artifacts to
 *      upstream's namespace.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const readForkRelease = (): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/fork-release.yml"), "utf8");

/** The `on:` block, up to the next top-level key. */
const readTriggerBlock = (workflow: string): string => {
  const start = workflow.search(/^on:$/mu);
  const rest = workflow.slice(start + "on:\n".length);
  const end = rest.search(/^[A-Za-z]/mu);
  return end === -1 ? rest : rest.slice(0, end);
};

describe("fork guard: fork-desktop-release", () => {
  it("runs only when a human dispatches it", () => {
    const triggers = readTriggerBlock(readForkRelease())
      .split("\n")
      .filter((line) => /^ {2}\S/u.test(line))
      .map((line) => line.trim().replace(/:.*$/u, ""));
    expect(triggers).toEqual(["workflow_dispatch"]);
  });

  it("stays gated to the fork repository", () => {
    expect(readForkRelease()).toContain("github.repository == 'NoahHendrickson/t3code'");
  });

  it("never publishes to a package registry", () => {
    const workflow = readForkRelease();
    // `npm publish`, `pnpm publish`, `vp publish`, and the token that would
    // authenticate any of them.
    expect(workflow).not.toMatch(/\b(?:npm|pnpm|yarn|vp)\s+publish\b/u);
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
  });

  it("builds the artifact the release advertises", () => {
    // The release body promises a macOS arm64 build; if the build step is
    // retargeted without updating that text, users download the wrong thing.
    // `--target dmg` is additionally load-bearing for the launch isolation
    // gate: the build script expands dmg into [dmg, zip], and the gate
    // launches the DMG's bundle and compares the zip's executable against
    // it. Retargeting silently breaks artifact discovery — the failure mode
    // that cost the first v0.1.2 release run.
    const workflow = readForkRelease();
    expect(workflow).toContain("--platform mac");
    expect(workflow).toContain("--arch arm64");
    expect(workflow).toContain("--target dmg");
  });

  it("keeps the launch isolation gate and its negative assertions", () => {
    // The gate is the only executable proof of the fork's data isolation —
    // v0.1.1 passed every static check while its server child opened the
    // real ~/.t3/userdata database. Weakening or deleting this step must not
    // pass silently. Pin its presence, both halves of the positive assertion
    // (the fork base appears; the fork Electron dir appears), and the
    // violation branch that makes the negative assertions real.
    const workflow = readForkRelease();
    expect(workflow).toContain("Launch isolation check");
    expect(workflow).toContain(".t3-fork/userdata/state.sqlite");
    expect(workflow).toContain("ISOLATION VIOLATED");
    expect(workflow).toContain('"$support/t3code"');
    expect(workflow).toContain('"$support/t3code-fork"');
    // Publishing must be conditional on the gate: the gate step precedes the
    // collect step, and a dry run skips publishing but never the gate.
    expect(workflow.indexOf("Launch isolation check")).toBeLessThan(
      workflow.indexOf("Collect release assets"),
    );
    expect(workflow).toContain("dry_run");
  });
});
