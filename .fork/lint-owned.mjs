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
  ".fork",
  "apps/web/fork",
  "apps/web/src/custom",
  "apps/web/src/overrides",
  "apps/web/src/__fork_guards__",
];

/**
 * Upstream-path files the fork has edited enough to own their lint output.
 *
 * The fork's largest authored surface is not the directories above — it is
 * hunks inside files at upstream paths, and a file-level scope cannot say "the
 * fork owns these lines but not this file". The nine dead imports that
 * motivated this gate lived here, in Sidebar.tsx, in unfenced lines the
 * sidebar extraction stranded. A gate that skipped this list would have
 * printed "no warnings" while all nine were live.
 *
 * Adoption means accepting that an upstream-authored warning in one of these
 * turns the build red. That is the ratchet risk §3 of the handoff argues
 * against for the repo at large, and it is acceptable here only because the
 * fork already maintains hunks in each of these and would have to act anyway.
 *
 * ThreadTerminalDrawer.tsx is deliberately absent despite carrying fork
 * fences: its one warning is an unused eslint-disable that is upstream's line,
 * under upstream's rule config, surfaced by upstream's own lint flag. Adopting
 * it would mean going red for something no fork change can fix.
 */
export const FORK_ADOPTED_FILES = [
  "apps/web/src/components/AppSidebarLayout.tsx",
  "apps/web/src/components/Sidebar.tsx",
  "apps/web/src/components/sidebar/SidebarChrome.tsx",
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
    // Not a silent empty list. A fork-owned directory that has moved or been
    // deleted must not quietly shrink the gate's scope — that is precisely the
    // "nothing noticed" failure this exists to prevent, relocated into the
    // gate's own configuration.
    throw new Error(`fork-owned directory is missing: ${absoluteDir}`);
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

  const fromAdopted = FORK_ADOPTED_FILES.map((relative) => {
    const absolute = NodePath.join(repoRoot, relative);
    if (!NodeFS.existsSync(absolute)) {
      throw new Error(`adopted file is missing: ${relative}`);
    }
    return absolute;
  });

  const relative = [...fromDirectories, ...fromManifest, ...fromAdopted].map((absolute) =>
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
    // --report-unused-disable-directives matches the repo's own `lint` script.
    // Without it the gate is strictly weaker than the lint it claims to
    // enforce: a stale suppression in fork-owned code would pass here and be
    // reported by `vp run lint`.
    ["lint", ...files, "--report-unused-disable-directives", "--format", "json"],
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

  // The verdict comes from the parsed report, which is precise about what and
  // where. But a non-zero exit with nothing to show for it means oxlint failed
  // in a way this script cannot see, and treating that as "no warnings" is the
  // exact shape that produces a false green. No such case has been reproduced;
  // this is a backstop, not a fix for an observed bug.
  if (result.status !== 0 && diagnostics.length === 0) {
    console.error(
      `fork-lint: vp lint exited ${result.status} but reported no diagnostics. ` +
        `Refusing to call that clean. Raw output follows.\n`,
    );
    console.error(result.stdout || result.stderr);
    process.exit(2);
  }

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
