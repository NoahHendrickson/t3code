// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — manifest integrity, see `.fork/README.md` §4a and §7.
 *
 * Two invariants:
 *   - every path the manifest claims (fork files, shadows, guards) exists, so
 *     a rebase that deletes a fork file cannot pass silently;
 *   - every customization has at least one guard test — the §7 "guard
 *     coverage ratio" pinned to zero, as a failing test instead of a metric.
 */

import * as NodeChildProcess from "node:child_process";
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

  it("claims every file that carries a fork fence", () => {
    // The converse of "claimed paths exist": a fenced file the manifest
    // doesn't list is invisible to detect-drift, so an upstream rewrite of
    // that file merges cleanly and silently deletes the customization — the
    // exact silent-drop failure this register exists to prevent. Every
    // fenced file must appear under its id's files/shadows/watch/verify, and
    // every fence must name a registered id. Guard tests are excluded: they
    // assert fence strings belonging to other files, and are themselves
    // fork-owned verify entries.
    const knownIds = new Set(entries.map((entry) => entry.id));
    const claimed = new Map(
      entries.map((entry) => [
        entry.id,
        new Set([...entry.files, ...entry.shadows, ...entry.watch, ...entry.verify]),
      ]),
    );
    const tracked = NodeChildProcess.execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter((path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|css|sh|ya?ml)$/u.test(path))
      .filter((path) => !path.includes("__fork_guards__"));

    const violations: string[] = [];
    for (const path of tracked) {
      const content = NodeFS.readFileSync(NodePath.join(repoRoot, path), "utf8");
      for (const match of content.matchAll(/fork:begin ([a-z0-9-]+)/gu)) {
        const id = match[1] ?? "";
        if (!knownIds.has(id)) {
          violations.push(`${path}: fence references unknown customization "${id}"`);
        } else if (!claimed.get(id)?.has(path)) {
          violations.push(`${path}: fenced for "${id}" but not listed under it`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("balances every fork:begin with a fork:end of the same id", () => {
    // An open fence with no boundary marks nothing: the next sync cannot tell
    // where the customization stops, so upstream's side of a conflict can be
    // taken right through it and every fence-based audit stays quiet. The
    // sidebar-v2-card-rows padding hunk shipped exactly this way for several
    // syncs before it was noticed by hand. Balance is checked per file — a
    // begin in one file cannot be closed from another. `.fork/` is excluded
    // with the guards: both quote fence markers as prose, not as fences.
    const tracked = NodeChildProcess.execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean)
      .filter((path) => !path.includes("__fork_guards__") && !path.startsWith(".fork/"));

    const violations: string[] = [];
    for (const path of tracked) {
      const absolute = NodePath.join(repoRoot, path);
      if (!NodeFS.existsSync(absolute) || !NodeFS.statSync(absolute).isFile()) continue;
      const content = NodeFS.readFileSync(absolute, "utf8");
      const count = (kind: string) => {
        const counts = new Map<string, number>();
        for (const match of content.matchAll(new RegExp(`fork:${kind} ([a-z0-9-]+)`, "gu"))) {
          const id = match[1] ?? "";
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return counts;
      };
      const begins = count("begin");
      const ends = count("end");
      for (const id of new Set([...begins.keys(), ...ends.keys()])) {
        const opened = begins.get(id) ?? 0;
        const closed = ends.get(id) ?? 0;
        if (opened !== closed) {
          violations.push(`${path}: "${id}" has ${opened} begin(s) and ${closed} end(s)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
