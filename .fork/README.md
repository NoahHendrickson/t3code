# Fork sync strategy — research findings

Research into keeping `NoahHendrickson/t3code` current with `pingdotgg/t3code` while carrying
a durable frontend delta that goes beyond design tokens.

Everything in `.fork/` is fork-only. Upstream will never touch this path, so it never conflicts.
That is not an accident — it is the first application of the principle this document argues for.

---

## 1. What the problem actually looks like

Measured against `upstream/main` on 2026-07-25.

| Metric | Value |
| --- | --- |
| Fork divergence from upstream today | `0` ahead, `0` behind — clean slate |
| Upstream commits, last 30 days | **200** (~7/day) |
| Of those, touching `apps/web` | **113** (~4/day) |
| Of those, touching `apps/web/src/index.css` | **23** |

Churn concentrates in exactly the files a real UI overhaul wants to edit:

| File | Commits (60d) | Lines | Line churn (60d) |
| --- | --- | --- | --- |
| `apps/web/src/components/ChatView.tsx` | 24 | 6,053 | +6,633 / −580 |
| `apps/web/src/index.css` | 23 | 1,580 | +1,943 / −363 |
| `apps/web/src/components/SidebarV2.tsx` | 21 | 2,732 | — |
| `apps/web/src/components/Sidebar.tsx` | 16 | — | — |
| `apps/web/src/components/chat/ChatComposer.tsx` | 15 | 2,747 | — |

`ChatView.tsx` more than doubled in size in two months. It is not a file — it is a moving target.

Contrast with the low-churn seams:

| File | Commits (60d) |
| --- | --- |
| `apps/web/vite.config.ts` | **2** |
| `apps/web/src/main.tsx` | **2** |
| `vite.config.ts` (root) | **1** |
| `apps/web/src/AppRoot.tsx` | **1** |

**The single most important conclusion:** a customization anchored in `vite.config.ts` costs ~2
conflict opportunities per two months. The same customization inlined into `ChatView.tsx` costs 24.
That is a **12x** difference in maintenance load, and it is decided by *where you put the change*,
not by how good the automation is.

Automation is the easy half of this problem. Conflict surface is the real lever.

---

## 2. Branch topology

```
upstream/main ──────────────────────────────────────▶   (pingdotgg/t3code)
      │
      │  fast-forward only, never commit here
      ▼
origin/main   ──────────────────────────────────────▶   pure upstream mirror
      │
      │  rebase (patch series replayed on each sync)
      ▼
origin/custom ──────────────────────────────────────▶   what you actually run/deploy
      │
      ├── claude/sync-YYYY-MM-DD   ← routine opens PRs into `custom` from here
      └── sync/YYYY-MM-DD (tags)   ← every green sync tagged for instant rollback
```

Rules:

- **Never commit to `main`.** It exists so `git log main..custom` is always the exact answer to
  "what have I changed?" That question is the foundation of everything below.
- `custom` is protected. It only advances through a PR that passed the guard suite (§4).
- Tag every successful sync. Rollback is `git reset --hard sync/<date>`, not an archaeology dig.

### Rebase, not merge

> **Amendment (2026-07-25, operational):** the automated flow runs *merge-based* syncs — the
> routine merges `origin/main` into a `claude/sync-*` branch cut from `custom` and PRs that into
> `custom`. Rebasing would rewrite `custom`'s history, and the PR-gated flow (no force-push to
> `custom`) would then re-merge duplicated commits every round. The delta question stays
> answerable as `git log main..custom --no-merges` / `git diff main...custom`. Rebase remains the
> right tool for *manual* history cleanup, where a force-push of `custom` is a deliberate act.

Merging upstream into `custom` resolves each conflict permanently and needs no force-push — which
sounds better until you try to answer "what have I changed?" six months in, and the answer is
entangled across 200 merge commits.

Rebase keeps the delta as an ordered, readable patch series you can inspect, reorder, split, or
drop. The classic objection — you re-resolve the same conflicts every time — is answered twice
over here:

1. **`git rerere`** replays previously-recorded conflict resolutions automatically. Enable it, and
   commit the cache so the cloud agent inherits your resolution history:
   ```bash
   git config rerere.enabled true
   git config rerere.autoUpdate true
   ```
   Persist `.git/rr-cache` to a `fork/rerere-cache` branch and restore it at the start of every
   automated run. Without this, every routine run starts amnesiac and re-solves solved problems.

