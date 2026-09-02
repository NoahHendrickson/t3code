# Customization design decisions and history

Narrative companion to `.fork/customizations.yaml`. The manifest's `intent:` fields state the
invariants a sync must preserve; this file keeps the design history, rejected alternatives, and
incident write-ups that explain _why_ those invariants exist. Sections are keyed by customization
id. Nothing here is load-bearing for conflict resolution — if a fact must survive a sync, it
belongs in the manifest, not here.

Related deep-dives that predate this file and stay where they are:

- `.fork/notes/FORK-DATA-ISOLATION-HANDOFF.md` — the v0.1.1 data-isolation incident behind
  `fork-app-identity`.
- `.fork/notes/FORK-LINT-GUARD-HANDOFF.md` — the motivation and design of `fork-lint-cleanliness`.
- `.fork/notes/FORK-RELEASE-REVIEW.md` — the review behind `fork-desktop-release`.

## fork-app-identity

- The name was "N3 Code" until it was renamed wholesale to "no3y Code". Renaming display strings
  is safe by construction precisely because the bundle id (`com.t3tools.t3code.fork`) and the base
  directory (`~/.t3-fork`) are both held stable across renames. One consequence worth knowing: an
  installed "N3 Code.app" is not replaced by a build that installs as "no3y Code.app", so an
  upgrader keeps both bundles until the old one is deleted by hand.
- The first attempt at state isolation (shipped in v0.1.1) renamed the "userdata" leaf on the
  desktop side only, and left the bundled server child writing the real `~/.t3/userdata` — the
  packaged app is two processes, and only one of them had been moved. That incident is why
  isolation is now forked at the _base_ directory, and it is written up in full in
  `FORK-DATA-ISOLATION-HANDOFF.md`.
- Before upstream a17cbc3b4, dev state in a linked worktree simply shared `~/.t3/dev`. The manifest
  used to claim that; the claim went stale when upstream moved worktree dev state into the
  worktree's own `.t3`. Migration mechanics for state left behind at `~/.t3/dev` are operational
  and live in `.fork/AGENTS.md`, since they go stale once everyone has moved.

## sidebar-v2-card-rows

- An earlier revision gave working rows a resting fill, on the theory that a live agent should
  look alive. With several threads running the panel became a field of lit rectangles in which the
  hover cue meant nothing. That is why surface now encodes interaction only, and why working is
  instead the one status whose title drops to muted — a running agent is the row you can least
  act on.
- The trailing slot used to fall back to a relative-time string when there was no status mark,
  which made the column alternate between a mark and a variable-width label so nothing below it
  could align. That is why idle draws a hollow ring rather than showing nothing.
- The status-mark vocabulary (form carries the state, hue reinforces it) is taken from the
  phanttom Ghostty sidebar design. Working takes emerald from that design rather than the sky the
  mobile Live Activity uses; the divergence is deliberate and mobile has not been migrated.
- The two-line card is the design's own variant, not a space saving invented here. The third line
  exists to carry the PR badge and the diff counts; with neither it is a blank 15px strip under
  every card. Worth knowing while reading it: `latestTurnDiff()` is an upstream stub returning
  null today, so until shells carry checkpoint summaries the three-line form only appears on
  threads with a PR.

## sidebar-v2-project-grouping

- The first cut modelled the two modes as `groups | null`, with `null` meaning flat, and re-tested
  that sentinel at three sites: the ordered-thread memo, the `projectTitle` prop, and the render.
  Review called it correctly — three coordinated special cases that have to agree by convention,
  in a file already past 2.5k lines. The section model replaces it: flat is one headerless
  section, so there is one sequence, the render maps it and the keyboard order flattens it, and
  "these two derivations disagree" stops being representable. Worth remembering when the next
  variant lands: the fix for a mode flag is usually a shape both modes fit.
- The same first cut collapsed the card on `prBadge !== null`, which is false both for "no PR" and
  for "the VCS query has not answered yet". Every PR-carrying card would have rendered at two
  lines and grown to three as its query landed, reflowing the list under the pointer — worse than
  the blank strip the collapse removes, and it would have got worse still once `latestTurnDiff()`
  starts returning data, since that is async too. Hence the explicit `prUnknown` input: collapse
  only where the answer is known, or where no query was ever issued.
