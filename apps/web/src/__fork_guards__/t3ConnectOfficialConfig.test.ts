// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#t3-connect-official-config`.
 *
 * The fork tracks upstream's official T3 Connect public values in a
 * repository-root .env so source builds reach the hosted relay exactly like
 * released artifacts do. Three ways this dies silently without a guard: the
 * file drops out of the index (it matches .gitignore's .env* rule, so an
 * untracked copy looks identical on disk), it grows values it must never
 * carry (server-side secrets), or upstream's loader stops reading the
 * repo-root .env / renames the canonical variables during a sync.
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
    // silently builds with T3 Connect compiled out.
    expect(() =>
      NodeChildProcess.execSync("git ls-files --error-unmatch .env", {
        cwd: repoRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
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
