# Fork release work — handoff for review

> **Historical record — several conclusions were later disproven.** The v0.1.1
> build this document reviews shipped with incomplete data isolation: its
> server child opened the real app's `~/.t3/userdata/state.sqlite` read-write.
> See [FORK-DATA-ISOLATION-HANDOFF.md](FORK-DATA-ISOLATION-HANDOFF.md) for the
> evidence, and its §8 for the specific corrections to this document's claims
> (§5, §7, §8.1, §10 among others). Kept as written for the record.

**Date:** 2026-07-25
**Repo:** `NoahHendrickson/t3code` (fork of `pingdotgg/t3code`)
**Branch:** `custom` (default branch / trunk)
**Head at handoff:** `0dd24e35d`

This describes work done in one session, written so it can be **checked rather than
trusted**. Claims are separated into what was verified and how, versus what was
assumed. The final section lists what I'd most want a reviewer to attack.

---

## 1. What prompted it

A PR's CI had been sitting in `QUEUED` for ~2 hours. Root cause: the branch predated a
fork customization (`ci-runners`) that rewrites CI's `runs-on` from Blacksmith runners
to GitHub-hosted ones. Blacksmith's GitHub app is installed on `pingdotgg` but **not**
on this fork, so upstream's runner labels never get a runner and queue forever.

Pulling that thread surfaced two larger problems, which is most of what follows.

---

## 2. Changes landed

Four PRs, all merged to `custom`, all CI-green before merge.

