# Fork release — verification findings

Independent check of the fork release work through `0dd24e3` (release `v0.1.1`).

This was meant to be a review of `FORK-RELEASE-REVIEW.md`. **That file does not
exist** — not in the working tree, not in any commit on any branch, not in the
stash, not anywhere on the filesystem. Its §7/§8/§9 claims could not be read, so
what follows verifies the underlying work directly rather than the document.

## Verdict

The install collision is fixed. **The data collision is not.** A launched fork
build still opens the upstream app's live database.

## Confirmed working

Packaged fork builds carry their own shell identity, and the code backs it up:

| Identity | Fork value |
| --- | --- |
| Bundle id | `com.t3tools.t3code.fork` |
| Installed app | `T3 Code Fork.app` |
| Desktop state dir | `~/.t3/userdata-fork` |
| Electron user data | `t3code-fork` |
| Legacy migration dir | `T3 Code (Fork)` |

`v0.1.1` is real: prerelease, built from `0dd24e3`, unsigned macOS arm64
(`T3-Code-0.1.1-arm64.dmg` / `.zip`, blockmaps, `latest-mac.yml`).

Fork guards pass — 8 of 11 files, all green (`forkAppIdentity` 7/7,
`forkDesktopRelease` 4/4, `releaseUpstreamOnly` 3/3, `customizationsManifest`
3/3, `forkWorkflowDocs` 2/2, `forkMarker` 4/4, `ciOnCustom`, `ciRunners`).

## Bug 1 — the backend still uses the shared state directory

The isolation stops at the Electron shell. The server never got it.

The desktop spawns the backend passing only `t3Home: environment.baseDir` —
`~/.t3`, the *base* dir, not the fork state dir
(`apps/desktop/src/backend/DesktopBackendConfiguration.ts:343`).
`packages/contracts/src/desktopBootstrap.ts` exposes only `t3Home`; there is no
field for a state dir. The server then derives its own
(`apps/server/src/config.ts:103`):

```ts
const stateDir = join(baseDir, devUrl !== undefined && !options.baseDirIsExplicit ? "dev" : "userdata");
```

In a packaged build `devUrl` is undefined, so this is unconditionally
`"userdata"`. No `fork:begin` block exists anywhere under `apps/server`.

**A launched fork build's backend therefore opens `~/.t3/userdata/state.sqlite`**,
along with `attachments/`, `logs/`, `keybindings.json` and `settings.json` — the
exact harm `fc34295` describes preventing. What that commit fixed was the
`/Applications` collision and the Electron user-data collision, not the database.

Follow-on effects:

- **Split-brain settings.** The desktop reads server settings from
  `~/.t3/userdata-fork/settings.json` (`DesktopObservability.ts:260`,
  `DesktopBackendConfiguration.ts:147`); the server reads and writes
  `~/.t3/userdata/settings.json`.
- **The guard passes vacuously.** `forkAppIdentity`'s case *"keeps production
  state out of the shared userdata directory"* string-matches only
  `DesktopEnvironment.ts` and `build-desktop-artifact.ts`. It asserts nothing
  about `apps/server`, so it stays green with the hole open.
- The `userdata-fork/settings.json` string in
  `DesktopBackendConfiguration.test.ts:361` is a constructed temp path inside an
  error-logging assertion — not evidence the backend resolves `userdata-fork`.

## Bug 2 — the release tells users to unquarantine the wrong app

The published `v0.1.1` body and `.github/workflows/fork-release.yml` both say:

```
xattr -dr com.apple.quarantine "/Applications/T3 Code (Alpha).app"
```

The fork installs as `T3 Code Fork.app`
(`scripts/build-desktop-artifact.ts:1379`). Following this strips quarantine
from upstream's app if it is installed, and leaves the fork quarantined. The
text landed in PR #5 and was never updated by PR #6, which did the rename.
`forkDesktopRelease` keeps `--platform mac` / `--arch arm64` in sync with the
body but does not check the app name.

The body's "Everything local works normally" also reads differently in light of
Bug 1: local state is upstream's.

## Not verified

- **The fork build has never been launched — that gap is still open.** This
  environment is headless Linux x86_64; `v0.1.1` is macOS arm64 only. `~/.t3`
  does not exist here, so there was nothing to back up and no `userdata` to
  observe. Isolation remains statically verified only, and the static reading
  above says it is incomplete.
- **The project's own test runner never ran.** `pnpm install` cannot complete —
  `pkg.ing`, serving the `alchemy` dependency, is blocked by this environment's
  network policy (403 on CONNECT). Guard assertions were executed on Node
  against a stand-in for `vite-plus/test` in which unimplemented matchers throw
  rather than pass.
- `phosphorIcons` and `sidebarV2Rain` guards need React and the `~` alias, so
  they did not run. Neither relates to the release.

## Suggested fixes

1. Thread the fork state-dir leaf through the bootstrap contract, or add a fork
   override in `deriveServerPaths`, so the backend lands in `userdata-fork`.
2. Extend `forkAppIdentity` to assert the server's resolution too, so it stops
   passing vacuously.
3. Correct the app name in the workflow's release body, and consider asserting
   it in `forkDesktopRelease`.