2. **Semantic conflict resolution is what the agent is for.** When upstream splits `ChatView.tsx`
   into `ChatView.tsx` + `ChatHeader.tsx`, git reports a conflict it cannot reason about. Claude
   can read both sides, understand that your customization belongs in the extracted component now,
   and move it. That capability is the entire reason to reach for agents here rather than a shell
   script — see §5.

---

## 3. Conflict-surface architecture — ranked by durability

This is the part that determines whether the automation succeeds or becomes a treadmill. Four
tiers. Push every customization as far up this list as it will go.

### Tier 1 — Additive files (zero conflict, forever)

New files upstream does not know about. `.fork/`, `apps/web/src/custom/**`,
`apps/web/src/theme.custom.css`. Upstream can never conflict with a file it has never seen.

`src/custom/` is for components upstream has no equivalent of. It carries no shadow semantics —
paths are free-form. Keep it distinct from `src/overrides/` (Tier 2), where a path that matches no
upstream module is a silent bug.

For theming: one additive stylesheet, imported by a **one-line** append to `index.css`. That file
changed 23 times in 60 days, but a trailing `@import "./theme.custom.css";` conflicts only if
upstream also edits the last line — and when it does, the resolution is obvious every time.

### Tier 2 — The override resolver (the key enabler for non-token changes) — **implemented**

A `fork:overrides` Vite plugin resolves a shadow tree ahead of upstream:

```
apps/web/src/overrides/components/chat/ChatComposer.tsx
          ↑ wins over ↓
apps/web/src/components/chat/ChatComposer.tsx
```

Every import site keeps resolving `~/components/chat/ChatComposer` — or `../chat/ChatComposer` —
and gets your version. Your diff against upstream becomes: **three small config edits + N files
upstream has never seen.** Structural UI changes, restructured layouts, replaced components — all
at zero merge cost.

| File | Role |
| --- | --- |
| `apps/web/fork/overrideResolver.ts` | Pure resolution rules — no Vite import, fully unit-testable |
| `apps/web/fork/vitePluginForkOverrides.ts` | Plugin shell: stat cache + dev-server invalidation |
| `apps/web/fork/overrideResolver.test.ts` | Resolution tests + the shadow-tree integrity guard |
| `apps/web/src/overrides/` | The shadow tree (see its `README.md` for usage) |

Wiring, all in files with near-zero upstream churn (§1):

- `apps/web/vite.config.ts` (2 commits/60d) — plugin registration, `enforce: "pre"` so it claims
  `~/*` ahead of `resolve.tsconfigPaths`; test glob extended to cover `fork/`.
- `apps/web/tsconfig.json` (**0** commits/60d) — `~/*` mapped override-first, plus `~upstream/*`.

Three behaviours worth knowing, each covered by a test:

- **Relative imports are redirected too.** This is not optional: `apps/web/src` has ~1450 relative
  imports against ~394 `~/` imports, so an alias-only resolver would miss ~79% of import sites.
- **The shadow tree is a transparent overlay.** An upstream file copied into `overrides/` works
  with its imports unmodified — `../ui/button` still means "the button module", preferring a
  sibling override and falling back to upstream. That keeps the copy diff-clean against upstream,
  so porting later upstream changes into a shadow stays a 3-way merge.
- **Self-imports resolve to upstream.** `~upstream/…` is the explicit escape hatch, and an
  override importing its own path gets upstream rather than recursing. Both matter because the
  tsconfig mapping is also override-first, so deferring to normal resolution would loop.

**Known gap:** tsconfig gives type parity for `~/` imports only. Relative imports type-check
against upstream while the bundler loads the override, so an override that changes a module's
*public API* type-checks clean and breaks at runtime. Keep overrides API-compatible until this is
closed by generated contract assertions (`typeof import(…)` assignability per shadowed module).

**The honest trade-off:** a shadowed file is a hard fork of that file. You stop receiving upstream
improvements to it. This is unavoidable for genuinely divergent UI, but it must be *visible* rather
than silent — which is exactly what the drift detector in §5 is for: when upstream changes a file
you shadow, you get told, with the upstream diff, and decide whether to port it.

