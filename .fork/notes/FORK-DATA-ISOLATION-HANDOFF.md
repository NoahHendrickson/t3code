# Fork data isolation — problem report and proposed fix

**Date:** 2026-07-26
**Repo:** `NoahHendrickson/t3code` (fork of `pingdotgg/t3code`)
**Branch:** `custom`, head `0dd24e35d`
**Context:** written after verifying [FORK-RELEASE-REVIEW.md](FORK-RELEASE-REVIEW.md), whose
§8.2 flagged "the fork build has never been launched" as the most valuable remaining check.

It was launched. **The isolation PR #6 claims is incomplete: a packaged fork build still
writes to the real app's `~/.t3/userdata`.** This document records the evidence, the root
cause, and a proposed fix.

Same convention as the review it follows: written to be **checked, not trusted**. Every
claim in §2 is an observation with the command that produced it. §6 is what I did not
verify.

---

## 1. Summary

PR #6 separated the fork's identity on the **desktop** side and verified it statically —
bundle id, `app.asar` strings, install path. All of that is correct and still holds.

But the packaged app is two processes. The Electron main process resolves its own state
directory; the **bundled backend server is a separate child process that re-derives its
own**. #6 changed the first and not the second. On launch they disagree:

```
desktop main  →  ~/.t3/userdata-fork      (new, correct)
server child  →  ~/.t3/userdata           (the real app's live database)
```

The server child is the one that owns `state.sqlite`.

Three directories are shared with the installed upstream app, not one:
`~/.t3/userdata`, `~/.t3/caches`, `~/.t3/worktrees`.

---

## 2. Evidence