| PR                                                     | Merge       | What                                                                |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------- |
| [#3](https://github.com/NoahHendrickson/t3code/pull/3) | `27bfe90e5` | Unstick the original PR (merge `custom` in to pick up `ci-runners`) |
| [#4](https://github.com/NoahHendrickson/t3code/pull/4) | `a1a343208` | Gate upstream's Release workflow to upstream only                   |
| [#5](https://github.com/NoahHendrickson/t3code/pull/5) | `0e0d2bc3a` | Add the fork's own desktop release pipeline                         |
| [#6](https://github.com/NoahHendrickson/t3code/pull/6) | `0dd24e35d` | Give packaged fork builds their own app identity                    |

Three new entries in `.fork/customizations.yaml`: `release-upstream-only`,
`fork-desktop-release`, `fork-app-identity`. Each has a guard test in
`apps/web/src/__fork_guards__/`.

---

## 3. PR #4 — Release workflow gated to upstream

`.github/workflows/release.yml` fires on a 3-hourly cron and on `v*.*.*` tags, and
**publishes**: the CLI to npm (`publish_cli`) and a GitHub Release (`release`). Nothing
scoped it to upstream, so it had been firing on this fork ~8×/day.

It published nothing **only** because every job requests `blacksmith-*` runners the fork
can't schedule, so the runs hung. That is an accident, not a safeguard — and it makes the
obvious fix dangerous: swapping `release.yml` onto GitHub-hosted runners (the same fix
`ci-runners` applied to CI) would have turned this fork into a nightly publisher pushing
artifacts under **upstream's** package names.

**Fix:** gate `check_changes` and `preflight` on
`github.repository == 'pingdotgg/t3code'`. Every other job already requires
`needs.preflight.result == 'success'`, so it cascades to all 10.

Deliberately independent of runner labels: `ci-runners`' own `intent` says it "can be
retired wholesale" if Blacksmith is ever installed here, and that must not be able to
start a release.

---

## 4. PR #5 — the fork's own release pipeline

`.github/workflows/fork-release.yml`. `workflow_dispatch` → build macOS arm64 unsigned →
publish to this repo's Releases with the automatic `GITHUB_TOKEN`. One job, no secrets to
configure.

This works because the build script already degrades on its own when signing secrets are
absent (`macOS signing disabled (missing one or more Apple signing secrets)`), and the
Clerk/passkey config it validates is only reached on the **signed** path. No Apple, Azure,
Cloudflare, Clerk, or npm credential is required to build.

Deliberate choices:

- **Dispatch only** — no cron, no tag trigger, so no sync or upstream tag can publish.
- **Unsigned** — release notes tell users to clear the quarantine bit.
- **`T3CODE_DESKTOP_UPDATE_REPOSITORY` set explicitly** to `${{ github.repository }}` — it
  would resolve correctly from `GITHUB_REPOSITORY` anyway, but silently.
- **No package-registry publish** — fork builds still carry upstream's package names.

---

## 5. PR #6 — app identity collision (the important one)

### The problem

A packaged fork build and an installed upstream release were **the same application** to
macOS. Both are non-development builds, so every identity upstream derives from
`isDevelopment` collapsed onto the same value:

|                      | Upstream release                                | Fork build (before #6) |
| -------------------- | ----------------------------------------------- | ---------------------- |
| Bundle id            | `com.t3tools.t3code`                            | same                   |
| Installed path       | `/Applications/T3 Code (Alpha).app`             | same                   |
| State dir            | `~/.t3/userdata`                                | same                   |
| Electron user data   | `~/Library/Application Support/t3code`          | same                   |
| Legacy migration dir | `~/Library/Application Support/T3 Code (Alpha)` | same                   |

`~/.t3/userdata` is the live database — `state.sqlite`, `secrets/`, `clerk-tokens.json`
(93 MB on this machine).

**This was discovered the hard way.** The user dragged the v0.1.0 DMG into
`/Applications`, targeting their real notarized 0.0.28 install. It was refused only
because the app was running at the time — macOS won't replace a running app. Nothing was
damaged; verified afterwards that the installed app was still upstream's, signed by
`T3 Tools, Inc. (ARK85ZXQ4Z)`, unmodified since Jun 29.

The subtle part: `resolveUserDataPath` in `apps/desktop/src/app/DesktopAppIdentity.ts`
**prefers a legacy directory whenever it exists**. Separating bundle id, app name, and
`userDataDirName` alone would have looked correct and still left a path onto the real
app's data.

### The fix

|                      | After #6                                        |
| -------------------- | ----------------------------------------------- |
| Bundle id            | `com.t3tools.t3code.fork`                       |
| Installed path       | `/Applications/T3 Code Fork.app`                |
| State dir            | `~/.t3/userdata-fork`                           |
| Electron user data   | `t3code-fork`                                   |
| Legacy migration dir | `T3 Code (Fork)` (a name that will never exist) |

Touched, all fenced `fork:begin fork-app-identity` / `fork:end`:

- `apps/desktop/src/app/DesktopEnvironment.ts` — `APP_BASE_NAME`, `stateDir`,
  `userDataDirName`, `legacyUserDataDirName`, `appUserModelId`, linux entry/wm class
- `scripts/build-desktop-artifact.ts` — `DESKTOP_APP_ID`, `resolveDesktopProductName`

Plus mechanical updates to upstream test fixtures that assert the shared names.

### Deliberately not done

- **Dev paths untouched.** `vp dev` in this repo is already the fork, so there is nothing
  to collide with, and renaming would strand existing dev state.
- **URL scheme left shared.** `t3code://` is the app's own internal origin
  (`DESKTOP_PRODUCTION_SCHEME` in `apps/desktop/src/electron/ElectronProtocol.ts`), not
  just a deep-link handler. Changing only what the bundle registers while the runtime
  still loads `t3code://app` would be incoherent. **Two installed apps therefore contend
  for `t3code://`** — untidy, not destructive, still open.
- **Stage label unchanged.** Making the app read "(Fork)" would mean editing
  `DesktopAppStageLabel` in `packages/contracts/src/ipc.ts`, a shared contract. Changed
  the fork's base name instead; the app reads "T3 Code Fork (Alpha)".

---

## 6. Releases

- **`v0.1.0` — deleted, along with its tag.** It contained the colliding build.
  Recorded 2 downloads of its DMG, at least one of which was my own verification request.
  Checked for local copies in `~/Downloads`, `~/Desktop`, and the build dir: none.
- **`v0.1.1` — current, prerelease.** Built after #6 merged. Verified safe (below).

Sequenced deliberately: v0.1.1 was cut and verified **before** v0.1.0 was deleted, so
there was never a window where the only available build was the bad one.

---

## 7. What was verified, and how

Everything here was actually run, not inferred.

| Claim                           | How                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unsigned build needs no secrets | Built a DMG locally with none present; exit 0, 226 MB                                                            |
| Fork build ships fork code      | Mounted DMG; found fork marker `noahhendrickson-t3code` and Phosphor icons in bundle                             |
| Published v0.1.1 is safe        | Downloaded the **published** DMG, mounted it: `T3 Code Fork.app`, `CFBundleIdentifier = com.t3tools.t3code.fork` |
| Fork state paths are packaged   | `grep -a` inside `app.asar`: `userdata-fork` ×2, `t3code-fork` ×4, `T3 Code (Fork)` ×2                           |
| Real app undamaged              | `codesign -dvvv` → `T3 Tools, Inc. (ARK85ZXQ4Z)`; `spctl` → `accepted / Notarized Developer ID`; mtime Jun 29    |
| #4 gate cascades                | Parsed `release.yml` as YAML: 10 jobs, `ungated jobs: []`, triggers intact                                       |
| Guards are non-vacuous          | Reverted each customization in turn and confirmed its guard goes red                                             |
| Test suites                     | desktop 364 passed (50 files); scripts 147 passed (16); fork guards 44 passed (10)                               |
| Typecheck                       | exit 0 across desktop/web/scripts                                                                                |

A backup of the live state was taken before any of this:
`~/t3-userdata-backup-20260725-1815` (93 MB).

---

## 8. What was NOT verified — check these

These are the honest gaps. **This is the most useful section to attack.**

1. **Schema divergence was never measured.** The claim that launching a fork build could
   have migrated `state.sqlite` one-way is _plausible, not established_. `custom` tracks
   upstream ahead of the 0.0.28 release, but I did not diff the schemas or check whether
   migrations would run. The severity of the near-miss rests on this, and it is unproven.

2. **The fork build has never been launched.** Identity was verified statically — bundle
   id, `app.asar` contents, install path. Nobody has run it and confirmed it actually
   creates `~/.t3/userdata-fork` rather than `~/.t3/userdata`. **This is the single most
   valuable check remaining.**

3. **`t3code://` contention is untested.** Two apps register the scheme. Which one macOS
   routes a deep link to is unknown, as is whether it breaks the real app's auth callbacks.

4. **Only macOS arm64 exists.** The identity change also touched `linuxDesktopEntryName`
   and `linuxWmClass`, which have never been built or run.

5. **CI cost of the release workflow is unmeasured.** One run took ~7 min on
   `macos-latest`. Fine now; worth watching if platforms are added.

6. **`fork-release.yml` has run exactly twice.** Failure paths (invalid version, existing
   tag, mid-build failure leaving a partial release) are untested.

---

## 9. Suggested checks

```bash
# Guards, desktop, scripts
cd apps/web && pnpm exec vp test run src/__fork_guards__     # expect 44 passed
cd apps/desktop && pnpm exec vp test run src                  # expect 364 passed
pnpm exec vp run --filter ./scripts test                      # expect 147 passed

# Nothing gated wrong: expect 10 jobs, ungated == []
node -e "const Y=require('./node_modules/.pnpm/yaml@2.9.0/node_modules/yaml');
const d=Y.parse(require('fs').readFileSync('.github/workflows/release.yml','utf8'));
const j=d.jobs;console.log(Object.keys(j).length,
Object.entries(j).filter(([k,v])=>{const i=String(v['if']||'');
return !i.includes(\"github.repository == 'pingdotgg/t3code'\") &&
!i.includes(\"needs.preflight.result == 'success'\")}).map(([k])=>k))"

# Fork release fires on dispatch only: expect ["workflow_dispatch"]
node -e "const Y=require('./node_modules/.pnpm/yaml@2.9.0/node_modules/yaml');
console.log(Object.keys(Y.parse(require('fs').readFileSync(
'.github/workflows/fork-release.yml','utf8')).on))"

# Real app still upstream's
codesign -dvvv "/Applications/T3 Code (Alpha).app" 2>&1 | grep Authority
```

**The check I'd most want run:** install `v0.1.1`, launch it, and confirm it creates
`~/.t3/userdata-fork` and leaves `~/.t3/userdata` untouched — with a backup taken first.
That is the one claim the whole fix rests on that has only been checked statically.

---

## 10. Known limits (by design, not defects)

- macOS arm64 only. Intel and Linux are cheap to add; Windows needs the WSL node-pty
  prebuild and Spectre-mitigated MSVC libs.
- Unsigned — first launch needs `xattr -dr com.apple.quarantine` or right-click→Open.
  Signing needs an Apple Developer membership; the build step already handles both paths.
- Cloud features (T3 Connect sign-in, remote access) unavailable — the relay and Clerk
  config come from upstream's production environment.
- `t3code://` shared between the two apps.

---

## 11. Process note

The proximate cause of the collision reaching the user was mine: I gave install
instructions without first checking whether T3 Code was already installed. A single
`ls /Applications` would have caught it. I also built the DMG, inspected its bundle id,
saw `com.t3tools.t3code`, and read it as "correct" rather than "identical to any
installed copy" — the fact was in hand and the wrong conclusion drawn from it.
