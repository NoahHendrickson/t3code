/**
 * Lint rules the fork defers in its own code — see `.fork/customizations.yaml#fork-lint-cleanliness`.
 *
 * Upstream's 2026-10 React Compiler wave made the compiler rules and several new
 * style rules errors for every web file. Fork-owned code predates them, so in
 * DEFERRED_LINT_SCOPE they only warn (root vite.config.ts), and
 * `.fork/lint-owned.mjs` holds each to its baseline here: a count may fall,
 * never rise. Lowering a baseline, or deleting a rule at zero, is one edit here.
 */

/** Fork-owned paths where the rules below warn instead of erroring. */
export const DEFERRED_LINT_SCOPE = [
  "apps/web/src/custom/**",
  "apps/web/src/overrides/**",
  "apps/web/src/__fork_guards__/**",
  // The fork owns this file's Sidebar() body, which still memoizes by hand.
  "apps/web/src/components/Sidebar.tsx",
  "apps/web/src/components/sidebar/SidebarChrome.tsx",
  // Fork-owned code outside apps/web/src, deferred alongside it since the 2026-10-28 sync.
  ".fork/**",
  "apps/web/fork/**",
  "apps/desktop/src/fork/**",
  "apps/desktop/src/preview/DesignSource*.ts",
  "apps/desktop/src/app/Desktop*Fork*.test.ts",
  "apps/server/src/**/fork*.ts",
  "apps/server/src/git/resolveBootstrapThreadBranch.ts",
  "apps/server/src/scheduledTasks/githubPrTrigger.ts",
  "packages/contracts/src/scheduledTaskRuns.ts",
  "packages/shared/src/forkDesignProps.ts",
];

/** `[oxlint plugin/rule, baseline]` — the baseline is the most warnings allowed. */
export const DEFERRED_LINT_RULES = [
  ["react/exhaustive-effect-dependencies", 4],
  ["react/memo-dependencies", 12],
  ["react/refs", 15],
  ["react/set-state-in-effect", 5],
  ["t3code/no-manual-memo", 131],
  ["t3code/no-outset-state-indicators", 12],
  // Section dividers in the vendored design-mode engine, kept verbatim for re-syncs.
  ["t3code/no-low-value-comments", 873],
  ["t3code/no-raw-resize-observer", 4],
  // Upstream rules new in the 2026-10-28 sync; fork code predates them.
  ["react/preserve-manual-memoization", 2],
  ["t3code/no-em-dash-copy", 87],
  ["t3code/no-unreasoned-state-sync", 39],
  ["t3code/require-disposable-render", 16],
  ["t3code/no-frame-waits-in-browser-tests", 1],
];
