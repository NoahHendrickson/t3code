# Design mode: verifying that a sent change actually landed

Status: Phase 1 in review (fork/design-mode-verify-sent). #74 and #76 have landed. Phases 2-3 remain proposed.
Owner of the invariants once shipped: `.fork/customizations.yaml#fork-design-mode`.

## The problem

Design-mode edits preview as inline styles and are never committed by the tool — the agent
edits the source instead. When the turn finishes, the page shows the agent's real change with
the drafts still painted on top of it, and inline styles win.

#76 makes the panel say so and offers to drop the previews. What it cannot say is whether the
ask landed. So the user's only signal is watching the page for one frame as the previews come
off, judged against a memory of a value they were eyeballing a minute ago. For the edits this
tool is actually used for — 4px of padding, a slightly warmer grey — that judgement is not
reliably makeable, and a partially-applied set (four of six changes) is not makeable at all.

The consequences compound. A user who believes a change landed builds the next round of edits
on a false baseline; their drafts then encode "8px further than where it is now", where "now"
is a preview rather than the code. The page keeps looking right while the source drifts.

This is not a hypothetical failure. `custom/designMode/cssOrigin.ts` exists — an empirical
probe that removes a class and re-measures — precisely because "the agent edited a utility
class that was not the lever, and nothing changed" was a real, motivating bug. Silent no-ops
are a known outcome of this feature, and dropping previews is the moment they are hardest to
notice: a no-op edit produces the same snap-back as no edit at all.

## The approach

Do not read the agent's code, its diff, or its summary. Measure the page.

Every sent change is a claim about a computed value. After the agent's edit reaches the page,
suppress our own previews and read what the page actually renders. Compare against what was
sent. Three useful answers, plus two honest non-answers:

| Verdict        | Meaning                                               | Action offered             |
| -------------- | ----------------------------------------------------- | -------------------------- |
| `applied`      | The page now produces the value that was asked for.   | Drop this preview, safely. |
| `unchanged`    | Still the pre-send value. The ask did not land.       | Keep it; nothing was lost. |
| `diverged`     | Changed, but not to what was asked.                   | Keep it; surface loudly.   |
| `unverifiable` | Intent-shaped ask, or conditions changed (see below). | Say so; offer nothing.     |
| `missing`      | The element is no longer in the page.                 | Drop the record.           |

`diverged` is the one a user would essentially never catch by eye, and it is free once the
other two exist.

Rejected alternative: inspecting the turn's checkpoint diff. "The agent edited a file" is not
"the value changed", and the gap between those two is exactly what `cssOrigin.ts` was built to
close. Measurement is the only check an edit-that-does-nothing cannot pass.

## What already exists

Three of the expensive-looking parts are already in the tree, built for this and dormant since
the Forge's delivery half was deliberately not vendored (`engine/vendor/README.md`).

- **The measurement.** `buildChangeRequestWithElements` already works by flipping previews off,
  measuring, flipping on, measuring — with transitions suppressed across the window so a
  mid-transition read cannot be mistaken for a difference. Verification is the same two reads
  taken later against a different question.
- **The ledger.** `PersistedLifecycle.sent` is fully typed and validated in
  `engine/vendor/lifecycle-store.ts`, and `headlessMode.persist()` writes `sent: []` today.
  `PersistedSentElement` already carries `draftProps` and `changes: SentChange[]`
  (`{ property, afterCss }`) — which is precisely "what was asked, per property".
- **The apply side.** `DraftStore.commit(el, props?)` drops previews _without_ restoring the
  original — "the code owns this now" — and its comment already says it is for the properties
  that were verified or sent. `commitStructural(el, sent)` is documented as "the verifier's
  path". Neither has ever been called.

Structural asks already ship their own oracles too: the `absolute` op carries an `expected`
map of computed values, and `move` carries a `MovedFingerprint` plus `toIndex`. Both were
designed as verify inputs and are currently ignored by the receiving end.

So the work is closer to "connect three things built for each other" than "write a verifier".

## Design decisions that need getting right

### Suppression is not Compare

`drafts.compare(el, true)` writes the draft's recorded `original` back. That is the wrong
question here. After the agent's edit, we want the value the _current cascade_ produces — so
suppression must mean **remove our inline declaration and read what falls through**, then put
the draft back.

