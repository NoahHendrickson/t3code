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
    const workflow = readForkRelease();
    expect(workflow).toContain("--platform mac");
    expect(workflow).toContain("--arch arm64");
  });
});
