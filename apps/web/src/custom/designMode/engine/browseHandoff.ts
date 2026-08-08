/**
 * Hold ⌘ to hand the page back: while the modifier is down every intercepting path in the
 * engine yields, so the app under inspection behaves as if design mode were off — menus
 * open, links follow, forms take input — without leaving design mode or losing the
 * selection. This module is the one home for that policy: the gesture predicate, the click
 * replacement and its re-entrancy guard live here so the engine's handlers ask instead of
 * each owning a special case (the canvasSession.ts / layersSession.ts pattern of owning a
 * subsystem end to end). A path added later that intercepts without asking is the drift
 * this boundary exists to prevent.
 */
export class BrowseHandoff {
  /** The click the browse gesture is holding ⌘ FOR, tracked while it is in flight so
   * handleClick can recognize its own re-dispatched copy on the copy's trip back through
   * the caller's capture listener. */
  private inFlight: MouseEvent | null = null;

  /**
   * The gesture predicate, for paths that yield silently (hover chrome, the source
   * prefetch, double-click text edit, the keyboard verbs, drag starts). Read off the EVENT
   * rather than tracked from keydown, because the keydown that arms it routinely lands on
   * T3's own chrome (the panel, the layers rail) while the click lands in the guest — a
   * tracked flag would read false exactly when it matters. The physical side of the key is
   * deliberately not distinguished: mouse events carry `metaKey`, never which ⌘ produced
   * it, and one source of truth beats an affordance that disagrees with itself. Meta-only,
   * so this is a macOS gesture; Windows/Linux never deliver the Super key to the page.
   */
  shouldYield(e: MouseEvent | KeyboardEvent): boolean {
    return e.metaKey;
  }

  /**
   * The click path. 'passthrough' means the event belongs to the page — either a ⌘-click
   * this call just swallowed and re-dispatched, or the modifier-free copy re-entering the
   * caller's capture listener on its way to the page. 'intercept' means design mode owns
   * the click.
   *
   * The copy exists because standing aside would give the page a ⌘-click, and a ⌘-click is
   * not a click: Chromium reads it on an anchor as "open in a new tab", and every router
   * Link bails out of client-side navigation when `metaKey` is set — so the gesture meant
   * to walk the app would open tabs instead of following links. The copy carries the
   * original's geometry and button with the modifiers cleared.
   */
  handleClick(e: MouseEvent): "passthrough" | "intercept" {
    if (e === this.inFlight) return "passthrough";
    if (!this.shouldYield(e)) return "intercept";
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (target instanceof Element) {
      const copy = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        buttons: e.buttons,
      });
      this.inFlight = copy;
      try {
        target.dispatchEvent(copy);
      } finally {
        this.inFlight = null;
      }
    }
    return "passthrough";
  }
}
