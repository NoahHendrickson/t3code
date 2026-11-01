// @effect-diagnostics nodeBuiltinImport:off
// Fork guard — see `.fork/customizations.yaml#fork-check-changed-base`.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("fork-check-changed-base", () => {
  it("defaults check:changed to the fork trunk, not the upstream mirror", () => {
    const script = NodeFS.readFileSync(NodePath.join(repoRoot, "scripts/check-changed.ts"), "utf8");
    const defaults = [...script.matchAll(/process\.argv\[2\] \?\? "([^"]+)"/g)].map((m) => m[1]);
    expect(defaults).toEqual(["origin/custom"]);
  });
});
