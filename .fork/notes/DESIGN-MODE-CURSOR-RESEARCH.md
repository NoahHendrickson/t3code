# Cursor design mode research — sidebar deep-dive

Research notes, August 2026. Question asked: how does Cursor handle its design mode, and
what can we learn to keep the fork's design mode (`fork-design-mode`,
`apps/web/src/custom/designMode/`) fast and precise? This round focuses on the properties
**sidebar** — the panel in the editor window where edits are made — after a first pass
covered the selection/context pipeline. Sources are listed at the end; the Cursor forum
blocks fetching from agent environments, so forum threads are summarized from search
excerpts rather than full reads.

## The headline finding

Cursor shipped a full direct-manipulation sidebar, then **removed it** — and their users
have been asking for it back ever since. There are two distinct generations, and most
writing about "Cursor design mode" conflates them:

| | Gen 1: Visual Editor (Cursor 2.2, Dec 2025) | Gen 2: Design Mode (Cursor 3, Apr 2026 → 3.7, Jun 2026) |
|---|---|---|
| Where | Cursor Browser, in the editor window | Cursor Browser, in the Agents Window |
| Sidebar | Full properties panel + DOM tree | None — removed |
| Editing | Direct manipulation (sliders, pickers, drag) | Select / box / draw / voice, then *describe* the change |
| Style loop | Instant client-side overrides, free | No visual loop; every change goes through the agent |
| Code write | "Apply" → agent finds source, edits, hot reload verifies | Same, but per prompt rather than per batch of tweaks |

Our design mode is architecturally a Gen-1 tool: native panel, layers rail, drafts as
client-side overrides, explicit send-to-agent. Cursor's retreat from that shape was
received as a regression, not an improvement — hold this ground.

## Gen 1 anatomy: the Visual Editor sidebar

What the sidebar contained (Cursor 2.2, "A visual editor for the Cursor Browser"):

- **DOM/components tree** — full hierarchy of the rendered page; elements could be
  drag-and-dropped across the tree to restructure layout.
- **Style controls** — sliders for margin/padding/border-radius, live-preview color
  pickers, typography (font, size, weight, line-height), flexbox and grid arrangement
  controls.
- **Design-token integration** — pickers offered the project's own color tokens and
  design-system variables, not just raw values. (Reviewers note it often missed and let
  raw values leak through — see "why it died".)
- **React props editing** — the editor read the selected component's props off the React
  fiber tree and rendered them as sidebar controls, e.g. a dropdown to flip a button
  `variant` between `primary`/`secondary` without touching code.
- **Apply** — tweaks accumulated as temporary client-side overrides; Apply sent them to
  the agent, which searched the filesystem for the corresponding source, wrote the edit,
  and let hot reload show the real result.

Context capture was the same in both generations: selecting an element records its
identity (XPath, component, attributes, computed styles, props from the fiber tree) plus
a screenshot for spatial context.

Known Gen-1 defects, from reviews and release-thread feedback:

- **Undo didn't cover the sidebar.** Cmd+Z could not undo a slider movement; users had to
  revert the code change or manually reset the property. Git became the real undo.
- **The DOM tree was shallow on complex pages** — limited information per node, hard to
  navigate real apps.
- **Apply was the weak link.** The agent had to translate accumulated freeform CSS
  overrides into idiomatic source: right component, right token, right breakpoint. This
  is where the widely-cited failure modes lived — raw hex/px instead of tokens, brand-new
  one-off components instead of edits to the existing one, state confusion (hardcoding
  `color: gray` on a button that was only gray because it was disabled).

## Why Gen 1 died, and how users reacted

Cursor has not published a rationale. The reviewer criticism lines up with an obvious
one: select-and-prompt sidesteps the hardest problem (overrides → idiomatic source) by
never accumulating overrides — each prompt is one small, describable change the agent
applies directly. Gen 2 doubled down on making *selection* rich (multi-select with
visual relationships between elements, drawing annotations, persistent voice) instead of
making *manipulation* rich.

The community reaction was loud and has not faded: "Bring back the Design Sidebar —
visual HTML/CSS editing was a core part of Design Mode", "Why Design Mode feels like a
step backward", and a three-page "Please bring back the CSS Inspector panel" thread. The
consistent complaint: Design Mode is now just a selection tool — you can discuss elements
with the agent but not tweak them yourself, which killed the visual-first workflow and
made every trivial nudge cost a model round-trip.

