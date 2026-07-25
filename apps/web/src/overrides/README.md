# `src/overrides/` — the shadow tree

Fork-only. Files here **replace** the upstream module at the mirrored path, with no edit to the
upstream file and no edit to any of its import sites:

```
src/overrides/components/ui/button.tsx   ← wins over
src/components/ui/button.tsx
```

Resolution is implemented by the `fork:overrides` Vite plugin (`apps/web/fork/`) and mirrored into
`tsconfig.json` `paths`. Background and rationale: [`.fork/README.md`](../../../../.fork/README.md) §3.

## Which directory do I want?

|                                       | `src/overrides/`                          | `src/custom/`                       |
| ------------------------------------- | ----------------------------------------- | ----------------------------------- |
| Purpose                               | Replace an upstream module                | Add something upstream doesn't have |
| Path meaning                          | **Must** mirror an existing upstream path | Free-form                           |
| Merge cost                            | Zero — upstream never sees this path      | Zero                                |
| Upstream improvements to the original | **Lost** — you own the file now           | N/A                                 |

A file in `src/overrides/` whose path matches no upstream module is dead code: nothing imports it,
nothing errors, and your change silently never appears. The `shadow tree integrity` test in
`apps/web/fork/overrideResolver.test.ts` fails the build on exactly that mistake — so a typo'd path
is loud, not silent. Brand-new components go in `src/custom/` instead.

## Adding an override

```bash
mkdir -p apps/web/src/overrides/components/ui
cp apps/web/src/components/ui/button.tsx apps/web/src/overrides/components/ui/button.tsx
# edit the copy
```

**Do not rewrite the copy's imports.** The shadow tree is a transparent overlay: `../ui/button`
inside an override still means "the button module", picking up a sibling override if one exists and
falling back to upstream otherwise. Keeping the copy import-identical to upstream is what makes a
later `git diff upstream/main -- <original>` a clean 3-way merge when you want to port upstream
changes into your shadow.

Adding or deleting a file here restarts the dev server (resolution is baked into the module graph).
Editing an existing override hot-reloads normally.

## Wrapping instead of replacing

To keep upstream's implementation and change only its surroundings, import the module you shadow.
Both forms work — a self-import resolves to upstream rather than recursing:

```tsx
// src/overrides/components/ui/button.tsx
import { Button as UpstreamButton } from "~upstream/components/ui/button";

export function Button(props: React.ComponentProps<typeof UpstreamButton>) {
  return <UpstreamButton {...props} className={cn("fork-button", props.className)} />;
}
```

Prefer this over a full copy wherever it works — you keep receiving upstream's fixes to the
internals and own only the part you actually changed.

## Choosing what to shadow

Measured upstream churn over 60 days (see `.fork/README.md` §1):

| Target                             | Commits/60d              | Verdict                                                              |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| `components/ui/*.tsx`              | low, stable `cva` tables | **Best target.** Restyling a primitive propagates to every consumer. |
| `components/chat/ChatComposer.tsx` | 15                       | Viable if you intend to own the composer.                            |
| `components/SidebarV2.tsx`         | 21                       | Costly. Prefer wrapping.                                             |
| `components/ChatView.tsx`          | 24, +6,633 lines         | Avoid. You would inherit a file that doubled in two months.          |

Shadow the smallest thing that achieves the change. Before shadowing a large component, check
whether shadowing its _parent_ and re-arranging the children gets you there instead.

## Known gap: type parity on relative imports

`tsconfig.json` maps `~/*` override-first, so tilde imports type-check against the override. Plain
relative imports (`../ui/button`) do not — TypeScript checks them against the upstream module while
the bundler loads yours. So an override that **changes a module's public API** will type-check
clean and break at runtime.

Until that gap is closed by generated contract assertions, keep overrides API-compatible with the
module they shadow: same exported names, same prop types. Widening a prop type is safe; renaming or
removing an export is not.
