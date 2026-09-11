// Fork shadow of upstream draftHeroTransition — see
// `.fork/customizations.yaml#fork-new-agent-draft`.
//
// Everything upstream exports passes through untouched except the two timing
// constants below. Upstream slides the composer from the hero position to the
// dock in 180ms, which was tuned for a composer that only travelled. The fork's
// draft composer also folds from the drawn 80px box to the compact row and, on
// Westworld, the stage art fades under it, all on the first send — at 180ms
// that read as a snap. 400ms on the fork's chip-label curve gives the travel,
// the fold (theme.custom.css, `transition: … 400ms`) and the fade
// (theme.custom.palettes.css) one shared clock, so the composer moves as one
// thing. The three must agree; the fork-new-agent-draft guard pins them.
import { DRAFT_HERO_TRANSITION_ANIMATION_ID } from "~upstream/components/chat/draftHeroTransition";

export * from "~upstream/components/chat/draftHeroTransition";

export const DRAFT_HERO_TRANSITION_DURATION_MS = 400;
export const DRAFT_HERO_TRANSITION_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * True while upstream's slide is running. ChatView's overlay resize observer
 * reads it to hold its height publishes until the slide ends: with the fold
 * running, the docked overlay's height changes every frame, and each publish
 * is a ~40ms ChatView re-render — seven of them inside the 400ms window,
 * landing on whatever frames they happened to, was the stutter. The
 * trailing publish after `waitForDraftHeroTransition` carries the settled
 * height.
 */
export function isDraftHeroTransitionActive(): boolean {
  if (typeof document === "undefined" || typeof document.getAnimations !== "function") {
    return false;
  }
  return document
    .getAnimations()
    .some((animation) => animation.id === DRAFT_HERO_TRANSITION_ANIMATION_ID);
}
