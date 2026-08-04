// Canvas-verb CSS — the Figma pivot P3 chrome (drag-to-reorder indicator, 8-point resize
// handles, the Absolute toggle), as a fragment module concatenated into overlay.ts's CSS
// constant. Same rules as chat-styles.ts and every overlay.ts chunk: JS comments live
// BETWEEN the concatenated template segments, never inside them (CSS-string comments ship as
// bundle bytes — guard-tested in overlay.test.ts), colors/fonts/motion ride the :host token
// block overlay.ts generates, and every class name is a test hook — extend, don't rename.
// Pure string fragment: no DOM access, no imports, no exports besides CANVAS_VERBS_CSS.
//
// Why the behavior modules (move-drag.ts, resize.ts) don't carry their own CSS: the same PR #43
// review rule that keeps chat-styles.ts separate — a behavior module must not import a styles
// fragment, and shared JS/CSS constants belong beside overlay.ts's TOKENS.
//
// Z-INDEX MAP (the existing overlay ladder, for reference — do not renumber):
//   2147483644 .ripple-outline · 2147483645 #outline · 2147483646 #select-outline +
//   .select-outline-multi · 2147483647 #status/#toggle. The two P3 chromes below sit at
//   2147483646 alongside the selection outline and win by DOM order — overlay.attach()
//   appends them after mount() created #select-outline. Deliberately NOT 2147483647: the
//   status pill and design-mode toggle must stay clickable above canvas chrome.

export const CANVAS_VERBS_CSS =
// Insertion indicator (move-drag.ts) — the live drop target while dragging a child inside an
// auto-layout parent. move-drag.ts writes left/top/width/height inline from the gap rect it
// computes, plus data-axis from the parent's main axis, and toggles [hidden].
//
// The line is a ::before centered inside that box, NOT the box itself: the gap rect is
// legitimately ZERO-THICKNESS when dropping at the head or tail of the list, or between two
// siblings with no gap between them — and a zero-width element painting its own background
// paints nothing at all. Centering a fixed 2px pseudo-element inside a possibly-zero-size box
// is what makes the head/tail drop targets visible (move-drag.ts's own finding).
//
// pointer-events:none is load-bearing: the box straddles page content directly under the
// pointer mid-drag, and chrome that swallowed pointermove would kill the very gesture drawing it.
`.insert-indicator {
  position: fixed; z-index: 2147483646; pointer-events: none;
}
.insert-indicator::before {
  content: ''; position: absolute; background: var(--accent); border-radius: 2px;
}
.insert-indicator[data-axis="row"]::before {
  left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-1px);
}
.insert-indicator[data-axis="column"]::before {
  top: 50%; left: 0; right: 0; height: 2px; transform: translateY(-1px);
}
` +
// No CSS for the no-drop affordance (ratified #1) on purpose: this stylesheet lives in the
// overlay's SHADOW ROOT and can only style the overlay's own tree, so it cannot reach the page's
// <html>. index.ts sets document.documentElement.style.cursor directly instead, saving and
// restoring the page's own value verbatim — the same idiom canvas.ts uses for its grab cursor,
// which is the other owner of that one property.
// Resize handles (resize.ts) — Figma's 8-point chrome. The ROOT is a pointer-events:none box
// tracking the selection rect (same convention as #outline/#select-outline: chrome must never
// block clicks through to the page); only the 8 squares opt back in, and resize.ts sets that
// opt-in inline since it is the one style the behavior actually depends on.
//
// Each square is centered ON its edge/corner via the -4px offsets below (half of the 8px box),
// so the handle straddles the boundary exactly like Figma's. The cursors are per-direction and
// are the whole affordance — without them a corner square reads as decoration.
`.resize-handles {
  position: fixed; z-index: 2147483646; pointer-events: none;
}
.resize-handle {
  position: absolute; width: 8px; height: 8px;
  background: var(--surface); border: 1.5px solid var(--accent); border-radius: 2px;
}
.resize-handle[data-handle="n"]  { top: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
.resize-handle[data-handle="s"]  { bottom: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
.resize-handle[data-handle="e"]  { right: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
.resize-handle[data-handle="w"]  { left: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
.resize-handle[data-handle="ne"] { top: -4px; right: -4px; cursor: nesw-resize; }
.resize-handle[data-handle="sw"] { bottom: -4px; left: -4px; cursor: nesw-resize; }
.resize-handle[data-handle="nw"] { top: -4px; left: -4px; cursor: nwse-resize; }
.resize-handle[data-handle="se"] { bottom: -4px; right: -4px; cursor: nwse-resize; }
` +
// Absolute toggle (panel.ts's Position block header) — an icon-weight toggle beside the
// "Position" group label, matching the register of the other in-title panel buttons rather
// than the full-width section buttons. The pressed state uses --control-active + --accent,
// the same "this mode is ON" vocabulary the rest of the panel's toggles use.
`.position-head { display: flex; align-items: center; }
.position-absolute-toggle {
  background: none; color: var(--text-muted); border: none; border-radius: 4px;
  font: 500 var(--text-sm) var(--font-ui); padding: 2px 5px; margin-left: auto;
}
.position-absolute-toggle:hover { background: var(--control); color: var(--text-secondary); }
.position-absolute-toggle.on { background: var(--control-active); color: var(--accent); }
`
