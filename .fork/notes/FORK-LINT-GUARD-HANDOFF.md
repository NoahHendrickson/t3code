# Fork-owned lint cleanliness — problem report and proposed guard

**Date:** 2026-07-26
**Repo:** `NoahHendrickson/t3code` (fork of `pingdotgg/t3code`)
**Branch:** `custom`, head `ee0d0742d`
**Context:** written after the review of [#16](https://github.com/NoahHendrickson/t3code/pull/16),
which proposed this guard. #16 was the _third_ pass over the same nine dead imports.

Same convention as [FORK-DATA-ISOLATION-HANDOFF.md](FORK-DATA-ISOLATION-HANDOFF.md): written
to be **checked, not trusted**. Every claim in §2 is an observation with the command that
produced it. §7 is what I did not verify. §8 is the open question you have to answer.

---

## 1. Summary

Nothing in this repository fails on a lint warning. `vp lint` exits 0 with warnings present,
and no `--max-warnings` is set anywhere. Twenty-one warnings accumulated in total silence and
were only ever counted because a human happened to read a lint tail.

Three PRs touched the same nine dead imports: #14 created them, #15 miscounted them off a
truncated tail, #16 removed them. The removal was never the hard part — noticing was.

The fork's guard apparatus exists precisely to catch "the fork drifted and nothing noticed."
This is that, one level up, in the one place the apparatus does not look.

**Proposal:** fail CI when a _fork-owned_ file produces a lint warning. Zero tolerance where
the fork owns the code; silence on the 12 upstream warnings it cannot fix.

---

## 2. Evidence

### 2.1 Warnings do not fail anything

```
$ grep -rn "max-warnings" .github/workflows/*.yml package.json vite.config.ts
(no output)

$ vp lint --report-unused-disable-directives > /tmp/l.txt 2>&1; echo "EXIT=$?"
EXIT=0
$ grep -c warning /tmp/l.txt
12
```

CI runs `vp check` and `vpr typecheck` ([ci.yml:32-36](../../.github/workflows/ci.yml)); neither
gates on warning count.

### 2.2 The current 12 are all upstream's

`ChatMarkdown.tsx`, `CommandPalette.tsx`, `sidebar/SidebarUpdatePill.tsx`,
`hooks/useHandleNewThread.ts`, `ThreadTerminalDrawer.tsx:750`. Verified byte-identical to
`origin/main` during #16 review. **After #16 merges, fork-owned surfaces are at zero
warnings** — which is what makes now the moment to install a ratchet at zero.

### 2.3 The mechanism works — verified by planting a warning

This is the load-bearing check for the whole proposal, so it was run rather than assumed.

`vp lint` accepts paths and forwards options to Oxlint (`vp lint --help`). Planting an unused
import in a fork-owned file:

```
$ printf 'import { CopyIcon } from "lucide-react";\n' | cat - apps/web/src/custom/forkMarker.ts > /tmp/fm.ts
$ cp /tmp/fm.ts apps/web/src/custom/forkMarker.ts

$ vp lint apps/web/src/custom                        # scoped to a directory
apps/web/src/custom/forkMarker.ts:1:10: warning eslint(no-unused-vars): Identifier 'CopyIcon' …
EXIT=0

$ vp lint apps/web/src/custom/forkMarker.ts --max-warnings 0
apps/web/src/custom/forkMarker.ts:1:10: warning eslint(no-unused-vars): Identifier 'CopyIcon' …
EXIT=1          ← the guard is implementable exactly as proposed
```

Path scoping works at both directory and file granularity, `--max-warnings` does forward to
Oxlint, and it does produce a non-zero exit. Probe reverted; repo back to 12 warnings.

**One negative result worth knowing:** a module-level `const __probeUnused = 1;` produced _no_
warning. `no-unused-vars` fires on unused _imports_ under this config, not unused module-level
consts. Do not use a bare const as your test fixture — it will pass and you will conclude the
guard works when it has not run.

### 2.4 Fork-owned surfaces today

```
apps/web/src/custom             10 lintable files
apps/web/src/overrides           0 lintable files   (README.md only)
apps/web/src/__fork_guards__    17 lintable files
```

Plus `files:` entries in `.fork/customizations.yaml` — 20 paths, of which **9 are not
lintable**: `.md`, `.png`, `.ico`, `.css`, `.yml`, `.sh`. Any implementation must filter by
extension or Oxlint will be handed a PNG.

---

## 3. Why scoped, not global

The cheap version — `--max-warnings 12` on the root `lint` script — is the wrong shape, and
this is the part most likely to get "simplified" back into the codebase by someone who has not
thought about it.

`--max-warnings 12` ratchets against **upstream**. The first sync that lands an upstream
warning turns the build red for code the fork does not own and cannot fix. The only available
response is to raise the number, which trains everyone to raise the number, which is how
ratchets die.

Scoping to fork-owned files avoids this entirely: upstream can add as many warnings as it
likes and the gate stays green, because the gate never looks there.

---

## 4. Proposed shape

A script — `.fork/lint-owned.mjs`, alongside `detect-drift.mjs` and following its conventions
(dependency-free, line-based manifest parsing, runs in a bare Actions runner) — that:

1. reads `.fork/customizations.yaml` and collects every `files:` entry
2. adds the three fork-owned directories from §2.4
3. filters to `.ts` / `.tsx`
4. execs `vp lint <paths…> --max-warnings 0`
5. exits with its status

Wired in two places:

- **CI** — a step in the `check` job, fenced, next to the existing `Lint release scripts`
  step which is the closest precedent ([ci.yml:114-122](../../.github/workflows/ci.yml))
- **A guard test** — `apps/web/src/__fork_guards__/forkOwnedLint.test.ts`, registered under a
  new `fork-lint-cleanliness` manifest entry, so the invariant is discoverable the same way
  every other fork invariant is

§8 is the open question about whether the guard test should shell out at all.

---

## 5. Plan

1. **Land #16 first.** It takes fork-owned surfaces to zero warnings. Installing a
   zero-tolerance gate before that is installing a red build.

2. **Write `.fork/lint-owned.mjs`.** Reuse `parseCustomizations` from `detect-drift.mjs` —
   it is already exported and already handles the constrained manifest subset. Do not write a
   second parser.

3. **Add the manifest entry** `fork-lint-cleanliness`, with `files:` listing the script
   itself, `watch:` on `.github/workflows/ci.yml` and `package.json` (both carry the wiring;
   both are upstream files upstream edits), and `verify:` pointing at the guard test.

4. **Add the guard test.** See §8 before deciding its shape.

5. **Wire CI**, fenced:
   `# fork:begin fork-lint-cleanliness — see .fork/customizations.yaml#fork-lint-cleanliness`

6. **Prove it fails.** Plant an unused _import_ (not a const — see §2.3) in a fork-owned file,
   confirm the guard goes red, revert. A guard that has only ever been observed passing is not
   evidence of anything. Put the transcript in the PR body.

---

## 6. Design decisions already made, with reasons

Recorded so they are not silently re-litigated:

- **Zero tolerance, not a count.** A count is a number someone raises. Zero is a rule.
- **Fork-owned only.** §3.
- **Warnings, not errors.** Errors already fail — `vp check` runs lint and there are 0 errors.
  This guard is entirely about the warning tier, which is where the debt actually lives.
- **Extension filter is mandatory.** §2.4 — nine `files:` entries are images, shell, YAML,
  CSS and Markdown.

---

## 7. What I did NOT verify

1. **CI behaviour.** Everything in §2 ran on macOS locally. The guard has never run in an
   Actions runner. `vp lint` with an explicit path list under `setup-vp` with `run-install:
true` is untested there.

2. **Path list length.** 27 lintable paths today. Whether a growing list hits an argv limit,
   or whether Oxlint dedupes an overlapping dir + file argument sanely, is untested. Passing
   `apps/web/src/custom` _and_ `apps/web/src/custom/forkMarker.ts` together was never tried.

3. **Interaction with `lint.ignorePatterns`.** `vite.config.ts` carries an ignore list that
   now includes `.t3`. Whether an explicitly-passed path overrides an ignore pattern, or is
   silently skipped, is untested — and it matters, because a silently-skipped path is a guard
   that passes while looking at nothing.

4. **Whether a fork file ever legitimately needs a suppression.** If one does, the guard must
   have an escape hatch, and an escape hatch with no policy becomes the default. Not designed.

5. **`--type-aware` rules.** `vite.config.ts:120-124` sets `typeAware: false` and
   `typeCheck: false`. Whether enabling those on fork-owned files only is desirable, or even
   coherent, was not explored.

6. **The 12 upstream warnings were not re-verified for this document.** The claim they are all
   upstream's comes from the #16 review's byte-comparison against `origin/main`, which I
   confirmed for `ThreadTerminalDrawer.tsx` only.

---

## 8. Open question for the implementer

**Should the guard test shell out to `vp lint`, or should CI carry it alone?**

Every existing guard in `apps/web/src/__fork_guards__/` is a text-assertion test: it reads a
source file and asserts on its contents. None spawns a subprocess. A lint guard is different
in kind — the thing it asserts cannot be established by reading one file.

Options, none of which I tried:

- **Guard test spawns `vp lint`.** Discoverable, runs with `vp run test`, matches where every
  other fork invariant lives. But it puts a multi-second subprocess inside the unit suite, and
  `apps/web` tests currently complete in ~10s for 1646 tests. It would also be the only guard
  that fails for reasons outside its own file.
- **CI step only.** Fast, honest about being a CI concern. But it is invisible to
  `vp run test`, so a developer only learns on push — and `verify:` in the manifest would have
  nothing to point at, which breaks the pattern every other entry follows.
- **Both, with the test asserting the CI step exists.** The text-assertion shape the existing
  guards already use — `ciOnCustom.test.ts` does exactly this for a workflow trigger. The
  guard asserts the wiring is present rather than re-running the lint. Cheapest, keeps the
  suite fast, and fits the established idiom.

I would take the third. It is the one that matches what the guard directory already is, and it
keeps the expensive check in the place that is already paying for expensive checks. But it is a
weaker guarantee — it pins the wiring, not the outcome — and that trade should be a deliberate
choice rather than inherited from this note.

---

## 9. Out of scope, recorded here so it is not lost

`CLAUDE.md` is a **broken symlink**. Its committed blob is `AGENTS.md\n` — ten bytes including
the trailing newline — so it points at a filename that does not exist:

```
$ git cat-file -p HEAD:CLAUDE.md | xxd
00000000: 4147 454e 5453 2e6d 640a                 AGENTS.md.

$ cat CLAUDE.md
cat: CLAUDE.md: No such file or directory
```

Same blob in `origin/main`, so it is upstream's. Every agent instructed to read `CLAUDE.md`
silently gets nothing. Surfaced by the #16 review; unrelated to this guard; **nothing is being
filed upstream** — recorded here only so the finding survives.
