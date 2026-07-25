/**
 * Fork guard — manifest integrity, see `.fork/README.md` §4a and §7.
 *
 * Two invariants:
 *   - every path the manifest claims (fork files, shadows, guards) exists, so
 *     a rebase that deletes a fork file cannot pass silently;
 *   - every customization has at least one guard test — the §7 "guard
 *     coverage ratio" pinned to zero, as a failing test instead of a metric.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// @ts-expect-error — plain .mjs module without type declarations; its parsing
// behaviour is what this guard exercises, matching what CI drift checks run.
import { parseCustomizations } from "../../../../.fork/detect-drift.mjs";

interface ManifestEntry {
  readonly id: string;
  readonly files: readonly string[];
  readonly shadows: readonly string[];
  readonly watch: readonly string[];
  readonly verify: readonly string[];
}

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const manifestText = NodeFS.readFileSync(
  NodePath.join(repoRoot, ".fork/customizations.yaml"),
  "utf8",
);

const entries = parseCustomizations(manifestText) as ManifestEntry[];

describe("fork guard: customizations manifest", () => {
  it("parses at least one customization", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("references only paths that exist in the tree", () => {
    const missing = entries.flatMap((entry) =>
      [...entry.files, ...entry.shadows, ...entry.watch, ...entry.verify]
        .filter((path) => !NodeFS.existsSync(NodePath.join(repoRoot, path)))
        .map((path) => `${entry.id}: ${path}`),
    );
    expect(missing).toEqual([]);
  });

  it("has a guard test for every customization (guard coverage ratio = 0 gaps)", () => {
    const unguarded = entries.filter((entry) => entry.verify.length === 0).map((entry) => entry.id);
    expect(unguarded).toEqual([]);
  });
});
