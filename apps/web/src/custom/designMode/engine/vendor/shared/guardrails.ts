// Same rule as chat-constants.ts: this module is bundled into BOTH the browser client
// (src/client/request.ts — Copy-for-agent's standalone markdown) and the node server
// (src/server/dispatch.ts — the Cursor deeplink augmentation). It must stay pure data with
// NO imports, forever.
//
// Placement (2026-07-10 cost review): these guardrails deliberately do NOT ride every queued
// change-request item — that duplicated them against the delivery wrapper on every path and
// cost ~85 tokens per Send. Each delivery path carries them exactly once instead:
//   - /forge-design command text (DESIGN_COMMAND, src/server/setup.ts)
//   - /forge-watch command text (WATCH_COMMAND, src/server/setup.ts)
//   - the embedded session's pull nudge (PULL_TURN_TEXT, src/server/session/manager.ts)
//   - the Cursor deeplink (augmentDispatchMarkdown, src/server/dispatch.ts) — imports these
//   - Copy for agent (renderStandaloneMarkdown, src/client/request.ts) — imports these
// If you add a NEW way for queue markdown to reach an agent, it must carry these (or an
// equivalent instruction wrapper) too.

// t3-fork: upstream scoped every edit to its call site and told the agent to SKIP anything
// that would touch a shared component. In this fork that default is inverted: a designer who
// selects a Button and nudges its padding almost always means "the Button", not "this one
// button" — call-site-only scoping turned those edits into one-off className overrides that
// drift from the design system. Scope is now a judgment call the agent makes from the
// evidence the request already carries (the rendering component, the authored file, how
// design-system-shaped the edit is). What survives from upstream is the no-pause rule
// (a stalled agent re-asks the same question forever) — recast as "choose and disclose":
// the agent states the scope it picked so the user can redirect a wrong guess. A faithful
// re-sync would restore upstream's skip-and-report wording; a guard test pins this one
// (forkDesignModeCssOrigin.test.ts).
export const SCOPE_GUARDRAIL =
  'Scope: for each edit, judge whether the user means the component everywhere or just this instance, and act on your best reading. Changes to the intrinsic look of a component (color, spacing, radius, typography) usually belong in the component or shared rule that renders the element, so every instance updates; edits tied to this particular spot in the layout belong at the call site. Prefer the project tokens and the suggested utilities over hard-coded values. Do not pause to ask — state which scope you chose in your reply so the user can redirect a wrong guess.'

// No verification ask on purpose: telling the agent to "verify" makes it spin up dev
// servers/screenshots to preview the result the user is already watching live.
//
// t3-fork: upstream's wording promised that "The Forge verifies the changes automatically",
// which is true upstream (client/verifier.ts re-reads computed styles post-HMR) and false
// here — that verifier was never vendored into this fork, and nothing else checks. Claiming a
// safety net that does not exist is worse than claiming none: it told the agent to stop
// looking at exactly the point where an edit that resolved to nothing would have been caught.
// If the verifier is ever vendored, restore the stronger sentence along with it.
export const NO_PREVIEW_GUARDRAIL =
  'Do not run the app, take screenshots, or preview the result — the user is watching the live app and will say if an edit did not land.'
