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
(fork-authored, adapted from `index.ts` here) composes the vendored leaf modules and the
in-page chrome UI modules (`panel*`, `dock`, `layers*`, `canvas*`, `controls`,
`colorpicker`, `tokenpicker`, `ui/*`, and `index.ts` itself) are retained for reference
and future re-syncs but tree-shaken out of the bundle — the properties panel is native T3
React (`custom/designMode/panel/`).

Local edits are marked with `t3-fork:` comments. The load-bearing ones:

- `index.ts` — rewritten header: every fetch/queue/dispatch/verifier/feed wiring removed;
  new host seams `onSendRequest` / `onStateChange` / `onDraftsChanged`, plus `buildSend()`
  and `discardAll()`.
- `overlay.ts` — `CHAT_CSS` concat replaced by `../send-bar-styles`'s `SEND_BAR_CSS`.
- `lifecycle.ts` — `StageEvent`/`LifecycleStage` inlined (verifier.ts not vendored).
- `panel.ts` — `promptButton` stays hidden (its chat-chip target does not exist here).
- `./shared/` import paths (were `../shared/` upstream).
- A handful of mechanical lint fixes (snapshot spreads → `Array.from`, `toReversed()`,
  `Set#has`, two unused imports) — style-only, no behavior change.

Formatting is the Forge's own (`vendor/**` is fmt-ignored at the root vite config) so a
future re-sync diffs cleanly against that repo. When re-syncing, port these edits rather
than overwriting them — the guard suite (`__fork_guards__/forkDesignMode.test.ts`) fails
on a reintroduced network layer, a broken bundle graph, or a lost mount.