Read together: the sidebar was the right product; their drafts→source translation wasn't
good enough to support it, and they cut the product rather than fix the translation.

## The deterministic alternative: Onlook

Onlook ("the Cursor for designers", open source) kept the Gen-1 shape and solved the
write-back problem without a model in the loop:

- Build-time attribute injection maps every DOM element to its source location (same
  family as our `data-dc-source` tier).
- A style edit parses the target file into an AST, modifies the JSX attribute — emitting
  Tailwind classes that match the change — and writes the file back immediately,
  preserving formatting. No agent, no credits, no latency, no drift: the "apply" is a
  compiler step, not an inference step.
- The agent is reserved for semantic asks ("make this look more like a pricing card"),
  not for `padding: 16px → 24px`.

This is the pattern Cursor never built, and it is why Onlook doesn't suffer the
token-drift / duplicate-component failure class for plain style edits.

## Where our design mode stands

Current state (see `.fork/customizations.yaml#fork-design-mode` for the full map):

- **We are the Gen-1 shape**: native React panel (Position/Layout/Appearance/Typography/
  Paint, scrub fields with arithmetic, multi-select `Mixed`), ARIA layers tree with
  drag-reorder, guest engine applying edits as inline-style drafts, sessionStorage
  persistence, explicit send.
- **Our send is better context than either Cursor generation's Apply.** Deterministic
  markdown naming each element `file:line:col` with per-property before→after deltas and
  Tailwind suggestions derived from the app's *live* theme tokens — this directly attacks
  the drift and state-confusion failures Cursor's Apply was criticized for. The agent
  gets what changed, not a rendered pixel to reverse-engineer.
- **Our source mapping is more future-proof.** Three tiers: authored `data-dc-source`
  tags → `react-grab` native resolution through source maps → selector-only fallback.
  Cursor leans on fiber internals of the `_debugSource` family, which React 19 removed;
  the ecosystem is being pushed toward compile-time attributes — the tier we already
  treat as primary.
- **We lack**: screenshot context in the send payload, relational context for
  multi-select, props editing, tokens surfaced in the pickers themselves, and a
  deterministic write path for simple edits.

## Recommendations

Ordered by leverage; none require changing the architecture.

### Accuracy

1. **Attach a screenshot to the send payload.** Cursor treats the screenshot as one of
   exactly two load-bearing signals (identity + spatial context). Our markdown deltas
   carry no picture of the page. Capturing the page (or the selection region with
   surroundings) into the `<design_change_request>` helps most exactly where we are
   weakest: selector-only elements and relational asks. Desktop-only is fine —
   `webContents.capturePage` is available where design mode is.