Prefer shadowing small leaf components over large ones. Shadowing `ui/button.tsx` (a stable `cva`
primitive) is cheap and high-leverage. Shadowing `ChatView.tsx` (6k lines, +6,633 in 60 days) means
inheriting the maintenance of a file that doubles every two months — do that only if you truly
intend to own the chat surface.

### Tier 3 — Composition seams

Before shadowing a big component, check whether the change can be expressed as a wrapper: shadow
the *parent* that renders it, and have your version render upstream's child with different props
or inside your own chrome. You keep upstream's internals and own only the arrangement.

The `ui/` primitives (44 shadcn-style files, mostly `cva` variant tables) are the highest-leverage
target in the codebase. Shadowing `button.tsx`, `dialog.tsx`, and `input.tsx` to add or restyle
variants propagates through every consuming component without touching a single consumer.

### Tier 4 — Inline edits to hot upstream files

Sometimes unavoidable. When it is:

- Keep hunks small and contiguous.
- Fence them so both a human and an agent can find them instantly:
  ```tsx
  /* fork:begin custom-composer-layout — see .fork/customizations.yaml#composer-layout */
  ...
  /* fork:end custom-composer-layout */
  ```
- One customization per commit, message prefixed `fork:` — so the patch series stays legible.

Every Tier 4 entry is technical debt with a known interest rate. Track them; migrate them upward
when you can.

---

## 4. The guarantee layer — "my changes stick"

This is the part that is usually skipped, and it is the part that makes the difference between
automation you trust and automation you babysit.

A rebase can **succeed** and still silently destroy your work: upstream rewrites a component you
customized, git resolves cleanly because your hunk no longer applies anywhere, and your UI change
evaporates with a green checkmark. No conflict, no error, no signal.

You need three artifacts that are all Tier 1 — files upstream never touches, so they never conflict
and never get "resolved away."

### 4a. `.fork/customizations.yaml`

The machine- and human-readable register of every intentional deviation. This is what the agent
reads before resolving a conflict, so it knows *intent* rather than guessing from a diff.

```yaml
- id: composer-glass-surface
  intent: >
    The composer floats on a translucent blurred surface with the thread visible
    behind it, rather than sitting on an opaque bar.
  tier: 2
  files:
    - apps/web/src/overrides/components/chat/ChatComposer.tsx
    - apps/web/src/theme.custom.css
  shadows:
    - apps/web/src/components/chat/ChatComposer.tsx   # watch upstream for drift
  verify:
    - apps/web/src/__fork_guards__/composer-glass.test.tsx
```

### 4b. Guard tests — `apps/web/src/__fork_guards__/**`

Assertions that your UI invariants still hold. The repo already runs a `unit` Vitest project over
`src/**/*.test.{ts,tsx}` with browser-mode tests (`AppRoot.test.tsx`, `MessagesTimeline.test.tsx`,
`sidebar.test.tsx` are working precedents to copy).

Write one guard per manifest entry, asserting the *outcome*, not the implementation:

```tsx
// Fails loudly if a "clean" rebase silently drops the customization.
it("composer renders on the translucent glass surface", () => {
  render(<ChatComposer {...fixture} />)
  expect(screen.getByTestId("composer-surface")).toHaveClass("backdrop-blur-glass")
})
```

**This is the highest-leverage single thing in this whole document.** It converts a silent,
invisible failure mode into a red CI check. Everything else is optimization; this is the safety net.

### 4c. Visual snapshots

Guard tests catch structural loss. They do not catch "it still renders, it just looks wrong now."
Commit reference screenshots of your key surfaces and have the verification routine (§5) capture
and compare them using the repo's existing `test-t3-app` skill, which already knows how to launch
an isolated environment, authenticate via a pairing URL, and drive the real browser.

---

## 5. The automation stack

Three layers. Each does what it is genuinely best at — putting cheap deterministic work in CI and
reserving agent runs for the judgment calls.

### Layer 1 — Mirror `main` (GitHub Actions, free, no agent)

A scheduled workflow that fetches upstream and fast-forwards `origin/main`. Pure plumbing, zero
judgment, no reason to spend a routine run on it. Run it hourly.

Give it a second job: **drift detection.** Diff the newly-mirrored commits against the `shadows:`
and Tier-4 file lists in `customizations.yaml`. When upstream touches a file you have shadowed or
patched, that is the signal worth acting on.

