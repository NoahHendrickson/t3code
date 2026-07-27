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

## fork-sidebar-chrome

- The Dev channel's header art was once regenerated as an 8x8 Bayer dither in SVG, which scaled to
  any width and re-themed from two variables — but could only approximate the designer's
  reference: a horizontal ramp cannot survive tiling, so the diagonal had to be flattened to a
  vertical one. The committed raster is the artwork as drawn. The tradeoff is that it cannot
  re-theme and is a screenshot-quality source (~30% of its pixels are the two flat greens, the
  rest resampling), so a higher-resolution export would be a straight swap of the file.
- The art is painted as a covering background rather than a repeating tile because the artwork
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
