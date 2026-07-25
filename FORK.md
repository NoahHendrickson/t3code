# Fork notes

UI/UX fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) (MIT, © T3 Tools Inc.).
Upstream is not accepting contributions, so this fork exists to carry UI changes only.

## Branches

| Branch | Role |
| --- | --- |
| `main` | Pristine mirror of `upstream/main`. **Never commit here.** |
| `ui` | All fork changes. Default working branch. |

`upstream`'s push URL is set to `DISABLED` so you can't accidentally push to pingdotgg.

## Syncing

```bash
./fork/sync-upstream.sh
```

Fast-forwards `main` to `upstream/main`, pushes it, prints which of your modified
files upstream also touched, then merges `main` into `ui`.

Run it **weekly**. Upstream lands 20–45 commits/day; a month of drift is a bad time.

Merge is used rather than rebase on purpose — rebase replays your commits every
sync and makes you re-resolve the same conflicts indefinitely. `rerere` is enabled
in this clone (`rerere.enabled`, `rerere.autoupdate`), so repeat conflicts get
replayed from your recorded resolutions.

## Where to make changes — ranked by merge cost

Measured over a representative 14-day window of upstream history:

| Layer | Upstream churn | Verdict |
| --- | --- | --- |
| `apps/web/src/theme.override.css` (fork-owned) | never | **Free.** Do as much as possible here. |
| `apps/web/src/components/ui/*` (45 shadcn primitives) | 10 commits | Cheap, and 305 components inherit the change. |
| `apps/web/src/components/settings/*`, smaller views | low–moderate | Manageable. |
| `ChatView.tsx` (6053 lines), `Sidebar.tsx`, `SidebarV2.tsx`, `ChatComposer.tsx` | 14–23 commits **each** | Expensive. Every sync is hand work. |

Rules of thumb that keep syncs cheap:

- Express it as a token override before considering anything else.
- Restyle through `components/ui/*` primitives rather than their call sites.
- Target `[data-slot="..."]` attributes from CSS instead of editing `.tsx`.
- When you must change a big view, keep the diff small and localized. Wrap and
  compose rather than rewriting in place.
- Fewer, tighter commits merge better than sprawling ones.

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

- `apps/web/src/main.tsx` — one import line for `theme.override.css` (1 commit/14d upstream)

## Running it

Upstream uses [Vite+](https://viteplus.dev/guide/), which needs the global `vp`
CLI. Not currently installed on this machine:

```bash
curl -fsSL https://vite.plus | bash
```

Then:

```bash
vp i
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