Test protocol: full backup of `~/.t3/userdata` taken first
(`~/t3-userdata-backup-verify-20260725-2350`, verified byte-identical to source except the
live-appended trace log); sha256 manifests of `~/.t3/userdata` and
`~/Library/Application Support/t3code` recorded immediately before launch; the published
v0.1.1 DMG (`sha256 8943abc7…`, matching GitHub's recorded asset digest) copied to
`/Applications`; launched 2026-07-25 23:50 local. No upstream or dev T3 process was running
during the test, so every change below is attributable to the fork.

### 2.1 The fork's server opened the real database

`lsof +D ~/.t3/userdata` while the fork was running:

```
COMMAND     PID USER   FD   TYPE   SIZE/OFF    NODE NAME
T3\x20Cod 80965 noey   21u   REG     294912 2737139 /Users/noey/.t3/userdata/state.sqlite
T3\x20Cod 80965 noey   23u   REG      16512 4290667 /Users/noey/.t3/userdata/state.sqlite-wal
T3\x20Cod 80965 noey   25u   REG      32768 4290668 /Users/noey/.t3/userdata/state.sqlite-shm
```

`21u` is read-write. Inode `2737139` is the real database — the same inode the installed
0.0.28 app had open earlier in the session.

PID 80965 is unambiguously the fork's:

```
80965 80628 /Applications/T3 Code Fork.app/Contents/MacOS/T3 Code Fork \
            /Applications/T3 Code Fork.app/Contents/Resources/app.asar/apps/server/dist/bin.mjs \
            --bootstrap-fd 3
```

Its own log (`~/.t3/userdata-fork/logs/server-child.log`) records
`pid=80965 port=3773 cwd=/Users/noey`.

### 2.2 What it changed

| Surface                    | Before      | After                           |
| -------------------------- | ----------- | ------------------------------- |
| `state.sqlite` sha256      | `62374f7a…` | `7e7f25d4…`                     |
| `auth_sessions` rows       | 3           | 4                               |
| `logs/server.trace.ndjson` | `.1`…`.10`  | rotated; oldest `.10` discarded |
| `~/.t3/caches/*.json`      | 5 files     | all 5 rewritten (mtime 23:50)   |

The inserted row is a `desktop-bootstrap` session,
`b5cd0e65-fe7d-4aa6-86f9-e8cb901d8065` — the fork registering itself in the real app's
auth table.

`~/.t3/worktrees` is shared by the same mechanism but was empty, so nothing was observed.

### 2.3 What was _not_ damaged

- `secrets/` — byte-identical to the backup
- `clerk-tokens.json` — byte-identical
- `~/Library/Application Support/t3code` — 107 files, all hashes identical, directory
  mtime `23:47:49`, i.e. before the 23:50 launch. Electron user-data isolation works;
  `t3code-fork` was created and populated.
- `/Applications/T3 Code (Alpha).app` — still `T3 Tools, Inc. (ARK85ZXQ4Z)`, notarized,
  mtime Jun 29 19:05, v0.0.28

### 2.4 The desktop half did work

`~/.t3/userdata-fork` was created and holds `desktop-settings.json`,
`client-settings.json`, `logs/desktop.trace.ndjson`, `logs/server-child.log`. So the
symptom is precisely a split: desktop-side settings and logs isolated, server-side
database and caches not.

### 2.5 Schema divergence — measured, and it is not the hazard

FORK-RELEASE-REVIEW.md §8.1 left this open, and it is the one place that document is
_pessimistic_ rather than optimistic. Comparing the backup against the post-launch DB:

- `.schema` byte-identical
- `effect_sql_migrations`: 34 rows both, same latest entry
- `PRAGMA user_version`: 0 both
- 17 tables both

**No migration ran.** The "launching a fork build could have migrated `state.sqlite`
one-way" theory is not supported for this build against this database. The real harm is
concurrent writes from a second application, which is a different and more mundane failure
mode than the review assumed.

---

## 3. Root cause

The desktop hands the server exactly one path — the **base** directory, not the state
directory ([DesktopBackendConfiguration.ts:343](apps/desktop/src/backend/DesktopBackendConfiguration.ts:343)):

```ts
const bootstrap = { …, t3Home: environment.baseDir, … }
```

Each side then appends its own leaf independently:

|         | Derivation                                                                                 | Result                |
| ------- | ------------------------------------------------------------------------------------------ | --------------------- |
| Desktop | [DesktopEnvironment.ts:169](apps/desktop/src/app/DesktopEnvironment.ts:169) — forked by #6 | `~/.t3/userdata-fork` |
| Server  | [config.ts:101](apps/server/src/config.ts:101) — untouched                                 | `~/.t3/userdata`      |

`git show --stat fc3429503` confirms PR #6 touched only `apps/desktop/**`, `scripts/**`,
`.fork/customizations.yaml` and the guard test. `apps/server` was never in scope.

The same function also derives `join(baseDir, "caches")` and `join(baseDir, "worktrees")`,
which is why the leak is wider than the database.

### Why the guard did not catch it

`apps/web/src/__fork_guards__/forkAppIdentity.test.ts` asserts string literals in two
source files — `"userdata-fork"` is present, `"userdata"` is absent. Both assertions pass
on a build that shares the database, because the guard never relates the desktop's value to
the server's. It tests that a rename happened, not that the rename is sufficient.

---

## 4. Proposed fix — move `baseDir`, revert the leaf

Fork the **base** directory for packaged builds and put upstream's leaf name back:

```
Today   desktop → ~/.t3/userdata-fork      server → ~/.t3/userdata       ✗ diverge
Fixed   desktop → ~/.t3-fork/userdata      server → ~/.t3-fork/userdata  ✓ one input
```

Inside the existing `fork:begin fork-app-identity` fence in `DesktopEnvironment.ts`:

- **`baseDir`** ([line 153](apps/desktop/src/app/DesktopEnvironment.ts:153)) defaults to
  `~/.t3-fork` when `!isDevelopment`, `~/.t3` otherwise. The `T3CODE_HOME` /
  `configuredBaseDir` precedence is unchanged, so `vp dev` and `--home-dir` behave exactly
  as today.
- **`stateDir`** ([line 169](apps/desktop/src/app/DesktopEnvironment.ts:169)) reverts to
  upstream's `isDevelopment && Option.isNone(configuredBaseDir) ? "dev" : "userdata"`.
- **`userDataDirName`** (`t3code-fork`) and **`legacyUserDataDirName`** (`T3 Code (Fork)`)
  stay as #6 set them. Both were verified working at runtime in §2.3 — do not revert these.

Why this shape rather than also forking `apps/server/src/config.ts`:

1. **Agreement by construction.** Both halves derive from the same input, so they cannot
   drift apart again. A second leaf-rename would leave the same class of bug one upstream
   refactor away.
2. **Fixes `caches/` and `worktrees/` for free.** A server-side leaf rename would not.
3. **Keeps the fork diff out of `apps/server`.** Fewer files carrying fork hunks means
   fewer conflicts on upstream merges. `apps/server` is also what the published CLI builds
   from; the fork does not publish it, but leaving it untouched keeps that true by
   construction.

Dev state is untouched under this fix: dev keeps `~/.t3/dev` and `t3code-dev`.

**Verified in review (2026-07-26).** The fix shape was checked against the server's actual
consumption of the bootstrap. [cli/config.ts:264-277](apps/server/src/cli/config.ts:264)
treats `bootstrap.t3Home` as _non-explicit_ — `baseDirIsExplicit` is set only for the
`--base-dir` flag or `T3CODE_HOME` env — and in a packaged launch `devUrl` is undefined,
so the server's leaf is `"userdata"` unconditionally: `~/.t3-fork/userdata` falls out on
both sides. With `T3CODE_HOME` set, both halves resolve identically to
`$T3CODE_HOME/userdata` (which also means a user who explicitly sets
`T3CODE_HOME=~/.t3` points the fork at the real data — upstream semantics, opt-in, fine).

One phrase above deserves tempering: "agreement by construction" is really _agreement by
restoring upstream's own parallel derivations_. The leaf logic remains duplicated —
desktop keys on `isDevelopment && Option.isNone(configuredBaseDir)`, server on
`devUrl !== undefined && !baseDirIsExplicit` — and those could still drift. After the fix
the duplication is upstream's, which upstream keeps in agreement; the text guard in §7 is
what pins it for the fork.

**Trade-off worth stating:** the fork gets a genuinely empty environment on first launch —
no projects, no auth, no worktrees. That is the correct behaviour for a separate
application, but it is a visible change from what a tester might expect, and it should be
in the v0.1.2 release notes.

---

## 5. Plan

1. **Fix the divergence** as in §4. Update the `fork-app-identity` entry in
   `.fork/customizations.yaml` — its `intent` currently describes the leaf-rename approach
   and would be actively misleading after this change.

2. **Make the guard non-vacuous.** The invariant to assert is that the desktop's state
   directory equals what the server derives from the same `baseDir`. See §7 for the open
   question about how to express this; the fallback is a text guard asserting that
   `apps/server/src/config.ts` still derives its state dir from `baseDir`, which is the
   assumption the whole fix rests on — if upstream ever changes that, the fork must notice.

   **Review addition — the existing guard is a hard blocker, not a follow-up.**
   `forkAppIdentity.test.ts:53-54` asserts `'? "dev" : "userdata-fork"'` present and
   `'? "dev" : "userdata"'` absent — the exact ternary §4 reverts. Both assertions fail
   against the fix, so the guard rewrite must land in the same commit or CI blocks it.
   Note also that after the fix `".t3"` and `".t3-fork"` both legitimately appear in
   `DesktopEnvironment.ts` (dev keeps `~/.t3`), so the replacement must assert the full
   ternary shape, not bare string presence/absence.

3. **Add a launch check to `fork-release.yml`.** Every static check passed on a build that
   shared the database, so static checks are not sufficient evidence for this class of bug.
   A post-build step that launches the packaged app against a scratch `HOME`, waits for the
   server to bind, and asserts nothing was created outside the fork's `baseDir` is the only
   thing that closes §8.2 permanently.

4. **Re-verify by launching**, using the §2 protocol: backup, manifest, launch, `lsof` the
   server child specifically, diff. Confirm `~/.t3/userdata`, `~/.t3/caches` and
   `~/.t3/worktrees` are all untouched.

5. **Releases.** Cut v0.1.2 from the fix and verify it by launch **before** touching
   v0.1.1 — same ordering the previous session used correctly for v0.1.0, so there is never
   a window where the only available build is the bad one. Then delete v0.1.1 and its tag.

6. **Correct `FORK-RELEASE-REVIEW.md`.** See §8 for the specific claims.

---

## 6. What I did NOT verify

1. **A single launch, ~90 seconds, one machine.** Longer use, or use with the upstream app
   running concurrently, was not tested. Two processes writing one SQLite database is a
   worse scenario than the one measured, and it was not measured.

2. **Port contention.** Both apps default to `3773`
   ([config.ts:17](apps/server/src/config.ts:17),
   [DesktopApp.ts:29](apps/desktop/src/app/DesktopApp.ts:29)). The fork bound it because
   upstream was not running. What happens when both run is untested, and the fix in §4 does
   not address it.

3. **`t3code://` contention** — still open, exactly as §8.3 of the review left it. Both
   bundles register `t3code` and `t3code-dev`; no deep link was tested.

4. **Whether anything reads the discarded log.** `server.trace.ndjson.10` was rotated out
   of the live directory. It survives in the backup.

5. **An anomaly I could not re-check — mechanism now identified (2026-07-26 review).**
   While the fork ran, its GPU helper's argv showed
   `--user-data-dir=/Users/noey/Library/Application Support/t3code` — upstream's directory,
   not `t3code-fork`. The filesystem evidence contradicts any harm from this: `t3code` is
   byte-identical and its mtime predates the launch, while `t3code-fork` was created and
   populated. The review found the concrete mechanism: the override at
   [DesktopApp.ts:231](apps/desktop/src/app/DesktopApp.ts:231)
   (`electronApp.setPath("userData", …)`) runs inside an async Effect pipeline _after_
   `shellEnvironment.installIntoProcess`, which shells out and can be slow. Chromium spawns
   helper processes on its own timeline, so an early helper can capture the default
   `t3code` directory before the override lands. Electron user-data isolation therefore
   currently depends on winning a startup race. Follow-up (separate from §4): apply the
   `userData` override synchronously before the first async yield in startup.

6. **Linux and Intel** — unchanged from §8.4 of the review; `linuxDesktopEntryName` and
   `linuxWmClass` have still never been built or run.

7. **WSL backends escape the fix entirely (2026-07-26 review).**
   [DesktopBackendConfiguration.ts:403-404](apps/desktop/src/backend/DesktopBackendConfiguration.ts:403)
   deliberately omits `t3Home` from the WSL bootstrap so the Linux backend uses its own
   home directory — which means it defaults to `~/.t3/userdata` _inside WSL_, upstream's
   shared location. The §4 baseDir move does not propagate there: a Windows fork build
   using the WSL backend would still share WSL-side state with any upstream WSL usage.
   Low priority for a macOS-only deployment, but it is a real carve-out from the isolation
   claim and belongs in this list.

---

## 7. Open question for the implementer

> **Resolved by the implementation (PR #7).** The shipped answer is layered
> rather than a single in-process invariant test: (a) the text guard below,
> pinning the server's `baseDir` derivations and the desktop's `t3Home`
> handoff; (b) functional tests in `DesktopEnvironment.test.ts` covering the
> fork base, the `T3CODE_HOME=~/.t3` refusal, and packaged-dev containment;
> and (c) a packaged-launch isolation check in `fork-release.yml` that runs
> the built bundle against a scratch `HOME` — the only check in the set that
> exercises both real processes. The paragraph below is kept as the original
> analysis.

The invariant test in step 2 needs both values in one process. `apps/desktop` depends only
on `@t3tools/contracts` — **not** on `apps/server` — and `apps/server` is package `t3` with
no `exports` field, so `deriveServerPaths` is not importable from the desktop workspace as
things stand. Options, none of which I have tried:

- a relative cross-workspace import in the test only (may work under vite-plus in a
  monorepo; unverified)
- move the derivation, or a shared constant, into `@t3tools/contracts` — cleanest, but it
  edits a shared upstream contract, which the review's §5 deliberately avoided doing for
  `DesktopAppStageLabel`
- the text-guard fallback in step 2, which is weaker but has no such problem

I would start with the text guard so the fix is not blocked, and treat the real invariant
test as a follow-up.

---

## 8. Corrections owed to FORK-RELEASE-REVIEW.md

- **§5 and §7 overstate what was established.** The static checks were correct; the
  conclusion drawn from them — that the fork keeps state in `userdata-fork` — was not. This
  is the same failure §11 of that document confesses: the fact was in hand, the wrong
  conclusion drawn from it.
- **§8.1's severity is inverted.** Schema divergence is now measured and is _not_ the
  hazard; concurrent writes are.
- **`caches/` and `worktrees/` are unmentioned.** Both are shared today.
- **Port 3773 contention is unmentioned.**
- **§7's `app.asar` string counts are line counts, not occurrences** (`t3code-fork` is 4
  lines / 6 occurrences). Cosmetic, but the table reads as occurrence counts.
- **§10's quarantine note** applies to browser downloads; a DMG fetched with `gh` carries
  no quarantine bit.
- **§5's legacy-directory back door was never armed on this machine** —
  `~/Library/Application Support/T3 Code (Alpha)` does not exist. Redirecting
  `legacyUserDataDirName` is still correct in general; the stated severity is theoretical
  here.
- Stale artifacts from the reverted URL-scheme experiment are unmentioned and should be
  cleaned up: `~/Library/Application Support/t3code-fork-dev` and
  `apps/desktop/.electron-runtime/T3 Code Fork (Dev).app`, which registers
  `t3code-fork-dev:` and exists in no source file.

---

## 9. Current machine state

> **Point-in-time snapshot (2026-07-26, pre-fix).** Cleanup owed on this
> machine once a fixed build is verified: delete `/Applications/T3 Code
Fork.app` (v0.1.1), delete the orphaned `~/.t3/userdata-fork`, and note that
> `~/.t3/caches/*.json` were rewritten and one `auth_sessions` row was
> inserted per §2.2 (both inert). The backup can be removed once v0.1.2 is
> verified by launch.

- `/Applications/T3 Code Fork.app` is **still installed** and will repeat §2.2 on every
  launch. Do not run it until §4 lands.
- `/Applications/T3 Code (Alpha).app` — untouched, verified after the test.
- `~/.t3/userdata` — one extra `auth_sessions` row, one rotated-out log file, otherwise
  intact. Secrets and tokens verified identical.
- `~/.t3/userdata-fork` — created by the test, now orphaned.
- Backup: `~/t3-userdata-backup-verify-20260725-2350` (pre-test, complete).
- No restore was performed. Restoring would also revert upstream's own clean-shutdown WAL
  checkpoint, and the inserted row is inert.

---

## 10. Review addendum — 2026-07-26

This document was independently reviewed against the code before implementation. Every
code citation in §2–§7 was verified accurate: the `t3Home: environment.baseDir` handoff
(the only consumer of `environment.baseDir` outside `DesktopEnvironment.ts` itself), the
server's `"userdata"` / `"caches"` / `"worktrees"` derivations, the PR #6 commit scope,
both port-3773 citations, the package constraints in §7 (`apps/server` is package `t3`
with no `exports`; `apps/desktop` depends only on `@t3tools/contracts`), and the §9
machine state including the §8 stale artifacts (`t3code-fork-dev`, `T3 Code Fork (Dev).app`).

The review confirmed the diagnosis and the fix shape, and added three findings, now
integrated above:

1. **§5 step 2** — the existing guard test fails against the fix as written; the rewrite
   is a same-commit blocker.
2. **§6.7** — WSL backends deliberately drop `t3Home`, so the fix does not isolate
   WSL-side state.
3. **§6.5** — the GPU-helper anomaly is a startup race at `DesktopApp.ts:231`; the
   hypothesis is confirmed as mechanism, with a synchronous-override follow-up noted.

It also tempered §4's "agreement by construction" claim (see the verified note there).
