# Fork notes

UI/UX fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) (MIT, © T3 Tools Inc.).
Upstream is not accepting contributions, so this fork exists to carry UI changes only.

## Branches

| Branch | Role                                                       |
| ------ | ---------------------------------------------------------- |
| `main` | Pristine mirror of `upstream/main`. **Never commit here.** |
| `skin` | All fork changes. Default working branch.                  |

Not named `ui`: the fork inherited upstream's `ui/selected-checkmarks` and
`ui/traits-picker`, and git can't hold `refs/heads/ui` alongside a `refs/heads/ui/`
namespace. GitHub rejects the push with `directory file conflict`.

`upstream`'s push URL is set to `DISABLED` so you can't accidentally push to pingdotgg.

## Syncing

```bash
./fork/sync-upstream.sh
```

Fast-forwards `main` to `upstream/main`, pushes it, prints which of your modified
files upstream also touched, then merges `main` into `skin`.

Run it **weekly**. Upstream lands 20–45 commits/day; a month of drift is a bad time.

Merge is used rather than rebase on purpose — rebase replays your commits every
sync and makes you re-resolve the same conflicts indefinitely. `rerere` is enabled
in this clone (`rerere.enabled`, `rerere.autoupdate`), so repeat conflicts get
replayed from your recorded resolutions.

## Where to make changes — ranked by merge cost

Measured over a representative 14-day window of upstream history:

| Layer                                                                           | Upstream churn         | Verdict                                       |
| ------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------- |
| `apps/web/src/theme.override.css` (fork-owned)                                  | never                  | **Free.** Do as much as possible here.        |
| `apps/web/src/components/ui/*` (45 shadcn primitives)                           | 10 commits             | Cheap, and 305 components inherit the change. |
| `apps/web/src/components/settings/*`, smaller views                             | low–moderate           | Manageable.                                   |
| `ChatView.tsx` (6053 lines), `Sidebar.tsx`, `SidebarV2.tsx`, `ChatComposer.tsx` | 14–23 commits **each** | Expensive. Every sync is hand work.           |

Rules of thumb that keep syncs cheap:

- Express it as a token override before considering anything else.
- Restyle through `components/ui/*` primitives rather than their call sites.
- Target `[data-slot="..."]` attributes from CSS instead of editing `.tsx`.
- When you must change a big view, keep the diff small and localized. Wrap and
  compose rather than rewriting in place.
- Fewer, tighter commits merge better than sprawling ones.

## What tokens can't reach

The blue banner behind the sidebar wordmark is `SidebarStageBackdrop`
(`apps/web/src/components/SidebarStageBackdrop.tsx`), selected by
`resolveSidebarStageBackdropVariant(stageLabel)` in
`components/sidebar/SidebarChrome.tsx`. It's separate art keyed to the
Dev/Alpha/Nightly stage label, not a token — so it stays blue no matter what
you do in `theme.override.css`, and it may not render at all in a non-alpha
build. Restyling it means editing that component or the `assets/` artwork.

## Pre-commit formatting

A staged-files hook runs `vp fmt` on commit and stashes/restores around it, so
commits are auto-formatted. Nothing to configure — just don't be surprised when
a commit rewrites your whitespace.

## Known trap: `Sidebar.tsx` vs `SidebarV2.tsx`

Both exist, both are hot, and `AppSidebarLayout.tsx` picks between them via
`data-sidebar-version={useSidebarV2Theme ? "v2" : "v1"}`. There's a live
migration underway — restyling `Sidebar.tsx` (v1) may be work against a file
upstream intends to delete. Prefer v2, or better, style both through the
attribute selector from `theme.override.css`.

## Theming architecture

See the header comment in [`apps/web/src/theme.override.css`](apps/web/src/theme.override.css)
for the full explanation. The short version:

- `index.css` defines raw semantic vars (`--primary`, `--background`, …) in
  `:root` / `.dark`, then `@theme inline` maps Tailwind tokens onto them
  (`--color-primary: var(--primary)`).
- Because the theme block is `inline`, overriding the **raw** var is enough —
  every `bg-primary` / `border-border` utility follows. You never touch `@theme`.
