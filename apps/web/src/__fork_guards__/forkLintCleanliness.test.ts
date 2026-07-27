// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-lint-cleanliness`.
 *
 * The gate itself runs in CI, not here: linting 28 files is a multi-second
 * subprocess and this suite finishes 1600+ tests in about ten seconds. What
 * this guard covers is the part that fails *quietly* — the path selection. A
 * gate pointed at the wrong paths still exits 0, so "green" would mean
 * "inspected nothing" rather than "found nothing".
 *
 * So: assert the selection is right (cheap, pure, and the actual risk), and
 * assert the CI wiring that runs it still exists (the same shape ciOnCustom
 * uses). The expensive half stays where expensive checks already live.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// @ts-expect-error — plain .mjs module without type declarations, same as
// detect-drift.mjs next to it; its selection behaviour is what this exercises.
import { collectForkOwnedFiles, FORK_OWNED_DIRECTORIES } from "../../../../.fork/lint-owned.mjs";

const selectForkOwnedFiles = (manifest: string, root: string): readonly string[] =>
  collectForkOwnedFiles(manifest, root) as readonly string[];

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const manifestText = NodeFS.readFileSync(
  NodePath.join(repoRoot, ".fork/customizations.yaml"),
  "utf8",
);

describe("fork guard: fork-lint-cleanliness", () => {
  it("selects every fork-owned directory", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // `overrides/` holds only a README today, so requiring a hit from all three
    // would fail for a legitimate reason. Requiring the two that hold code
    // catches a selector that silently stopped matching.
    expect(files.some((file) => file.startsWith("apps/web/src/custom/"))).toBe(true);
    expect(files.some((file) => file.startsWith("apps/web/src/__fork_guards__/"))).toBe(true);
    expect(FORK_OWNED_DIRECTORIES).toContain("apps/web/src/overrides");
  });

  it("picks up fork-owned files the directories do not cover", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // A manifest `files:` entry outside the three directories. If the selector
    // ever collapsed to "just walk the directories", this is what would be lost.
    expect(files).toContain("apps/desktop/src/app/DesktopClerkForkSkip.test.ts");
  });

  it("lints only what can be linted", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // `files:` also lists .md, .png, .ico, .css, .yml and .sh. Handing oxlint a
    // PNG is not a hypothetical — nine such entries are in the manifest today.
    for (const file of files) {
      expect([".ts", ".tsx", ".mjs"]).toContain(NodePath.extname(file));
    }
  });

  it("covers the fork's own tooling", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // The gate holds itself to the standard it enforces. It did not at first:
    // a .ts-only filter meant the repo-wide lint caught a rule violation in
    // this script that the gate itself had passed over.
    expect(files).toContain(".fork/lint-owned.mjs");
  });

  it("never hands the same path over twice", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // Most `files:` entries live under a fork-owned directory, so duplicates
    // are the default failure. They do not produce a false green — oxlint
    // counts each occurrence, so the gate's file-count check still agrees —
    // but they duplicate work and inflate the reported coverage, which is
    // worth failing on precisely because nothing downstream would notice.
    expect(new Set(files).size).toBe(files.length);
  });

  it("keeps the gate wired into CI", () => {
    const ci = NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("fork:begin fork-lint-cleanliness");
    expect(ci).toContain("node .fork/lint-owned.mjs");
  });
});
