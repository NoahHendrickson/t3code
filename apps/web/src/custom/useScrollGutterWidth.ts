/**
 * Publishes a scroll container's real gutter width as a CSS variable — see
 * `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * The sidebar's thread list reserves its scrollbar with `scrollbar-gutter:
 * stable` and then gives that width back out of its end padding, so the cards
 * sit the same distance from both edges of the panel. That subtraction needs a
 * number, and the obvious one — `--app-scrollbar-width`, the token
 * `::-webkit-scrollbar` is styled from — is only true on WebKit. Firefox sets
 * no `scrollbar-width`, so it reserves the native scrollbar (~15px) and the
 * giveback under-corrects; with macOS overlay scrollbars it reserves *nothing*
 * and the giveback over-corrects, leaving 8px on the left and 2px on the right.
 * Both are worse than the symmetric padding this replaced, and neither is
 * visible to a token-matching guard.
 *
 * `offsetWidth - clientWidth` is the browser's own answer to the same question:
 * `clientWidth` spans content plus padding, `offsetWidth` adds border and the
 * scrollbar, and this element has no border. Measuring it makes the invariant
 * true everywhere instead of true on one engine — including the case a fat
 * scrollbar forces, where the giveback clamps to zero and the card sits flush
 * against the scrollbar because there is nowhere closer it could be.
 *
 * The measurement cannot feed back into itself: padding lives inside
 * `clientWidth`, so changing the padding this drives leaves the difference
 * unchanged, and the observer cannot oscillate.
 */
import { useCallback, useEffect, useRef } from "react";

export const SCROLL_GUTTER_VARIABLE = "--sidebar-list-gutter";

/**
 * Returns a callback ref. Attach it to the scroll container whose gutter the
 * padding is derived from; the variable is set on that element, so only its own
 * subtree can read it.
 */
export function useScrollGutterWidth(): (node: HTMLElement | null) => void {
  const observerRef = useRef<ResizeObserver | null>(null);

  // A remount without an intervening null callback would otherwise leave the
  // previous observer live.
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node === null) return;

    const measure = () => {
      const gutter = Math.max(0, node.offsetWidth - node.clientWidth);
      node.style.setProperty(SCROLL_GUTTER_VARIABLE, `${gutter}px`);
    };
    measure();

    // Not for content changes — `stable` reserves the gutter whether or not the
    // list scrolls — but for the width itself changing under it: a collapsed
    // sidebar reopening, or an OS scrollbar preference switching mid-session.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}