The two differ exactly when the page authored its own inline style on that property: Compare
would pin the stale recorded value and report a false `unchanged`. Verification therefore needs
its own suppress/restore pair rather than reusing the compare toggle.

### Suppress everything at once, measure once

Suppressing one property while other drafts stay painted gives wrong readings — a parent's
drafted `display: flex` changes what a child measures. One pass: suppress every draft on every
drafted element, take all readings, restore. Same shape as `compareAll`, one forced style
recalc, and no interference. Transitions suppressed across the window, as the builder already
does.

### Verify against what was sent, not against the live draft

If the user keeps tweaking after sending, the current draft is no longer the ask. The verdict
must compare against the values recorded at send time — which is what the `sent` ledger is for.
A draft edited after its send is `unverifiable` for that round and re-enters the loop on the
next Send.

### Intent-shaped asks get a non-answer, not a guess

Values in `KEYWORD_PASSTHROUGH` (`auto`, `fit-content`, `100%`, the flex keywords) ship
verbatim because their computed form would invert the intent — `auto` resolves to a px
measurement. Exact-match verification is meaningless for them. Same for the `display: flex →
block` ask, which carries `REMOVE_AUTO_LAYOUT_INTENT` rather than a literal target. These
report `unverifiable` with the reason shown. A fourth state the user can read is better than a
confident wrong one.

### Same conditions, or say so

`ChangeRequest.viewport` already records the size the request was drafted at. If the preview
viewport has changed since, a differing measurement is not evidence of anything — report
`unverifiable: viewport changed` rather than a failure. Canvas zoom does not affect computed
CSS (it is a compositor transform) and can be ignored.

### When to measure

The agent's edit reaches the page as either an HMR swap or a full reload. Measuring before it
arrives reports a false `unchanged`.

