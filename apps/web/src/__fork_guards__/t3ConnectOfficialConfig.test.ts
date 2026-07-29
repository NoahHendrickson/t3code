// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#t3-connect-official-config`.
 *
 * The fork tracks upstream's official T3 Connect public values in a
 * repository-root .env so source builds reach the hosted relay exactly like
 * released artifacts do. What these tests catch: the file dropping out of
 * the index (it matches .gitignore's .env* rule, so an untracked copy looks
 * identical on disk), secret creep or copy-drift in its contents (the
 * key-set assertion compares against a second hand-maintained copy of the
 * same fact, so it only fails when the two copies disagree), and upstream's
 * loader ceasing to read the repo-root .env or renaming the canonical
 * variables during a sync. Known gap, deliberate and recorded in
 * .fork/notes/FORK-CUSTOMIZATION-DECISIONS.md: upstream rotating the values
 * out from under us is NOT detected here — both copies keep agreeing while
 * the relay handshake dies at runtime. Nothing short of a live probe would
 * catch that, and guards do not do network.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "../../../../scripts/lib/public-config.ts";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

// The values upstream bakes into every official artifact (read from the
// published npm CLI, t3@0.0.30). Public identifiers, not secrets.
const OFFICIAL_VALUES = {
  T3CODE_CLERK_PUBLISHABLE_KEY: "pk_live_Y2xlcmsudDMuY29kZXMk",
  T3CODE_CLERK_JWT_TEMPLATE: "t3-relay",
  T3CODE_CLERK_CLI_OAUTH_CLIENT_ID: "hzxSgY2cH10sDU2r",
  T3CODE_RELAY_URL: "https://relay.t3.codes",
} as const;

describe("fork guard: t3-connect-official-config", () => {
  it("keeps .env tracked, not merely present on disk", () => {
    // .env matches .gitignore's .env* rule, so losing the index entry leaves
    // a working tree that looks right while every fresh clone and worktree
    // silently builds with T3 Connect compiled out. spawnSync rather than a
    // bare execSync throw: a missing git binary must report itself as an
    // environment problem, not masquerade as the tracking regression.
    const result = NodeChildProcess.spawnSync("git", ["ls-files", "--error-unmatch", ".env"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.error, "git was not runnable in this environment").toBeUndefined();
    expect(result.status, `.env is not tracked by git: ${result.stderr}`).toBe(0);
  });

  it("carries exactly the four official public values", () => {
    const parsed = NodeUtil.parseEnv(
      NodeFS.readFileSync(NodePath.join(repoRoot, ".env"), "utf8"),
    ) as Record<string, string | undefined>;
    // Exact key-set equality is the secret-creep fence: a CLERK_SECRET_KEY or
    // token added to a tracked env file would ship in the repository forever.
    expect({ ...parsed }).toEqual(OFFICIAL_VALUES);
  });

  it("resolves through the build loader for every client surface", () => {
    // baseEnv: {} isolates from ambient CI variables; a developer's local
    // .env.local may override individual values, so this asserts presence
    // and projection rather than exact contents.
    const env = loadRepoEnv({ baseEnv: {}, repoRoot });
    const projected = [
      "T3CODE_CLERK_PUBLISHABLE_KEY",
      "T3CODE_CLERK_JWT_TEMPLATE",
      "T3CODE_CLERK_CLI_OAUTH_CLIENT_ID",
      "T3CODE_RELAY_URL",
      // Aliases the web/desktop and mobile builds consume.
      "VITE_CLERK_PUBLISHABLE_KEY",
      "VITE_CLERK_JWT_TEMPLATE",
      "VITE_CLERK_CLI_OAUTH_CLIENT_ID",
      "VITE_T3CODE_RELAY_URL",
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "EXPO_PUBLIC_CLERK_JWT_TEMPLATE",
    ];
    const missing = projected.filter((name) => !env[name]?.trim());
    expect(missing).toEqual([]);
  });
});
