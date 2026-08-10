// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#ci-runners`.
 *
 * Upstream CI targets Blacksmith runners this fork has no access to; jobs on
 * those labels queue forever. A sync that reintroduces a blacksmith-* label
 * into a workflow covered by this customization must fail here rather than
 * hang silently in the Actions queue.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("fork guard: ci-runners", () => {
  it.each(["ci.yml", "mobile-fingerprint-check.yml"])(
    "keeps every %s job off Blacksmith runner labels",
    (workflow) => {
      const contents = NodeFS.readFileSync(
        NodePath.join(repoRoot, ".github/workflows", workflow),
        "utf8",
      );
      const blacksmithLabels = contents.match(/runs-on:.*blacksmith-\S+/gu) ?? [];
      expect(blacksmithLabels).toEqual([]);
    },
  );
});