Trigger: the turn has ended (#76's existing armed record) **and** the page has been quiet for a
short window. `LayersSession` already owns a body `MutationObserver` with a 250ms quiet-window
debounce; the same idiom applies. Re-measure on every subsequent settle while the report is on
screen, so a late reload corrects a wrong verdict rather than freezing it.

### Element re-location is already solved

Drafts that survived the reload were re-located by `locatePersisted` (source tag + index, css
path fallback) and structural drafts re-bound by `healStructural`. Anything still live is
measurable; anything that failed to restore was already dropped. Verification inherits this and
adds only the `missing` verdict for an element that resolved at send time and no longer does.

## Phases

### Phase 1 — style deltas (the whole user-facing win)

Style changes are the overwhelming majority of what gets sent, and they are fully measurable.

Guest (`apps/web/src/custom/designMode/engine/`):

- Record the sent set at send time. `buildSend` already has the per-property before/after; write
  it into the `sent` slot the lifecycle store already types and validates, so it survives the
  reload it is meant to be checked after.
- New handle verb `verifySent(): Promise<VerifySentReport>` — suppress all, measure, restore,
  compare, return per-element/per-property verdicts. Async return rides `executeJavaScript` back,
  exactly as `buildSend` does.
- New handle verb `commitVerified(targets)` — `DraftStore.commit(el, props)` for the properties
  the user chose to clear. Drop the preview; do not restore.
- Bump `DESIGN_MODE_PROTOCOL_VERSION` 5 → 6. `boot()` already rebuilds a version-skewed engine,
  and `buildSend`'s `"stale-engine"` path already surfaces skew to the user.

Host:

- Extend #76's `designSentPreviews` record to carry the latest report.
- Panel footer replaces #76's blind prompt with the report: a count line, a disclosure listing
  each change and its verdict, and the actions.
- Summary on the transcript chip too — see "Where the outcome surfaces" below. The panel owns the
  actions; the chip carries the counts to where the user is actually looking after a send.
- Keep the pure/impure split the fork already favours: `verdictFor(expected, measured, kind)`
  is a pure function tested without a DOM; the measurement wrapper stays thin.

### Phase 2 — structural asks

Delete, text, reorder, absolute. Different checks, but the inputs already ride the wire:

- `delete` — the element is gone from the DOM.
- `text` — the element's text is now the requested text.
- `absolute` — the op's `expected` map compared against computed values; the parent's
  `position: relative` checked separately since it is measured on a different element.
- `move` — the `MovedFingerprint` answers "is the element with this content now at `toIndex`?",
  which is the question a reorder's own source address cannot answer (reordering JSX changes the
  line numbers the address is made of — see `StructuralOp`'s move docs).

`commitStructural` is the existing apply-side counterpart.

### Phase 3 — the knock-on wins

- **Re-send only what failed.** Build a fresh request from just the `unchanged` / `diverged`
  drafts. Nearly free once verdicts exist, and it turns a partial failure from "do that work
  again" into one click. This is the biggest user win in the whole plan.
- **Strengthen the agent-facing guardrail.** `shared/guardrails.ts`'s `NO_PREVIEW_GUARDRAIL`
  carries an explicit note that it must not promise automatic verification while the fork has
  none. Phase 1 is that something; restore the stronger upstream wording alongside it, and
  update the note.

## What this still will not tell you

That the page renders the asked-for value, not that the agent's edit is _good_. It could have
hardcoded a value, added an `!important`, or edited the wrong file to achieve the right pixels.
That is a code-review question and the turn's diff already answers it. Verification checks
outcome, not craft — and it should not pretend otherwise in its copy.

One benign false positive worth knowing: if the code already had the value (the user dragged
and came back to where they started), the verdict is `applied` although the agent did nothing.
That is arguably the correct answer — the code does produce the value — and the action it
offers (drop a redundant preview) is right either way.

## Verification of the verification

- `verdictFor` and the ledger's shape: pure unit tests, no DOM.
- The suppress/measure/restore pass: the esbuild-bundle-and-import pattern the design-mode guard
  already uses for engine leaves (`forkDesignMode.test.ts`), with a fake element exposing an
  inline-style shim — the same approach as #74's restore-original guard.
- A guard asserting the panel never renders "applied"/"verified" wording for an `unverifiable`
  verdict, mirroring #76's guard against claiming success.
- Protocol round-trip tests for the new message shapes, alongside the existing ones.

## Where the outcome surfaces: beside the agent's reply

Decided (2026-08-07): the verdict belongs on the transcript chip, not only in the panel.

After pressing Enter nobody is looking at the design panel — they are watching the agent work.
`ForkTranscriptDesignChanges` already renders a "Design change" chip on the sent user message,
which puts the outcome one glance from the agent's own account of what it did. Phase 1 should
carry the summary there, not treat it as a follow-up.

This is a placement decision, NOT a change of source of truth. The agent's message is a report
of intent and can never be the evidence:

- It is the failure mode this fork already has the receipt for. `cssOrigin.ts` exists because an
  agent changed `px-2.5` → `px-1`, reported it done, and the padding never moved — a rule in
  `ComposerShell.css` outranked the utility. The probe stops the fork ASKING for that edit;
  nothing stops an agent REPORTING it.
- The agent never observes the rendered result, so "did the pixel move" is outside what it can
  know, however honestly it answers.
- It misleads exactly the user this feature is for. Someone who reads code can go check
  `Card.tsx:42`; a designer reading "I've updated the padding" has no way to doubt it.

The two are complementary and should be read together — which is the argument for the placement:

- **Measurement answers _did it work_** — the half the agent structurally cannot supply.
- **The agent's reply answers _why not_** — which file it went to, what it could not find, what
  it decided instead. That is the half measurement cannot supply, and it is what turns "2 did
  not land" into something actionable.

A verdict with no explanation sends the user hunting; an explanation with no verdict is a claim.
Side by side they are a diagnosis. Implication for copy: the chip reports counts and verdicts
only, and never paraphrases or contradicts the agent's message — the two must read as separate
kinds of evidence, not as two opinions.

## Open questions

1. **Auto-clear the `applied` ones?** Tempting, and it makes the common case zero-click. Against:
   it is still a destructive action taken on the user's behalf, and the whole point of this plan
   is that the tool now has grounds — not permission. Recommend explicit for the first cut.
2. **How long does a report stay valid?** It is a measurement of a moment. Re-measuring on every
   page settle keeps it live; the alternative is showing a timestamp and letting it go stale.
   Recommend live.