### Layer 2 — The sync routine (Claude Code cloud routine)

Where the agent earns its cost: semantic conflict resolution against stated intent.

- **Trigger:** daily schedule. Daily beats weekly — absorbing ~7 upstream commits produces small,
  tractable conflicts; absorbing ~50 produces a mess. Ideally, make it *event-driven* instead:
  have Layer 1's drift detector `POST` to the routine's **API trigger** endpoint with the list of
  drifting files as `text`, so the routine runs when there is real work rather than every day
  regardless. (Routine prompts must explicitly opt into reading the fire payload — the docs are
  clear that `text` arrives wrapped as untrusted data and is inert otherwise.)
- **Environment:** needs `github.com` reachable — the **Trusted** default allowlist covers it.
  Package installs (`vp i`) are covered too. Put `vp i` in the environment's **setup script** so
  the result is cached instead of reinstalled on every run.
- **What it does:**
  1. Restore the `rerere` cache from `fork/rerere-cache`.
  2. `git rebase origin/main` onto `custom`.
  3. On conflict: read `.fork/customizations.yaml` for the affected entry's stated **intent**, and
     resolve to preserve *that*, not to preserve the literal old lines. This is the step no script
     can do.
  4. Run the guard suite, `vp check`, and `vpr typecheck`.
  5. Save the updated `rerere` cache back.
  6. Open a PR from `claude/sync-YYYY-MM-DD` into `custom`, with a summary of what upstream changed,
     which customizations needed rework, and why.
- **Auto-merge when:** rebase was conflict-free *and* the full guard suite is green. Otherwise the
  PR waits for you. This is the correct place to draw the human-in-the-loop line — you review
  judgment calls, not clean fast-forwards.

### Layer 3 — The verification routine (GitHub trigger)

A **separate** routine on a `pull_request.opened` GitHub trigger, filtered to head branch
`claude/sync-*`. It launches the app via `test-t3-app`, walks the customized surfaces, captures
screenshots, diffs them against `.fork/snapshots/`, and comments on the PR with before/after.

Keeping this separate from Layer 2 is deliberate: an agent verifying its own conflict resolution is
a weak check. An independent session, with no memory of the reasoning that produced the diff,
looking only at pixels, is a real one.

### Constraints found in the docs — read these before building

- **No GitHub trigger on upstream.** GitHub triggers require the Claude GitHub App installed on the
  repository, and only fire for repositories connected to *your* account. You do not control
  `pingdotgg/t3code`, so upstream pushes and releases will never webhook you. Polling from Layer 1
  is not a shortcut — it is the only option. Plan around it.
- **Daily routine caps:** Pro 5 runs/day, Max 15, Team/Enterprise 25. A daily sync + per-PR
  verification fits comfortably in any tier. One-off runs are exempt from the cap.
- **Branch prefix:** routines can only push to `claude/`-prefixed branches unless you enable
  **Allow unrestricted branch pushes**. Leave that off — the `claude/sync-*` → PR → `custom` flow is
  better hygiene anyway, and it is what makes Layer 3's trigger filter possible.
- **Routines run fully autonomous** — no permission prompts, and every included connector is usable
  including writes. Trim the routine's connector list to GitHub only.
- **Green status ≠ success.** The docs are explicit: a green run means the session exited without
  infrastructure error, not that the task worked. Your guard suite is what actually tells you the
  sync was good. Do not treat the routine's status dot as a signal.
