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

const readIsolationScript = (): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, ".github/scripts/launch-isolation-check.sh"), "utf8");

/** One step's YAML block: from its `- name:` line to the next `- name:`. */
const readStepBlock = (workflow: string, stepName: string): string => {
  const start = workflow.indexOf(`- name: ${stepName}`);
  if (start === -1) {
    throw new Error(`Step not found in fork-release.yml: ${stepName}`);
  }
  const rest = workflow.slice(start + 1);
  const end = rest.search(/^ {6}- name: /mu);
  return workflow.slice(start, end === -1 ? undefined : start + 1 + end);
};

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

  it("keeps the launch isolation gate wired ahead of publishing", () => {
    // The gate is the only executable proof of the fork's data isolation —
    // v0.1.1 passed every static check while its server child opened the
    // real ~/.t3/userdata database. Assert the wiring, not the words: the
    // gate step invokes the script, runs unconditionally (no `if:` — a dry
    // run exists to exercise it), and precedes Collect/Publish, which are
    // the only steps a dry run skips.
    const workflow = readForkRelease();
    const gate = readStepBlock(workflow, "Launch isolation check");
    expect(gate).toContain("bash .github/scripts/launch-isolation-check.sh release");
    expect(gate).not.toMatch(/^\s+if:/mu);
    // The lint lives in CI (release_smoke), where a defect in the script
    // costs a PR check, not a release build. The first dry run burned a full
    // build discovering the gate step itself couldn't run.
    const ci = NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("shellcheck .github/scripts/launch-isolation-check.sh");
    const collect = readStepBlock(workflow, "Collect release assets");
    const publish = readStepBlock(workflow, "Publish GitHub Release");
    expect(collect).toContain("${{ !inputs.dry_run }}");
    expect(publish).toContain("${{ !inputs.dry_run }}");
    expect(workflow.indexOf("Launch isolation check")).toBeLessThan(
      workflow.indexOf("Collect release assets"),
    );
  });

  it("keeps the isolation script's assertions intact", () => {
    // The script is code, not YAML prose — assert against its load-bearing
    // constructs. Comments in the script can't satisfy these: each string
    // pins an executable line (the trap wiring, the realpath normalization
    // that keeps pkill able to see the server child, the fail-fast and
    // positive assertions, the upstream-name sweep, and the violation
    // branch).
    const script = readIsolationScript();
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("pwd -P");
    expect(script).toContain('hdiutil attach "$dmg" -nobrowse -readonly');
    expect(script).toContain('"$scratch/.t3-fork/userdata/state.sqlite"');
    expect(script).toContain('violated "the build created ~/.t3"');
    expect(script).toContain('-name ".t3" -o -name "t3code" -o -name "com.t3tools.t3code"');
    expect(script).toContain('"$support/t3code-fork"');
    expect(script).toContain('pkill -TERM -f "$app/Contents"');
    expect(script).toContain('cmp -s "$app/Contents/Resources/app.asar"');
  });
});
