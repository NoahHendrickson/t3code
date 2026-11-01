// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#ci-on-custom`.
 *
 * Upstream's CI triggers on pull_request and pushes to main; this fork
 * instead validates pushes to `custom` — and deliberately not `main`, which
 * is a pure upstream mirror (upstream CI already ran) whose hourly mirror
 * pushes authenticate with a deploy key that, unlike GITHUB_TOKEN, triggers
 * push workflows. The hunk is a Tier-4 inline edit to an upstream workflow
 * file, so an upstream rework of ci.yml could silently drop it in a "clean"
 * merge.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("fork guard: ci-on-custom", () => {
  const readPushBranches = (): readonly string[] => {
    const ci = NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    // The push trigger's branch list: `- <name>` lines (comments excluded)
    // between `branches:` and the next key at equal-or-lower indentation.
    const block = /push:\s*\n\s+branches:\s*\n((?:\s+(?:#.*|- \S+)\n)*)/u.exec(ci);
    if (block?.[1] === undefined) return [];
    return [...block[1].matchAll(/^\s+- (\S+)$/gmu)].flatMap((match) => match[1] ?? []);
  };

  it("keeps the custom branch in CI's push triggers", () => {
    expect(readPushBranches()).toContain("custom");
  });

  it("keeps main out of CI's push triggers", () => {
    // main is a pure upstream mirror; its hourly deploy-key pushes would
    // otherwise schedule a redundant full CI run (macOS jobs included).
    expect(readPushBranches()).not.toContain("main");
  });

  it("compares the agent context budget with the PR's base, not main", () => {
    const gate = NodeFS.readFileSync(
      NodePath.join(repoRoot, ".github/workflows/agent-context-budget.yml"),
      "utf8",
    );
    expect(gate).toContain("BASE_REF: ${{ github.base_ref }}");
    expect(gate).toContain('git fetch --quiet --depth=1 origin "$BASE_REF"');
    expect(gate).not.toContain("git fetch --quiet --depth=1 origin main");
  });

  it("defaults check:changed to custom, not main", () => {
    const script = NodeFS.readFileSync(NodePath.join(repoRoot, "scripts/check-changed.ts"), "utf8");
    expect(script).toContain('"origin/custom"');
    expect(script).not.toContain('"origin/main"');
  });
});
