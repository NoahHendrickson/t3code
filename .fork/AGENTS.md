# Fork rules — read before changing anything

This repository is `NoahHendrickson/t3code`, a fork of `pingdotgg/t3code` that carries permanent
frontend customizations while continuously absorbing upstream. Full rationale and architecture:
`.fork/README.md`. These are the operating rules every agent (and human) must follow.

## Branches

| Branch          | Role                                                         | Rules                                                        |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `custom`        | The trunk. Default branch. What actually runs.               | Branch off it, land back into it via PR.                     |
| `main`          | Read-only upstream mirror, auto-fast-forwarded hourly by CI. | **Never** commit to it, merge into it, or target a PR at it. |
| `claude/sync-*` | Automated daily upstream-sync PRs into `custom`.             | Review them; don't base work on them.                        |

Base every working branch on `custom`. If a task description says "the default branch", that is
`custom`, not `main`.

Every pull request targets `NoahHendrickson/t3code` with base `custom`. GitHub's "New pull
request" UI on a fork defaults the base repository to `pingdotgg/t3code` — check it on every PR
you open, from the UI or the API. A PR against upstream publishes fork code to a repository this
fork only ever reads from; there is no valid reason to open one.

### One-time repository settings (not enforceable from files in this repo)

- Default branch: `custom` — GitHub only runs `schedule` workflows from the default branch, so
  the hourly mirror depends on it.
- Branch ruleset on `main`: block direct pushes and force pushes for everyone except the
  mirror's push credential, so the mirror invariant is enforced server-side rather than only
  detected after the fact by the workflow's fast-forward check. The mirror pushes with the
  `fork-sync-mirror push key` deploy key (secret `FORK_SYNC_PUSH_KEY`), not its workflow token —
  `GITHUB_TOKEN` can never hold the `workflows` permission, so token pushes are rejected whenever
  upstream touches `.github/workflows/*`. Any ruleset on `main` must put deploy keys (or that key
  specifically) on its bypass list, or the hourly mirror stops dead.

## Where a change goes — in order of preference

1. **New component / module / route** → `apps/web/src/custom/**`. Free-form paths; upstream can
   never conflict with files it has never seen.
2. **Changing an existing upstream module** → copy it to the same path under
   `apps/web/src/overrides/` and edit the copy. The build resolves the override ahead of the
   upstream file for every import site (aliased and relative); the upstream file stays untouched.
   List the shadowed path under `shadows:` in `.fork/customizations.yaml`. Prefer shadowing small
   leaf components (`components/ui/*`) over large hot files. See `apps/web/src/overrides/README.md`.
3. **Theme / styling** → `apps/web/src/theme.custom.css`. Scope every rule under
   `:root[data-fork="noahhendrickson-t3code"]`.
4. **Last resort: inline edit of an upstream file** → keep the hunk small, fence it:
   `/* fork:begin <id> — see .fork/customizations.yaml#<id> */` … `/* fork:end <id> */`, and add
   the file under `watch:` in the manifest.

## Dev state in a worktree moved (upstream a17cbc3b4)

A linked git worktree no longer shares `~/.t3/dev`. Its dev state is the worktree's own gitignored
`.t3`, and because `dev-runner` exports that as `T3CODE_HOME` the server treats the base dir as
explicit and derives the `userdata` leaf — so it is `<worktree>/.t3/userdata`, not
`<worktree>/.t3/dev`. On the first `vp run dev` after this sync, an existing worktree looks like it
lost every project, session, saved environment and pairing token. Nothing was deleted; the old
state is still at `~/.t3/dev`. Check that path exists before doing anything — if you had never run
a worktree dev server without an explicit `T3CODE_HOME`, there is no `~/.t3/dev` and nothing to
migrate; the empty state is simply a fresh start. To bring it over — **stop the dev server
first**, because
`state.sqlite` and its `-wal`/`-shm` siblings are being written live and copying them mid-write
snapshots an inconsistent database:

```bash
# with no dev server running
mkdir -p "$(git rev-parse --show-toplevel)/.t3/userdata"
cp -R ~/.t3/dev/. "$(git rev-parse --show-toplevel)/.t3/userdata/"
```

Do not reach for `--home-dir ~/.t3` instead. That resolves to `~/.t3/userdata` — the installed
app's live database, which is the exact value a packaged fork build refuses at startup
(`DesktopEnvironment.ts`). `--home-dir ~/.t3/dev` does not work either; it nests to
`~/.t3/dev/userdata`, a new empty directory.

Because `baseDir` also carries `caches/` and `worktrees/`, session worktrees now land at
`<worktree>/.t3/worktrees/<repo>/<branch>` — full checkouts inside the source tree. `.t3` is
gitignored, but test/fmt/lint discovery globs the filesystem rather than reading `.gitignore`, so
`.t3` is excluded in `vite.config.ts` — and in the four `.repos` exclusions in
`.vscode/settings.json`, so the editor does not watch, index, or offer auto-imports from a nested
checkout of this same repo — the way `.repos` already was. Keep those fences intact.

## Every customization requires

- An entry in `.fork/customizations.yaml` — `id`, `intent` (what must stay true, in plain words),
  `files`, `shadows`/`watch`, `verify`.
- A guard test in `apps/web/src/__fork_guards__/` asserting the _outcome_, so an upstream sync
  that silently drops the customization turns CI red instead of passing quietly.

## Never

- Commit to `main`, or "fix" the mirror workflow's fast-forward failure by force-pushing it.
- Open a pull request whose base repository is `pingdotgg/t3code`. This fork only pulls from
  upstream, never pushes to it — and GitHub's fork UI defaults new PRs to the upstream base, so
  the mistake is one unchecked dropdown away.
- Remove `fork:begin`/`fork:end` fences, `@effect-diagnostics` directives in fork files, or
  manifest entries — even if the surrounding code moved. Port them.
- Resolve a sync conflict by keeping upstream's version of a customized file without porting the
  intent recorded in the manifest.

## Auditing fences with grep

`apps/web/src/components/chat/ChatComposer.tsx` — the fork's densest fenced file — contains raw
NUL bytes (upstream's stash snapshot keys use `\0` delimiters inside template literals), so plain
`grep` classifies it as binary and reports **zero matches with exit 0**. Every ad-hoc fence audit
must use `grep -a` (or `rg`, or read the file) or it will silently skip the file that matters
most. The automated checks (`detect-drift.mjs`, `lint-owned.mjs`, the guards) read files directly
and are unaffected.

## Verify before pushing

Run the guard suite plus focused tests for what you touched (per the root `AGENTS.md` policy —
no full workspace runs): `vp test run apps/web/src/__fork_guards__` and the fork resolver tests
`vp test run apps/web/fork` when touching override machinery. Fork files must pass `vp fmt` and
the web typecheck; fork tooling and guard tests that need node builtins carry a file-level
`// @effect-diagnostics nodeBuiltinImport:off`.
