# Vendored: the Forge design-mode client

Source: <https://github.com/NoahHendrickson/the-forge> — `packages/the-forge/src/client/`
(plus `src/shared/structural-kinds.ts` and `src/shared/guardrails.ts` under `shared/`),
MIT, vendored 2026-08-03.

This is the Forge's editing core only. The chat/session/delivery layer was deliberately
not vendored — T3 threads are the delivery surface (see
`.fork/customizations.yaml#fork-design-mode`). Not ported: `session-feed`, `chat-rows`,
`chat-styles`, `chat-markdown`, `composer-send`, `composer-config`, `feed-anchor`,
`watch`, `verifier`, `changelist`, `lifecycle` (delivery half), `hmr`, and
`shared/chat-constants`.

Since the native-panel split, the injected bundle is HEADLESS: `engine/headlessMode.ts`
is the sole orchestrator, `engine/headlessOverlay.ts` owns only page-local outlines and
gesture chrome, and this directory contains only the Forge leaf modules reachable from
them. The old in-page panel, dock, layers, canvas chrome, controls, and Forge orchestrator
are intentionally absent — the properties panel is native T3 React
(`custom/designMode/panel/`).

Local edits are marked with `t3-fork:` comments. The load-bearing ones:

- `lifecycle.ts` — `StageEvent`/`LifecycleStage` inlined (verifier.ts not vendored).
- Request accuracy (2026-08-06, `designMode/cssOrigin.ts` is the fork-owned core):
  - `request.ts` — `ChangeItem.origin` and the probe that fills it. A css bullet may only
    name a utility once `cssOrigin.ts` has proved that class is the lever by removing it
    and re-measuring; otherwise the bullet names the winning rule instead. The probe runs
    inside the `compare(el, true)` window, which is why `collapse()` is called there.
  - `request.ts` — `ElementChange.component` / `.sourceFile`, read from the attributes
    `nativeSource.ts` writes, and the `Rendered by:` line that renders them.
  - `shared/guardrails.ts` — `NO_PREVIEW_GUARDRAIL` must NOT promise that "The Forge
    verifies the changes automatically". True upstream, false here: `client/verifier.ts`
    is not vendored, so nothing checks. Restore the stronger wording only alongside it.
- `./shared/` import paths (were `../shared/` upstream).
- A handful of mechanical lint fixes (snapshot spreads → `Array.from`, `toReversed()`,
  `Set#has`, two unused imports) — style-only, no behavior change.
- Native-source mode (2026-08-04, `engine/nativeSource.ts` is the fork-owned core):
  - `source.ts` — `findSelectableElement`: a tagged ancestor still wins, but untagged
    elements are selectable themselves (svg internals climb to the outermost `<svg>`).
  - `text-edit.ts` / `move-drag.ts` — gesture gates call `findSelectableElement`
    instead of `findTaggedElement`.
  - `lifecycle-store.ts` — persisted selection/draft entries carry an optional
    `selector` css path (synthesized tags don't survive reloads; Forge tags do).
  - `layers.ts` — `buildLayerTree(root, includeUntagged, budget?, maxDepth?)` walks every rendered
    element on pages with no project tags (`NOISE_TAGS` and `display: none` subtrees
    skipped, svg still opaque), stops minting at the host's `LayerBudget` cap so an
    untagged deep page costs O(cap), not O(DOM), per rebuild, and `layerLabel` prefers
    an element id over the generic tag vocabulary.

Formatting is the Forge's own (`vendor/**` is fmt-ignored at the root vite config) so a
future re-sync diffs cleanly against that repo. When re-syncing, port these edits rather
than overwriting them — the guard suite (`__fork_guards__/forkDesignMode.test.ts`) fails
on a reintroduced network layer, a broken bundle graph, or a lost mount.
