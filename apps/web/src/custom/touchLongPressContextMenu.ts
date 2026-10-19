/**
 * Long-press opens the context menu on iOS — see
 * `.fork/customizations.yaml#fork-touch-affordances`.
 *
 * Sidebar rows, project headers, right-panel tabs and pull request rows keep
 * their secondary actions (pin, snooze, settle, discard draft, close others…)
 * in a right-click menu. Android Chrome fires `contextmenu` on a long-press,
 * so those menus already open there. iOS WebKit never fires it from touch, so
 * on an iPhone the actions had no way in at all.
 *
 * This fills that one gap: on iOS, holding still on one of the listed
 * surfaces dispatches the `contextmenu` event the platform would have sent,
 * at the finger's position, so each surface's existing handler opens its own
 * menu. Nothing else is listened for and no other platform is touched.
 * Surfaces are opted in by selector rather than globally because a long-press
 * elsewhere already means something on iOS — selecting transcript text,
 * previewing a link — and a synthetic event there would fight it.
 */

/** Surfaces whose `onContextMenu` holds actions with no other touch entry. */
export const TOUCH_CONTEXT_MENU_SELECTOR = [
  "[data-thread-item]",
  "[data-fork-project-section-header]",
  "[data-right-panel-tab-list] [data-active-tab]",
  ".group\\/pr-row",
].join(", ");

/** Matches the platform's own long-press delay closely enough to feel native. */
export const LONG_PRESS_MS = 500;
/** A finger that drifts further than this is scrolling, not pressing. */
export const LONG_PRESS_SLOP_PX = 10;

/** iPhone, iPod and iPad — iPadOS reports itself as a Mac with touch points. */
export function isTouchContextMenuMissing(
  nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">,
): boolean {
  if (/iP(hone|od|ad)/.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

/**
 * Installs the listeners on `doc`. Returns the uninstaller; a no-op off iOS.
 */
export function installTouchLongPressContextMenu(
  doc: Document = document,
  nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator,
): () => void {
  if (!isTouchContextMenuMissing(nav)) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; pointerId: number } | null = null;
  // The release after a long-press still produces a click on the row under
  // the finger; that click would navigate away from the menu just opened.
  let swallowNextClick = false;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    start = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    cancel();
    swallowNextClick = false;
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(TOUCH_CONTEXT_MENU_SELECTOR)) return;
    start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    timer = setTimeout(() => {
      timer = null;
      if (start === null) return;
      const handled = !target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: start.x,
          clientY: start.y,
        }),
      );
      start = null;
      if (!handled) return;
      swallowNextClick = true;
      doc.getSelection()?.removeAllRanges();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (start === null || event.pointerId !== start.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX) {
      cancel();
    }
  };

  const onClick = (event: MouseEvent) => {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointermove", onPointerMove, true);
  doc.addEventListener("pointerup", cancel, true);
  doc.addEventListener("pointercancel", cancel, true);
  doc.addEventListener("click", onClick, true);
  return () => {
    cancel();
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", cancel, true);
    doc.removeEventListener("pointercancel", cancel, true);
    doc.removeEventListener("click", onClick, true);
  };
}