- **Gotcha:** a subset of surface tokens is re-declared inside
  `[data-sidebar-version="v1"], [data-sidebar-version="v2"]`. Same specificity
  as `:root` but later in source, so `:root`-only overrides are silently ignored
  across most of the app chrome. `theme.override.css` documents exactly which
  tokens this affects and ships correctly-scoped blocks for them.

## Upstream files modified by this fork

Keep this list as short as possible — it is exactly your merge-conflict surface.
The number is upstream commits touching that file in a representative 14 days.

**Theming (1 file)**

- `apps/web/src/main.tsx` (1) — one import line for `theme.override.css`

**Identity rename (13 files, all cold: 0–2)**

- `apps/desktop/src/app/DesktopEnvironment.ts` (1) — `APP_BASE_NAME`, both userData dir
  names, `appUserModelId`, Linux entry/WM class
- `apps/desktop/src/electron/ElectronProtocol.ts` (0) — both URL schemes
- `apps/desktop/scripts/electron-launcher.mjs` (1) — `APP_DISPLAY_NAME`, protocol schemes
- `apps/desktop/package.json` (0) — `productName`
- `apps/web/src/branding.ts` (0) — display-name fallback
- `apps/web/src/components/SplashScreen.tsx` (0) — alt text
- `scripts/build-desktop-artifact.ts` (1) — `DESKTOP_APP_ID` (macOS bundle id)
- 6 test files (0–2 each) that assert the old strings

## App identity

This fork is **T3 Code Fork**, deliberately distinct from upstream so a build can
coexist with an installed T3 Code (Alpha):

|                 | Upstream                               | This fork                               |
| --------------- | -------------------------------------- | --------------------------------------- |
| Display name    | T3 Code (Alpha) / (Dev)                | T3 Code Fork (Alpha) / (Dev)            |
| userData (prod) | `~/Library/Application Support/t3code` | `…/t3code-fork`                         |
| userData (dev)  | `…/t3code-dev`                         | `…/t3code-fork-dev`                     |
| URL scheme      | `t3code://` / `t3code-dev://`          | `t3code-fork://` / `t3code-fork-dev://` |
| Bundle id       | `com.t3tools.t3code`                   | `com.t3tools.t3code.fork`               |

Why this mattered: `DesktopAppIdentity.ts` resolves userData as
`legacyPathExists ? legacyPath : userDataDirName`. Renaming only `userDataDirName`
would have been silently defeated whenever the legacy directory existed, so
`legacyUserDataDirName` had to move too.

The base name is `"T3 Code Fork"`, not `"T3 Code (Fork)"`, because
`formatAppDisplayName` appends the stage as `${baseName} (${stage})` — the
parenthesised form would render "T3 Code (Fork) (Dev)".

`com.t3tools.t3code.fork` still sits in T3's reverse-DNS namespace. Fine for
private use; move it to a domain you control before distributing anything.

## Running it

Upstream uses [Vite+](https://viteplus.dev/guide/). `vp` 0.2.6 is installed at
`~/.vite-plus/bin/vp` (on `PATH` via `~/.zshenv`); dependencies are installed
(~5.8 GB, about a minute).

Launch an isolated environment — this is the repo's own `test-t3-app` procedure:

```bash
vp run dev --home-dir "$(mktemp -d /tmp/t3code-test.XXXXXX)"
```

It prints a server port, a web port, and a **one-time pairing URL** ending in
`/pair#token=...`. Open that URL exactly once as your browser's first
navigation. Don't pass `--browser` during automated testing — an auto-opened
tab consumes the token first. Treat pairing URLs as secrets.

To reset the accent test and go back to upstream's blue-violet:

```bash
git revert 36f1d98b7
```

`npx t3@latest`, the Homebrew cask, and the winget package all point at
upstream's releases, not this fork. To use your build you either run from source
or set up your own release pipeline for `apps/desktop`.

## Licensing and naming

MIT — you can modify, run, and redistribute, including commercially. Keep the
`LICENSE` file and its copyright notice intact.

MIT grants **no trademark rights**. Private use can be called anything. If you
distribute publicly, rename it: `apps/web/src/branding.ts` reads the app name
from the `DesktopAppBranding` contract and falls back to `"T3 Code"` — that
constant plus `assets/` is the whole rename surface.
