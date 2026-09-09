// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#server-repository-identity-base-remote`. */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const resolver = readSibling("../../../server/src/project/RepositoryIdentityResolver.ts");
const resolverTest = readSibling("../../../server/src/project/RepositoryIdentityResolver.test.ts");

function readCustomizationHunks(source: string): string {
  const begin = "fork:begin server-repository-identity-base-remote";
  const end = "fork:end server-repository-identity-base-remote";
  const hunks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(begin, cursor);
    if (start === -1) break;
    const stop = source.indexOf(end, start);
    if (stop === -1) throw new Error("unterminated server-repository-identity-base-remote hunk");
    hunks.push(source.slice(start, stop));
    cursor = stop + end.length;
  }
  return hunks.join("\n");
}

describe("fork guard: server-repository-identity-base-remote", () => {
  it("lets the gh base marker pick the identity remote ahead of upstream", () => {
    const hunks = readCustomizationHunks(resolver);
    // The marker is read from git config and only for multi-remote checkouts.
    expect(hunks).toContain("gh-resolved");
    expect(hunks).toContain("if (remotes.size <= 1) return null;");
    // The marked remote wins; upstream's picker is only the fallback and is
    // left byte-identical, so a sync never conflicts on its signature.
    expect(hunks).toContain("?? pickPrimaryRemote(remotes)");
    expect(resolver).toContain(
      "function pickPrimaryRemote(\n  remotes: ReadonlyMap<string, string>,\n): {",
    );
    expect(resolver).toContain('["upstream", "origin"] as const');
  });

  it("keeps the base-remote cases covered by the resolver's own test", () => {
    const hunks = readCustomizationHunks(resolverTest);
    expect(hunks).toContain("prefers the remote gh marked as the base repository over upstream");
    expect(hunks).toContain(
      "falls back to upstream when the gh base marker names a missing remote",
    );
    expect(hunks).toContain("skips the gh base lookup for a checkout with one remote");
  });
});
