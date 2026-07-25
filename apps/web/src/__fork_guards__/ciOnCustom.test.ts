// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#ci-on-custom`.
 *
 * Upstream's CI triggers on pull_request and pushes to main; this fork also
 * needs pushes to `custom` validated. The hunk is a Tier-4 inline edit to an
 * upstream workflow file, so an upstream rework of ci.yml could silently
 * drop it in a "clean" merge.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("fork guard: ci-on-custom", () => {
  it("keeps the custom branch in CI's push triggers", () => {
    const ci = NodeFS.readFileSync(NodePath.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/push:\s*\n\s+branches:\s*\n(?:.*\n)*?\s+- custom/u);
  });
});
