# PR #46 composer + favicon screenshots

Before/after captures for the visual checklist on
[`NoahHendrickson/t3code#46`](https://github.com/NoahHendrickson/t3code/pull/46).
Captured from the t3code draft thread (`Current checkout` + `#46` +
`fork/composer-chrome-and-favicon` context strip) with the composer form's
measured `clientWidth` pinned to each target, dark mode, 2x scale.

- `composer-before-*.png` — `custom@a3c19aa70`: mode row collapses to `⋯` below
  620, checkout chip stretches on upstream `flex-1`, branch chip truncates while
  empty space remains.
- `composer-after-*.png` — this branch: Full access / Build stay expanded down
  to 400, chips pack left, the 32-char branch label fits at 460+.
- `composer-after-380.png` — below the new 400 threshold the `⋯` compact menu
  and model-slot compaction still engage.
- The long-label context-strip case is the same captures: the branch chip
  carries the 32-char `fork/composer-chrome-and-favicon` label, truncated in
  before-460/620 and fully visible in after-460+.
- `apple-touch-icon-before/after.png` — dev-served web icon: upstream T3
  blueprint vs the Figma green-grid mark (`t3-fork` node `157:4036`).
