// @effect-diagnostics nodeBuiltinImport:off - compiles real source files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { transform } from "oxc-transform-react";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);

/* fork:begin fork-lint-cleanliness — see .fork/customizations.yaml#fork-lint-cleanliness
   Fork code that still bails out of the compiler, deferred with the same
   ratchet as .fork/lint-owned.mjs's DEFERRED_RULES: remove a file once it
   compiles; never add one. */
const FORK_COMPILER_DEFERRED = new Set([
  "apps/web/src/components/Sidebar.tsx",
  "apps/web/src/custom/SidebarV2ProjectGroupHeader.tsx",
  "apps/web/src/custom/designMode/ForkPreviewDesignMode.tsx",
  "apps/web/src/custom/designMode/panel/ForkDesignPanel.tsx",
  "apps/web/src/custom/voice/useForkDictationController.ts",
]);
/* fork:end fork-lint-cleanliness */

const webSourceFiles = NodeFS.readdirSync(NodePath.join(repoRoot, "apps/web/src"), {
  recursive: true,
})
  .map(String)
  .filter((file) => /\.tsx?$/.test(file) && !/\.(test|browser)\.tsx?$/.test(file))
  .filter((file) => !file.endsWith(".gen.ts"))
  .map((file) => `apps/web/src/${file}`)
  /* fork:begin fork-lint-cleanliness — see .fork/customizations.yaml#fork-lint-cleanliness */
  .filter((file) => !FORK_COMPILER_DEFERRED.has(file));
/* fork:end fork-lint-cleanliness */

// ChatView is ~9k lines. Compiling it takes ~9s on a fast machine and can pass the
// 15s project limit on loaded CI runners, so slow files get a 60s limit below.
const slowFiles = new Set(["apps/web/src/components/ChatView.tsx"]);

const compile = async (file: string) => {
  const absolute = NodePath.join(repoRoot, file);
  const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
    jsx: { runtime: "automatic", development: false, refresh: false },
    reactCompiler: { reportDiagnostics: true },
  });
  const bailouts = result.errors.map((error) => error.codeframe ?? error.message);
  expect(bailouts).toEqual([]);
};

// Lint reports most compiler bailouts, but not every one (try/finally, throw
// inside try). A skipped file still builds, just unmemoized, so check the output.
describe("React Compiler coverage", () => {
  it.each(webSourceFiles.filter((file) => !slowFiles.has(file)))("compiles %s", compile);
  // oxlint-disable-next-line t3code/no-test-timeout-or-unreasoned-skip -- CPU-bound compile of a huge file, not a hidden wait.
  it.each([...slowFiles])("compiles %s", compile, 60_000);
});