- `/schedule` is unavailable *from inside* a cloud session — create and edit routines at
  [claude.ai/code/routines](https://claude.ai/code/routines) or from the local CLI.

---

## 6. Recommended rollout order

Deliberately ordered so the safety net exists before the automation that needs it.

| # | Step | Why here |
| --- | --- | --- |
| 1 | Create `custom` off today's `main`; stop committing to `main` | Free right now — the fork is at 0/0 divergence. This is the cheapest this will ever be. |
| 2 | ~~Land the Tier-2 override resolver~~ — **done** | Had to exist *before* any UI change, or those changes land as Tier-4 inline edits and inherit the churn. |
| 3 | Add `.fork/customizations.yaml` + first guard tests | The safety net has to predate the automation that can silently tear it. |
| 4 | Layer 1 mirror workflow + drift detector | Deterministic, free, useful standalone. |
| 5 | Layer 2 sync routine, opening PRs only (no auto-merge) | Build trust by watching it work for a couple of weeks. |
| 6 | Layer 3 verification routine | Add once there are real PRs to verify. |
| 7 | Enable auto-merge for clean + green syncs | Only after the guard suite has demonstrably caught something. |

## 7. "Can't we skip merging entirely and just consume upstream's diffs additively?"

The question deserves a direct answer, because the intuition behind it is half right, and the half
that is right is the foundation of this whole design.

### The literal version does not work

The literal version — read each upstream diff, take only the lines it *adds*, and graft them onto
our tree without ever merging — fails for reasons that are structural, not tooling gaps:

1. **Upstream diffs are not additive.** Real changes are refactors, renames, deletions, and
   signature changes. In the last 60 days `ChatView.tsx` alone saw −580 lines removed against
   +6,633 added, and the added lines *reference the removed lines' replacements*. Take the
   additions without the modifications and the result does not compile — the new code calls
   functions whose signatures we declined to update.
2. **Nobody has ever run the tree you'd synthesize.** Upstream's CI validates *their* tree. A
   selectively-grafted tree is a combination that has never existed anywhere — every sync would
   produce a build with no provenance, and every bug in it would be yours alone to debug.
3. **Fixes are frequently subtractive.** Bug fixes and security patches are often deletions or
   modifications. A policy of "only take additions" is a policy of keeping every bug whose fix
   involved changing a line.
4. **The failure compounds.** Each selective graft moves your tree's context further from the
   context upstream's next diff was written against. Patch application gets less reliable every
   round — the strategy is a treadmill that speeds up.

### The inverted version is exactly what this design does

Flip the polarity, and the intuition becomes correct — and buildable:

> **Upstream's changes flow in wholesale and untouched. *Your* changes are the additive layer.**

That is precisely the §2 topology plus the §3 Tier system:

- `main` fast-forwards to upstream. No merging, ever, in the meaningful sense — their tree arrives
  exactly as their CI validated it.
- Your delta lives in files upstream has never seen (`.fork/`, `src/custom/`, `src/overrides/`,
  `theme.custom.css`) that *win at build time* via the override resolver. Git never has to merge
  upstream into your files, because from git's perspective your files don't overlap with theirs.
- The result satisfies the actual goal behind the question — "we don't merge their updates, we
  stay additive" — without the compile-breakage, provenance, and compounding-drift problems,
  because the additive layer is on the side you control.

The residual — the only place anything merge-like ever happens — is shadowed files. When upstream
improves a file you've overridden, you are not *forced* to reconcile; the drift detector (§5,
Layer 1) surfaces the upstream diff and you (or the sync routine) **choose**: port it, or
explicitly decline it. Which brings us to the workflow the question was really reaching for.

### "Look at what the diffs are" — the porting loop, done additively

There *is* a legitimate diff-reading, additive-from-our-side workflow, and it is the right job for
a cloud agent:

1. Layer 1 detects upstream touched `components/chat/ChatComposer.tsx`, which we shadow.
2. The sync routine reads upstream's diff **as intent, not as text**: "they added paste-to-attach
   handling to the composer."
3. It applies that intent to *our* `overrides/.../ChatComposer.tsx` — a semantic port into a file
   we own, not a textual merge into a file we share. Because shadow copies keep their imports
   upstream-identical (§3, Tier 2), this is usually a clean 3-way merge; when it isn't, the agent
   reasons from `customizations.yaml` intent.
4. Guard tests confirm our invariants survived; the port lands as an ordinary fork-owned commit.

So: upstream-diffs-consumed-additively is unsound as a *repo strategy*, but exactly right as a
*shadowed-file maintenance strategy* — and the narrower the shadow tree (prefer Tier 1/3 over
Tier 2, prefer leaf primitives over `ChatView.tsx`), the less of this loop you ever run.

---

## 8. What to watch

- **Guard coverage ratio** — entries in `customizations.yaml` that have no `verify:` guard. This
  number should be zero. Anything above zero is a customization that can vanish silently.
- **Tier distribution** — the count of Tier-4 inline edits. If it grows, the override resolver is
  not being used and the fork is drifting back onto the treadmill.
- **Shadow drift** — shadowed files where upstream has moved substantially since you forked them.
  Each is a decision deferred: port the upstream improvement, or accept the divergence explicitly.