- Grouping and the project scope filter answer different questions — "everything, arranged by
  repo" versus "only this repo" — which is why grouping is a switch inside the scope menu rather
  than another entry in its radio list. It is also why grouping is skipped while a scope is set:
  the list is already one project, so the header would only repeat the scope row's own label one
  line lower.
- The shelves stay flat because both are time-ordered tails whose value is being short. Slicing a
  tail by project turns one header into a dozen sub-headers over one or two rows each.
- The preference is device-local because a client setting would mean a fork-shaped key in
  `packages/contracts` — a schema upstream owns and every sync has to carry — for a view
  preference that is per-window anyway.
- The header is not collapsible. Upstream's two shelf headers collapse because each hides a tail;
  a project header sits over the inbox, where nothing wants hiding, and the scope menu one row
  above already does what collapsing would. It drops the shelf headers' trailing hairline for the
  same reason: a shelf rule is one divider closing off the list above it, while project headers
  recur every few rows and a rule at that cadence stripes the panel against the card edges. The
  folder mark and the space above it carry the separation instead, and the mark is the scope
  menu's own so a header and its menu entry read as the same object.
- Grouped cards hide their project name rather than dropping it. Dropping it was the first
  implementation and it made grouped mode strictly worse than flat mode for a screen reader: the
  header is a visual adjacency, so a non-visual user lost the project association entirely. The
  header is now a heading in a presentational `li` and the name stays on the card as `sr-only`.
- Post-settle landing changes under grouping, and it is intended. `planForwardNavigation` reads
  the ordered list positionally, so settling the last active card in one project now lands on the
  next project's first card rather than on the next most-recently-active thread. "Forward" should
  mean the next visible row; that is what it now means in both modes.

## fork-sidebar-chrome

- The Dev channel's artwork was once regenerated as an 8x8 Bayer dither in SVG, which scaled to
  any width and re-themed from two variables — but could only approximate the designer's
  reference: a horizontal ramp cannot survive tiling, so the diagonal had to be flattened to a
  vertical one. The committed raster is the artwork as drawn. The tradeoff is that it cannot
  re-theme and is a screenshot-quality source, so a higher-resolution export would be a straight
  swap of the file.
- Where the art remains, it is painted as a covering background rather than a repeating tile because it
  ramps diagonally from dark at the bottom-left to light at the top-right — any repeat butts a
  light edge against a dark one and draws a seam. Covering crops the extremes of the ramp on a
  short band and keeps the gradient continuous.
- Nightly keeps upstream's night sky partly because the branch is unreachable in practice: the
  fork has never cut a Nightly build — that label needs a `-nightly.YYYYMMDD.N` version and the
  release workflow takes a hand-entered `0.1.2`-shaped one. Leaving it costs nothing and stays
  correct if that changes or if upstream reworks the art.

## geist-typography

- `readPreviewAnnotationTheme` (`apps/web/src/browser/annotationTheme.ts`) reads `--font-sans` /
  `--font-mono` off `documentElement` and ships the resolved families into the previewed page, so
  the fork's stacks travel through there. Inert today — the previewed page has no Geist loaded, so
  it falls through to the same system faces as before — but it is the dynamic seam
  `Annotation.css` is not, which is why the file is drift-watched.
- `detect-drift` only greps fences in ts/css/yaml/sh, so it cannot see a dependency change. This
  was the first customization to add npm deps, which is why `apps/web/package.json` was added to
  its watch list and the guard asserts both Fontsource packages are present.

## fork-lint-cleanliness

- The motivating incident: nine dead imports in `SidebarV2.tsx` survived three pull requests.
  Removing them was never the difficulty — noticing was. Full write-up in
  `FORK-LINT-GUARD-HANDOFF.md`.
- The scope list is hand-maintained, and three fork-owned surfaces (`.fork` itself,
  `apps/web/fork`, and the adopted upstream-path files) were missing from the first cut — review
  of the implementing PR caught it. That is why the guard test checks selection by walking the
  tree independently and demanding the selection match, rather than by spot-checks.

## fork-surface-palette

- Stage `#191919` is a judgement call (not a Figma node): darken the work
  surface under the `#1e1e1e` panel so chrome sits slightly in front of the
  work. That inverts the earlier "panel below stage" hierarchy; the invariant
  is now panel-above-stage, not the old inversion of upstream's lift-from-base
  model.
