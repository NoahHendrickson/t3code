#!/usr/bin/env node
/**
 * Fork-owned lint gate — see `.fork/notes/FORK-LINT-GUARD-HANDOFF.md`.
 *
 * Usage: node .fork/lint-owned.mjs
 *
 * Lints every file the fork owns and fails on a single warning. Upstream's own
 * warnings are untouched: this never looks outside fork-owned paths, so an
 * upstream commit that adds a warning can never turn this red for code the
 * fork cannot fix. That is the whole reason it is scoped rather than a
 * repo-wide `--max-warnings`, which would ratchet against upstream and train
 * everyone to raise the number.
 *
 * Dependency-free by design, like detect-drift.mjs: it runs in a bare Actions
 * runner with no install step beyond what CI already does for `vp`.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { parseCustomizations } from "./detect-drift.mjs";

const FORK_DIR = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const REPO_ROOT = NodePath.resolve(FORK_DIR, "..");

/**
 * Directories the fork owns outright. Everything under them is fork-authored,
 * so all of it is in scope regardless of whether the manifest names each file.
 */
export const FORK_OWNED_DIRECTORIES = [
  "apps/web/src/custom",
  "apps/web/src/overrides",
  "apps/web/src/__fork_guards__",
];

/**
 * Only these are lintable. `files:` also lists .md, .png, .ico, .css, .yml and
 * .sh. `.mjs` is included so the fork's own tooling — this file and
 * detect-drift.mjs — is held to the standard it enforces on everything else;
 * the repo-wide lint does cover them, and it caught a namespace-node-imports
 * violation in this very script that an earlier `.ts`-only filter missed.
 */
const LINTABLE = new Set([".ts", ".tsx", ".mjs"]);

const isLintable = (path) => LINTABLE.has(NodePath.extname(path));

/**
 * oxlint prefixes its JSON with a human line ("No files found to lint…") when a
 * path is skipped, which is exactly the case this script most needs to read.
 * Parse from the first brace rather than assuming the payload starts at byte 0.
 */
const parseReport = (stdout) => {
  const start = stdout.indexOf("{");
  if (start === -1) {
    return undefined;
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return undefined;
  }
};

const walk = (absoluteDir) => {
  const out = [];
  if (!NodeFS.existsSync(absoluteDir)) {
    return out;
  }
  for (const entry of NodeFS.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = NodePath.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(absolute));
    } else if (entry.isFile() && isLintable(entry.name)) {
      out.push(absolute);
    }
  }
  return out;
};

/**
 * Every fork-owned lintable file, repo-relative and deduplicated.
 *
 * Most `files:` entries already live under a fork-owned directory, so a naive
 * concatenation hands oxlint the same path repeatedly. Measured: dropping the
 * dedup takes 29 paths to 39, and oxlint counts each occurrence rather than
 * collapsing them — so the file-count check below still agrees and the gate
 * still passes. The cost is duplicated work and a file count that overstates
 * what was actually covered, not a false green.
 */
export const collectForkOwnedFiles = (manifestText, repoRoot = REPO_ROOT) => {
  const fromDirectories = FORK_OWNED_DIRECTORIES.flatMap((directory) =>
    walk(NodePath.join(repoRoot, directory)),
  );
  const fromManifest = parseCustomizations(manifestText)
    .flatMap((entry) => entry.files)
    .filter(isLintable)
    .map((relative) => NodePath.join(repoRoot, relative))
    .filter((absolute) => NodeFS.existsSync(absolute));

  const relative = [...fromDirectories, ...fromManifest].map((absolute) =>
    NodePath.relative(repoRoot, absolute),
  );
  return [...new Set(relative)].sort();
};

function main() {
  const manifestText = NodeFS.readFileSync(NodePath.join(FORK_DIR, "customizations.yaml"), "utf8");
  const files = collectForkOwnedFiles(manifestText);

  if (files.length === 0) {
    console.error("fork-lint: no fork-owned files found — the path list is wrong, not clean.");
    process.exit(2);
  }

  const result = NodeChildProcess.spawnSync(
    "vp",
    ["lint", ...files, "--format", "json", "--max-warnings", "0"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  if (result.error) {
    console.error(`fork-lint: could not run vp lint — ${result.error.message}`);
    process.exit(2);
  }

  const report = parseReport(result.stdout);
  if (report === undefined) {
    console.error("fork-lint: could not parse oxlint JSON. Raw output follows.\n");
    console.error(result.stdout || result.stderr);
    process.exit(2);
  }

  // The check that keeps this honest. An explicitly-passed path that matches
  // `lint.ignorePatterns` is silently skipped — verified: oxlint reports
  // number_of_files 0 for one. Skip every path and it exits non-zero on its
  // own, but skip *some* and the rest lint clean and this would pass while
  // looking at less than it claims. Compare counts so that cannot happen.
  if (report.number_of_files !== files.length) {
    console.error(
      `fork-lint: expected to lint ${files.length} fork-owned files, oxlint reported ` +
        `${report.number_of_files}. Some path was skipped — most likely it now matches ` +
        `lint.ignorePatterns in vite.config.ts. Skipped paths:\n`,
    );
    for (const file of files) {
      const single = NodeChildProcess.spawnSync("vp", ["lint", file, "--format", "json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
      const singleReport = parseReport(single.stdout);
      if (singleReport === undefined || singleReport.number_of_files === 0) {
        console.error(`  - ${file}`);
      }
    }
    process.exit(1);
  }

  const diagnostics = report.diagnostics ?? [];
  if (diagnostics.length > 0) {
    console.error(
      `fork-lint: ${diagnostics.length} warning(s) in fork-owned code. The fork owns these ` +
        `files, so there is no upstream to wait for — fix them.\n`,
    );
    for (const diagnostic of diagnostics) {
      const span = diagnostic.labels?.[0]?.span;
      const where = span
        ? `${diagnostic.filename}:${span.line}:${span.column}`
        : diagnostic.filename;
      console.error(`  ${where}  ${diagnostic.code}  ${diagnostic.message}`);
    }
    process.exit(1);
  }

  console.log(`fork-lint: ${files.length} fork-owned files, no warnings.`);
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main();
}
