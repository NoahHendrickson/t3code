/**
 * Sidebar V2 list AutoAnimate plugin — see
 * `.fork/customizations.yaml#sidebar-v2-list-animation`.
 *
 * Upstream wires `@formkit/auto-animate` with `{ duration: 150, easing: "ease-out" }`,
 * but AutoAnimate's built-in *insert* path ignores that easing and instead holds
 * at `opacity: 0` for half of a 1.5× `ease-in` duration. Removals keep the short
 * ease-out scale/fade. Expanding a project group therefore feels delayed and
 * different from collapsing it, even though both are the same list mutation.
 *
 * This plugin makes add the reverse of remove: same duration, same easing,
 * same scale/opacity endpoints. Remain keeps AutoAnimate's FLIP (including the
 * right/bottom-anchored short-circuit). Plugins do not inherit AutoAnimate's
 * `prefers-reduced-motion` gate, so duration collapses to 0 when that is set.
 *
 * Every removal takes the same fade, including the card a collapsed group
 * keeps for the thread you are on. That one used to leave instantly, because
 * it left in the frame the route changed and the new chat view mounted — the
 * busiest frame there is — and a fade started there stuttered while the rows
 * below slid up unevenly. Sidebar.tsx now reads the keep off a deferred route
 * key, so the card leaves in the quiet re-render after that frame and the
 * ordinary fade and FLIP run clean.
 *
 * Spaces (fork-spaces) stack rows under a space's cards (PRs, Changelog,
 * Automations), so the rows that slide on a fold or unfold pass over the
 * cards' own spot. A fading card under a sliding row reads as two lines of
 * text on top of each other. In a list of spaces, then, what leaves goes at
 * once and the rest slide into clear space, and what arrives waits half the
 * slide before fading in, by when the rows below have mostly moved off it.
 */
import { getTransitionSizes, type AutoAnimationPlugin } from "@formkit/auto-animate";

export const SIDEBAR_V2_LIST_ANIMATION_DURATION_MS = 150;
export const SIDEBAR_V2_LIST_ANIMATION_EASING = "ease-out";

/** Collapse / remove — AutoAnimate's default remove keyframes. */
export const SIDEBAR_V2_LIST_REMOVE_KEYFRAMES = [
  { transform: "scale(1)", opacity: 1 },
  { transform: "scale(.98)", opacity: 0 },
] as const;

/** Expand / add — exact reverse of remove (no hold, no 1.5× duration). */
export const SIDEBAR_V2_LIST_ADD_KEYFRAMES = [
  { transform: "scale(.98)", opacity: 0 },
  { transform: "scale(1)", opacity: 1 },
] as const;

type MatchMedia = (query: string) => { readonly matches: boolean };

/** Exported for tests — plugins skip AutoAnimate's own reduced-motion gate. */
export function sidebarV2ListAnimationDurationMs(
  matchMedia: MatchMedia | undefined = globalThis.matchMedia,
): number {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return 0;
  }
  return SIDEBAR_V2_LIST_ANIMATION_DURATION_MS;
}

/** True for an item in a list that draws spaces: their headers mark it. */
function isSidebarV2SpaceListItem(el: Element): boolean {
  return el.parentElement?.querySelector(":scope > li[data-fork-space-header]") != null;
}

/** Timing for an add or remove: the list's own, or the spaces one above. */
export function sidebarV2ListEnterExitTiming(
  action: "add" | "remove",
  duration: number,
  inSpaces: boolean,
): KeyframeEffectOptions {
  const easing = SIDEBAR_V2_LIST_ANIMATION_EASING;
  if (!inSpaces) return { duration, easing };
  if (action === "remove") return { duration: 0, easing };
  return { duration, easing, delay: duration / 2, fill: "backwards" };
}

export const sidebarV2ListAnimation: AutoAnimationPlugin = (el, action, first, second) => {
  const duration = sidebarV2ListAnimationDurationMs();
  const easing = SIDEBAR_V2_LIST_ANIMATION_EASING;

  if (action === "add") {
    return new KeyframeEffect(
      el,
      [...SIDEBAR_V2_LIST_ADD_KEYFRAMES],
      sidebarV2ListEnterExitTiming("add", duration, isSidebarV2SpaceListItem(el)),
    );
  }

  if (action === "remove") {
    return new KeyframeEffect(
      el,
      [...SIDEBAR_V2_LIST_REMOVE_KEYFRAMES],
      sidebarV2ListEnterExitTiming("remove", duration, isSidebarV2SpaceListItem(el)),
    );
  }

  // Runtime passes (oldCoords, newCoords) for remain — see AutoAnimate's
  // remain() call site. The published param names swap those labels.
  const oldCoords = first!;
  const newCoords = second!;
  let deltaLeft = oldCoords.left - newCoords.left;
  let deltaTop = oldCoords.top - newCoords.top;
  const deltaRight = oldCoords.left + oldCoords.width - (newCoords.left + newCoords.width);
  const deltaBottom = oldCoords.top + oldCoords.height - (newCoords.top + newCoords.height);
  if (deltaBottom === 0) deltaTop = 0;
  if (deltaRight === 0) deltaLeft = 0;

  const [widthFrom, widthTo, heightFrom, heightTo] = getTransitionSizes(el, oldCoords, newCoords);
  const start: Keyframe = {
    transform: `translate(${deltaLeft}px, ${deltaTop}px)`,
  };
  const end: Keyframe = {
    transform: "translate(0, 0)",
  };
  if (widthFrom !== widthTo) {
    start.width = `${widthFrom}px`;
    end.width = `${widthTo}px`;
  }
  if (heightFrom !== heightTo) {
    start.height = `${heightFrom}px`;
    end.height = `${heightTo}px`;
  }
  return new KeyframeEffect(el, [start, end], { duration, easing });
};
