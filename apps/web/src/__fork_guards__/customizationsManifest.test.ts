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

// One candidate pass shared by the fence tests below: only files that carry a
// marker at all (~40 of ~15k tracked — a full ls-files + readFileSync walk
// here measured ~3.8s per run, most of it reading vendored .repos/). --text,
// because ChatComposer.tsx contains raw NUL bytes and git grep would
// otherwise classify the fork's densest fenced file as binary and skip it —
// the same trap .fork/AGENTS.md documents for plain grep. Guard tests are
// excluded everywhere: they quote fence markers as prose.
const FENCE_MARKER = /fork:(begin|end) ([a-z0-9-]+)/gu;
const fencedFiles = NodeChildProcess.execSync('git grep --text -lE "fork:(begin|end) [a-z0-9-]+"', {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .split("\n")
  .filter(Boolean)
  .filter((path) => !path.includes("__fork_guards__"));

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
    const violations: string[] = [];
    for (const path of fencedFiles) {
      // The extension whitelist predates the shared candidate pass and is
      // load-bearing: markdown and workflow fences (AGENTS.md's
      // fork-workflow, fork-change-scope) deliberately use fence ids that
      // are anchors into the manifest rather than manifest ids themselves.
      if (!/\.(?:ts|tsx|mts|cts|js|mjs|cjs|css|sh|ya?ml)$/u.test(path)) continue;
      const content = NodeFS.readFileSync(NodePath.join(repoRoot, path), "utf8");
      for (const match of content.matchAll(FENCE_MARKER)) {
        if (match[1] !== "begin") continue;
        const id = match[2] ?? "";
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
    const violations: string[] = [];
    for (const path of fencedFiles) {
      if (path.startsWith(".fork/")) continue;
      const content = NodeFS.readFileSync(NodePath.join(repoRoot, path), "utf8");
      const begins = new Map<string, number>();
      const ends = new Map<string, number>();
      for (const match of content.matchAll(FENCE_MARKER)) {
        const counts = match[1] === "begin" ? begins : ends;
        const id = match[2] ?? "";
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
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