2. **Relational context for multi-select.** Cursor 3.7's multi-select tells the agent the
   visual relationships between selections ("make A match B", "remove the repeated
   one"). We already read per-element offsets; include relative geometry and
   shared-ancestor info when a send contains multiple elements.
3. **Never let send timing degrade precision.** `buildSend` waits at most 1.5s
   (`SEND_SOURCE_WAIT_MS`) for in-flight native source resolution, then silently ships
   `nth-of-type` selectors — so *when* the user clicks send changes how precise the ask
   is. Either resolve eagerly enough that send never races, or surface "N elements
   unresolved" on the composer pill instead of downgrading silently.
4. **React props editing (Gen 1's best idea, explore).** A props edit is an accuracy
   lever, not a convenience: `variant="primary" → "secondary"` maps one-to-one to an
   exact source edit at a known location and inherently reuses the design system —
   nothing for the agent to hallucinate. `react-grab` already surfaces component context
   in the desktop preload; investigate exposing enumerable props (union-typed, boolean)
   as panel controls whose deltas ship in the send payload like style deltas do.
5. **Tokens in the controls, not only at send time.** Gen 1 put design-system variables
   in the pickers; reviewers dinged it for missing. We map to tokens only in
   `buildSend`. Offering the app's live theme tokens *first* in the color/spacing
   controls makes drafts token-shaped from the start and the eventual code edit more
   deterministic — doing it well beats Cursor at the thing they were criticized for.
6. **Longer term: a deterministic write path for simple edits (Onlook pattern).** For a
   draft whose element resolved to an exact `file:line:col` and whose deltas are pure
   utility-class changes, an AST edit could apply it without a model round-trip,
   reserving the agent for semantic changes. This is a real feature with server-side
   implications (file writes), so it needs explicit maintainer intent — noted here as
   direction, not a plan.

### Speed

Cursor's visual loop feels instant because nothing crosses a process boundary per frame.
Ours crosses two. Known drags, from the code audit (details in the engine sources):

1. **Unthrottled per-frame IPC on scrubs** — every `onScrubMove` tick becomes a
   JSON-serialized `executeJavaScript` into the guest (`DesignPanelFields.tsx` commit →
   `designModeBridge.fire`). An rAF/throttle on the host side of the bridge is the
   cheapest single win.
2. **`console.log` as the uplink** — every console line the previewed app prints runs our
   host listener; selection snapshots serialize 47 computed styles through it. Moving
   guest→host traffic to `ipcRenderer.sendToHost` from the preload takes app console
   noise out of the hot path.
3. **Layers observer churn** — `MutationObserver` on `body` with `subtree` +
   `characterData`, full tree rebuild (≤400 nodes) + `JSON.stringify` compare per 250ms
   window; a ticking clock in the page defeats the change gate indefinitely (flagged in
   `layersSession.ts` itself). Also: Gen 1's tree was criticized as unhelpfully shallow
   on complex pages — our 400-node cap silently truncates big pages; worth surfacing.
4. **Engine rebuild + re-injection** — the vite plugin re-runs esbuild on every virtual
   module load with no memoization, and the ~180KB IIFE re-injects on every toggle and
   every `dom-ready` (each navigation / full reload).
5. **Forced layout on every selection emit** — 47 `getPropertyValue` reads plus offset
   measurement re-run after every edit burst settles.

### One Gen-1 defect we should check ourselves for

Undo. Cursor's sidebar shipped without working undo for slider moves and it is one of
the two most-cited defects. Verify our draft stack gives scrub-level undo (a slider
gesture = one undoable step) and that it is reachable via the standard shortcut while
the panel has focus.

## Sources

Cursor (official):

- <https://cursor.com/blog/browser-visual-editor> — Gen 1 announcement
- <https://cursor.com/blog/design-mode> — Gen 2 announcement
- <https://cursor.com/changelog/design-mode-improvements> — 3.7 multi-select/voice/draw

Community reaction to the sidebar removal (forum.cursor.com, via search excerpts):

- "Bring back the Design Sidebar — visual HTML/CSS editing was a core part of Design Mode" (t/167292)
- "Bring back the Design Sidebar, Why Design Mode feels like a step backward" (t/158818)
- "Please bring back the CSS Inspector panel…" (t/165970, 3 pages)
- "Cursor Design Mode was there and then gone?" (t/145955); "Where's Design mode sidebar?" (t/156841)
- Cursor 2.2 release discussion (t/145958)

Analysis and reviews:

- <https://www.builder.io/blog/cursor-design-mode-visual-editing> — best technical breakdown; two-loop framing, failure modes
- <https://superdesign.dev/blog/cursor-for-design> — drift/duplication/undo criticism
- <https://medium.com/@joe.njenga/i-tested-new-cursor-visual-editor-forget-your-browser-dev-tools-try-this-f89a2d12aa02> — Gen-1 hands-on (undo, tree depth)
- <https://www.digitalapplied.com/blog/cursor-3-7-design-mode-voice-multi-select-june-2026> — 3.7 details
- <https://www.starkinsider.com/2025/12/cursor-visual-editor-ide-web-design.html>, <https://tech-now.io/en/blogs/cursor-visual-editor-redefining-ai-assisted-web-development/> — Gen-1 sidebar controls

Source-mapping ecosystem:

- <https://github.com/facebook/react/issues/32574> — React 19 removed `_debugSource`
- <https://react-dev-inspector.zthxxx.me/docs/compiler-plugin> — compile-time data-attribute injection
- <https://github.com/onlook-dev/onlook>, <https://blog.logrocket.com/onlook-react-visual-editor/> — AST write-back pattern