- A side effect of the darker stage is closing the seam with upstream's
  `#161616` pre-paint / overscroll colour in `apps/web/index.html` (theme-color
  metas, `DARK_BACKGROUND`, and `html.dark body`). The guard pins that
  proximity so a later stage tweak cannot reopen the flash without noticing.
- `--surface-grain: none` stays for the flat-opaque reason alone. Against
  `#191919`, upstream's 0.035 noise would _increase_ panel/stage ΔL\* rather
  than collapse it, so the old "grain erases the separation" argument no longer
  holds and must not be restated.

## fork-composer-shell

- The wrap observer and its latch originally lived half-inline in `ChatComposer.tsx`, with the
  pure rule elsewhere — which put half a rule in the file least able to absorb fences and made the
  latch reachable only through a regex over the source. Extracting
  `custom/useComposerPromptWrapLatch.ts` beside `custom/composerDensity.ts` is what made the whole
  rule read in one place.
- `collapsed` was briefly folded into `slim`. That put the slim density attribute on a composer
  the slim layout was never applied to, forced every call site to re-exclude the collapsed case by
  hand, and left two things named "slim" disagreeing about what they meant — hence the three-value
  density.
- The prompt/placeholder selector originally used `+ div` and silently missed the placeholder
  (Lexical renders it as the editor's _third_ child, behind an empty spacer). That is how the
  caret-beside-its-text bug got in, and why the rule now uses a general sibling combinator.
- Three rules had to be narrowed after they were found reaching further than intended (the pill
  restyle squashing ComposerPrimaryActions' CTAs, the separator rule hitting BranchToolbar's own
  separator, the drag-over cue vanishing under the pinned background). The common cause: the fork
  stylesheet is unlayered while Tailwind v4 utilities sit in `@layer utilities`, so a fork rule
  beats them regardless of specificity.
- Attachments forcing the tall shell was considered and declined; attachment cards render as a
  full-width band above the inline row instead.
- Absolutely-positioned content in the prompt column is invisible to the wrap latch by
  construction: it never changes the observed editor height. Phone widths already force tall for
  that reason; on desktop slim the 64-character default hint wraps under the inline pills. Truncating
  it would eat `$use skills` / `/ commands`, which have no other discovery surface — so slim uses a
  shorter hint that still names `@`, `$`, and `/`, and tall keeps the long form.
- A general weakness worth remembering for future guards: the composer-shell guards assert on the
  text of the stylesheet rather than on what it matches, so a selector that stops matching (for
  example, upstream adding a second child inside the frame) keeps every guard green. Selecting
  through `data-fork-composer-surface` rather than a positional child selector closes the known
  instance, not the class.
- The phantom single-line scrollbar under the tight 14/16 desktop line box first got an imperative
  fix: `overflow-y: hidden` on the contenteditable, flipped to `auto` via
  `data-composer-prompt-scrollable` when `scrollHeight` cleared `max-h`. That needed a pure
  predicate, a sync helper, and three effect sites on the wrap latch — and still stranded a
  clamped→clamped draft switch with scrolling off (no resize, no second prompt effect). The
  shipped answer deletes that machine: on `width >= 40rem` the existing
  `data-fork-composer-prompt` wrapper owns `max-height: 12.5rem` + `overflow-y: auto`, and the
  editor stays unclamped with `overflow-y: hidden` so Geist ink cannot inflate a scroll
  container. The guard's `not.toContain("data-composer-prompt-scrollable")` is a regression fence
  against bringing the toggle back, not an unexplained ban.

## t3-connect-official-config

- The goal was stated as "parity with official releases on top of the fork's changes", which ruled
  out the two heavier options up front: self-hosting the relay (`infra/relay` — own Clerk app,
  Cloudflare, PlanetScale; a second production system to operate for zero parity gain) and asking
  every clone to hand-author an untracked `.env` (works once, silently absent in the next worktree
  or clone, and this fork's contributions largely come from fresh agent worktrees).
- The four values were extracted from the published npm CLI tarball (`t3@0.0.30`), where upstream's
  release build inlines them (`VITE_CLERK_CLI_OAUTH_CLIENT_ID` etc. in the bundled web assets).
  `app.t3.codes` would have shown the same values but is unreachable from the agent environment's
  network policy. If upstream ever rotates them, the fix is re-extracting from the current release
  and updating `.env` and the guard's `OFFICIAL_VALUES` together.
- Committing a file that `.gitignore` matches is deliberate, not an oversight: ignore rules bind
  only untracked files, so one `git add -f` makes it a normal tracked file forever, upstream can
  never conflict with a path it has never shipped, and `.env.local` (still ignored, higher
  precedence in `scripts/lib/public-config.ts`) remains the escape hatch for anyone pointing a
  checkout at a staging or self-hosted relay. The alternative — carrying the values as code-level
  fallbacks — would have meant a Tier-4 fence in an upstream loader that syncs would fight over.
- No client code changes were needed, by construction: `fork-clerk-launch-resilience` only skips
  the desktop Clerk bridge when the build is keyless, and `fork-app-identity` explicitly kept the
  shared `t3code://` scheme, which is the redirect Clerk's desktop OAuth allowlist expects. The
  packaged fork app signing in shares upstream's scheme contention caveat already recorded there.
- What this does not grant: relay access is authorized by the signed-in user's Clerk account
  (waitlist/allowlist on upstream's instance), not by the baked values. A fork build with these
  values but no approved account gets exactly what an official build gets — the sign-in flow.
- Review follow-ups (PR #35). Accepted residual risk, named rather than implied: tracking `.env`
  removes the structural impossibility of committing it, and `.env` is the file most likely to
  receive a `CLERK_SECRET_KEY` by habit. The guard's exact-key-set assertion is the in-repo fence,
  but it is CI-only and post-push; GitHub push protection / secret scanning on the fork is the
  control actually positioned to catch it pre-push, and should be confirmed enabled in repository
  settings (not verifiable from a checkout). Second recorded gap: the guard's value assertion
  compares the tracked `.env` against a constant maintained in the same commits, so it catches
  copy-drift and secret creep, not upstream rotating the values — if rotation happens, both copies
  agree, CI stays green, and the failure surfaces as a dead relay handshake at runtime. A live
  probe was considered and declined; guards do not do network.
- Identity consequences of parity, stated out loud: dev runs (`vp run dev`, throwaway `test-t3-app`
  worktrees) are now keyed against upstream's production Clerk instance and relay by default, where
  T3 Connect was previously compiled out; and with `T3CODE_HOSTED_APP_URL` unset the `t3 connect`
  CLI flow round-trips through upstream's hosted app, so the consent screen names upstream's
  application. Both are exactly what "parity with official releases" means, and both are
  overridable per-checkout via `.env.local` — with a real limit the second review caught:
  `.env.local` can replace a value, never blank one. `firstNonEmpty` in the loader treats an empty
  string as absent and falls through to the tracked `.env`, and the resolved projection is spread
  last, so `T3CODE_CLERK_PUBLISHABLE_KEY=` in `.env.local` (or the process env) leaves the build
  keyed. Turning T3 Connect off in a checkout means temporarily deleting the tracked `.env` — the
  guard suite will complain locally until it is restored, which is the visible reminder not to
  commit the deletion. A fenced loader opt-out was considered and declined: it would put a fork
  hunk in upstream's build bootstrap to serve a local-experiment case that deletion already covers.
- Keyed desktop launch path: baking a key moves packaged fork builds off
  fork-clerk-launch-resilience's skip path and onto upstream's bridge path — deliberately, since
  that is the path every official desktop release ships. This entry originally argued a keyed
  fork build was "no worse-positioned in the ready race than an official build" because main.ts's
  pre-ready registration was strictly earlier than the bridge's own. True, and useless: the
  bridge's own post-ready call still throws regardless of what was registered first, official
  builds ship that dice roll to end users, and upstream runs no launch gate in CI to see it. The
  fork's first keyed dry-run gate saw it immediately and failed the build; the incident and fix
  live under `## fork-clerk-launch-resilience` below. Unit coverage of the keyed bridge already
  existed in upstream's DesktopClerk.test.ts, whose fenced hunk bakes a key in before import; the
  launch race itself is only observable in a packaged boot, which fork-release.yml's launch
  isolation gate exercises — run it with dry_run=true to prove a keyed build before tagging a
  release.
- Second review's sharpest catch: `infra/relay/scripts/deploy.ts`'s `reconcileRootEnv` writes
  relay public config — including `T3CODE_MOBILE_OTLP_TRACES_TOKEN` and
  `T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN`, the latter `::add-mask::`-ed in upstream's own release
  workflow — into the repo-root `.env`, which this customization made committable. In-repo
  automation of the exact failure the key-set guard fences. Accepted un-fenced because this fork
  never runs relay deploys (self-hosting was rejected above) and a fenced redirect to `.env.local`
  would also have to carry fenced edits to upstream's `deploy.test.ts`, which asserts the `.env`
  target. If the fork ever self-hosts, redirecting that write is the first change to make. The
  guard's failure message now names both legitimate writers (deploy output, optional OTLP values)
  and points them at `.env.local`, so tripping it reads as "wrong file", not "you leaked a secret".
- The `.env.example` fork note is now asserted by the guard suite (`toContain` on the fence
  marker), closing the fourth finding: `watch:` reports drift after a sync merges, but only a
  failing test stops `cp .env.example .env` from shipping upstream's placeholders over the live
  values via a routine `git commit -a`.

## fork-clerk-launch-resilience

- The keyed-build story failed the moment it was actually tested. After t3-connect-official-config
  keyed every fork build, the manifest was rewritten to say keyed builds keep upstream's bridge
  behavior exactly, leaning on "pre-ready re-registration observed harmless on Electron 41". The
  first dry-run launch gate on a keyed build (PR #35, run 30508846869) exited before the server
  started: the macOS runner's layer construction trailed "ready", `createClerkBridge` called
  `registerSchemesAsPrivileged` post-ready, and `DesktopClerkBridgeInitializationError` was
  fatally loud — the v0.1.2 failure reproduced on the keyed path. "Observed harmless" had only
  ever described boots that won the race; CI was the population of boots that lose it.
- The fix (7eedbbb6) makes main.ts the sole registrar on every path: `createDesktopClerkBridge`
  no-ops `protocol.registerSchemesAsPrivileged` for exactly the duration of `createClerkBridge`
  and restores it in a `finally`. Chosen over gating on `app.isReady()` — an isReady gate keeps
  fast and slow boots on different code paths, and the losing path is the one CI never exercises —
  and over catching the initialization error, which would swallow unknown causes along with the
  one known one. Safe only because main.ts registers the identical privilege set the bridge would
  have; the launch-resilience guard pins that set item by item, and a future @clerk/electron that
  registers a different set surfaces as a failing renderer in the launch gate, not silently.
  Covered by DesktopClerkForkRegistrarSuppression.test.ts (registration lands on the no-op, the
  registrar is restored after).
- Two sessions independently authored this same fix within the hour, differing only in fence
  placement and test naming — the shipped one is 7eedbbb6; the duplicate was dropped unpushed.
  Recorded because the convergence is itself evidence the no-op-around-bridge-creation shape is
  the minimal fix, not one agent's taste.

## fork-glass-preview-parking

- Reported as "the UI flashes in opacity" while switching threads, first seen the day v0.1.18
  shipped. Ruled out in order: Settings as an overlay (it is a route), windows behind the app
  (the glass material samples them, but the user had none), renderer restarts (none in the
  trace), unpainted tiles through the transparent window (plausible, never confirmed). The
  user then recognised the ghost as their own app, which T3's preview browser had open.
- Cause: upstream #9001 (Electron 43 recording fix, absorbed in the 2026-09-01 sync) parks every
  rendering-active guest at (0,0) z-index -1 "behind the app" so recordings keep getting frames,
  and keeps inactive macOS guests `visibility: visible`. Rendering-active includes automation
  activity, which PreviewAutomationHosts holds for the length of each agent preview call. Over an
  opaque window that park is invisible. Under Cool Darker the body is transparent and the stage is
  85–95% alpha, so every agent click, evaluate, or snapshot in a background thread showed that
  thread's page through the chat. The desktop trace had 27 evaluates and 12 snapshots that day.
- Fix: the fenced call site narrows the in-viewport park to recording and picture-in-picture and
  sends automation-only guests back offscreen, paintable on every platform (the pre-#9001
  placement). Chosen over `opacity: 0` on the parked wrapper, which would have to be proven not
  to stop the guest compositing for capture, and over gating on the glass marker, which would
  leave two placement policies to keep in sync for one bug. Screenshots of a background guest
  are unchanged from before #9001, when those guests were already offscreen.
