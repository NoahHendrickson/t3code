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

## Every customization requires

- An entry in `.fork/customizations.yaml` — `id`, `intent` (what must stay true, in plain words),
  `files`, `shadows`/`watch`, `verify`.
- A guard test in `apps/web/src/__fork_guards__/` asserting the _outcome_, so an upstream sync
  that silently drops the customization turns CI red instead of passing quietly.

## Never

- Commit to `main`, or "fix" the mirror workflow's fast-forward failure by force-pushing it.
- Remove `fork:begin`/`fork:end` fences, `@effect-diagnostics` directives in fork files, or
  manifest entries — even if the surrounding code moved. Port them.
- Resolve a sync conflict by keeping upstream's version of a customized file without porting the
  intent recorded in the manifest.

## Verify before pushing

Run the guard suite plus focused tests for what you touched (per the root `AGENTS.md` policy —
no full workspace runs): `vp test run apps/web/src/__fork_guards__` and the fork resolver tests
`vp test run apps/web/fork` when touching override machinery. Fork files must pass `vp fmt` and
the web typecheck; fork tooling and guard tests that need node builtins carry a file-level
`// @effect-diagnostics nodeBuiltinImport:off`.
