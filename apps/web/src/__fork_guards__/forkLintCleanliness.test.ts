// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-lint-cleanliness`.
 *
 * The gate itself runs in CI, not here: linting 37 files is a multi-second
 * subprocess and this suite finishes 1600+ tests in about ten seconds. What
 * this guard covers is the part that fails *quietly* — the path selection. A
 * gate pointed at the wrong paths still exits 0, so "green" would mean
 * "inspected nothing" rather than "found nothing".
 *
 * The scope is a hand-maintained list, and nothing reconciles it against the
 * tree. Review of #19 found three fork-owned surfaces missing from it on day
 * one — including the file that produced the very imports the gate was built
 * for. So the reconciliation tests below walk the tree independently and
 * demand the selection match, rather than trusting the list.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Namespace import kept on one line: @ts-expect-error applies to the line that
// follows it, and a multi-line named import puts the diagnostic on the `from`
// clause instead, leaving the directive itself unused.
// @ts-expect-error — plain .mjs module without type declarations, same as detect-drift.mjs beside it.
import * as LintOwned from "../../../../.fork/lint-owned.mjs";

const selectForkOwnedFiles = (manifest: string, root: string): readonly string[] =>
  LintOwned.collectForkOwnedFiles(manifest, root) as readonly string[];

const ownedDirectories = LintOwned.FORK_OWNED_DIRECTORIES as readonly string[];
const adoptedFiles = LintOwned.FORK_ADOPTED_FILES as readonly string[];

const LINTABLE = new Set([".ts", ".tsx", ".mjs"]);

/**
 * Deliberately a second implementation rather than a call into the gate's own
 * `walk`. Comparing the selector against itself would prove nothing; this
 * exists so a directory dropped from the scope list is caught by something
 * that did not read that list.
 */
const walkLintable = (absoluteDir: string): readonly string[] => {
  const out: string[] = [];
  for (const entry of NodeFS.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = NodePath.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkLintable(absolute));
    } else if (entry.isFile() && LINTABLE.has(NodePath.extname(entry.name))) {
      out.push(absolute);
    }
  }
  return out;
};

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const manifestText = NodeFS.readFileSync(
  NodePath.join(repoRoot, ".fork/customizations.yaml"),
  "utf8",
);

describe("fork guard: fork-lint-cleanliness", () => {
  it("keeps every declared fork-owned directory on disk", () => {
    // The gate throws on a missing directory rather than silently narrowing
    // its scope, but nothing else pins these paths: they are not manifest
    // entries, so customizationsManifest's "paths exist in the tree" check
    // does not reach them. `overrides/` in particular held only a README, so
    // an assertion that merely looked for selected files under it would have
    // stayed true after the directory was deleted.
    for (const directory of ownedDirectories) {
      expect(NodeFS.existsSync(NodePath.join(repoRoot, directory))).toBe(true);
    }
  });

  it("selects every lintable file under every fork-owned directory", () => {
    const files = new Set(selectForkOwnedFiles(manifestText, repoRoot));
    // Reconciliation, not spot-checking. Walks the tree independently and
    // demands the selection contain everything found, so dropping a directory
    // from the scope list fails here instead of silently shrinking coverage.
    for (const directory of ownedDirectories) {
      for (const absolute of walkLintable(NodePath.join(repoRoot, directory))) {
        expect(files).toContain(NodePath.relative(repoRoot, absolute));
      }
    }
  });

  it("covers the fork hunks that live at upstream paths", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // The gate's whole reason for existing. The nine dead imports it was built
    // for were in Sidebar.tsx — an upstream path, named in the manifest only
    // under watch:, which the selector does not read. Scoped to directories
    // alone this gate would have printed "no warnings" while all nine were
    // live, which is what review of #19 caught.
    expect(files).toContain("apps/web/src/components/Sidebar.tsx");
    for (const adopted of adoptedFiles) {
      expect(files).toContain(adopted);
    }
  });

  it("leaves upstream-manufactured warnings out of scope", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // ThreadTerminalDrawer.tsx carries fork fences but its only warning is an
    // unused eslint-disable on upstream's line, under upstream's rule config,
    // surfaced by upstream's own lint flag. Adopting it would mean going red
    // for something no fork change can fix — the ratchet this gate is scoped
    // to avoid. Pinned so adoption stays a deliberate act.
    expect(files).not.toContain("apps/web/src/components/ThreadTerminalDrawer.tsx");
  });

  it("picks up fork-owned files the directories do not cover", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // A manifest `files:` entry outside the fork-owned directories. If the
    // selector ever collapsed to "just walk the directories", this is lost.
    expect(files).toContain("apps/desktop/src/app/DesktopClerkForkSkip.test.ts");
  });

  it("lints only what can be linted", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // `files:` also lists .md, .png, .ico, .css, .yml and .sh. Handing oxlint a
    // PNG is not a hypothetical — nine such entries are in the manifest today.
    for (const file of files) {
      expect(LINTABLE.has(NodePath.extname(file))).toBe(true);
    }
  });

  it("covers the fork's own tooling", () => {
    const files = selectForkOwnedFiles(manifestText, repoRoot);
    // The gate holds itself to the standard it enforces. It did not at first:
    // a .ts-only filter meant the repo-wide lint caught a rule violation in
    // this script that the gate itself had passed over. And the comment
    // claiming detect-drift.mjs was covered was false until review checked it,
    // so both are pinned rather than one standing in for the pair.
    expect(files).toContain(".fork/lint-owned.mjs");
    expect(files).toContain(".fork/detect-drift.mjs");
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

  it("runs the gate as an unconditional step of the check job", () => {
    const ci = NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("fork:begin fork-lint-cleanliness");

    // Anchored to position, not presence. `toContain("node .fork/…")` stayed
    // true if the step were commented out, given `if: false`, or moved to a
    // job that does not run on pull_request — the same unfalsifiable shape as
    // the CLAUDE.md guard whose `.trim()` made it unable to fail. Slice the
    // check job out and assert the step lives inside it.
    const checkJob = /\n {2}check:\n([\s\S]*?)(?=\n {2}\w[\w-]*:\n)/u.exec(ci);
    expect(checkJob).not.toBeNull();
    const body = checkJob?.[1] ?? "";
    expect(body).toMatch(/- name: Lint fork-owned code\n\s+run: node \.fork\/lint-owned\.mjs\n/u);

    // And unconditional: a step carrying `if:` can be switched off without
    // this file changing.
    const step = /- name: Lint fork-owned code\n((?:\s+\w[\w-]*:.*\n)+)/u.exec(body);
    expect(step).not.toBeNull();
    expect(step?.[1] ?? "").not.toMatch(/^\s+if:/mu);
  });
});
