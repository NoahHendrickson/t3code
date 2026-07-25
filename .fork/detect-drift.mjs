#!/usr/bin/env node
/**
 * Drift detector — Layer 1 of the sync automation, see `.fork/README.md` §5.
 *
 * Usage: node .fork/detect-drift.mjs <changed-files.txt>
 *
 * Reads `.fork/customizations.yaml` and prints a markdown report of every
 * customization whose watched upstream files (`shadows:` + `watch:`) appear
 * in the changed-file list. Prints nothing when there is no drift; the caller
 * decides what to do with a non-empty report.
 *
 * Dependency-free by design: it runs in a bare Actions runner and in a guard
 * test, with no install step. The manifest format it understands is the
 * constrained subset documented at the top of customizations.yaml.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const LIST_KEYS = new Set(["files", "shadows", "watch", "verify"]);

export function parseCustomizations(yamlText) {
  const entries = [];
  let current = null;
  let currentKey = null;

  for (const rawLine of yamlText.split("\n")) {
    const line = rawLine.replace(/\s+$/u, "");
    if (line === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const idMatch = /^- id:\s*(\S+)/u.exec(line);
    if (idMatch) {
      current = { id: idMatch[1], files: [], shadows: [], watch: [], verify: [] };
      entries.push(current);
      currentKey = null;
      continue;
    }
    if (current === null) {
      continue;
    }

    const keyMatch = /^ {2}(\w+):\s*(.*)$/u.exec(line);
    if (keyMatch) {
      const [, key, rest] = keyMatch;
      currentKey = LIST_KEYS.has(key) && rest !== "[]" ? key : null;
      continue;
    }

    const itemMatch = /^\s+-\s+(\S+)/u.exec(line);
    if (itemMatch && currentKey !== null) {
      current[currentKey].push(itemMatch[1]);
    }
  }

  return entries;
}

export function detectDrift(entries, changedFiles) {
  const changed = new Set(changedFiles);
  const lines = [];
  for (const entry of entries) {
    const hits = [...entry.shadows, ...entry.watch].filter((path) => changed.has(path));
    if (hits.length > 0) {
      lines.push(`- **${entry.id}** — upstream touched: ${hits.map((h) => `\`${h}\``).join(", ")}`);
    }
  }
  return lines;
}

function main() {
  const changedPath = process.argv[2];
  if (!changedPath) {
    console.error("usage: node .fork/detect-drift.mjs <changed-files.txt>");
    process.exit(2);
  }

  const forkDir = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
  const manifest = NodeFS.readFileSync(NodePath.join(forkDir, "customizations.yaml"), "utf8");
  const changedFiles = NodeFS.readFileSync(changedPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const report = detectDrift(parseCustomizations(manifest), changedFiles);
  if (report.length > 0) {
    console.log(report.join("\n"));
  }
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main();
}
