/**
 * Fork glass scroll pill — see `.fork/customizations.yaml#fork-glass-scroll-pill`.
 * Writes the pill's frame onto the transcript scroller; the Glass mask in
 * theme.custom.css cuts it out so the pill's wash lands on the stage.
 */

import { useLayoutEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { round, roundedHoleImage } from "./forkGlassPopupCutout";

/** On the pill once its hole is cut; the Glass wash keys on it, so a miss stays opaque. */
export const FORK_PILL_HOLE_CUT_ATTRIBUTE = "data-fork-hole-cut";

export const HOLE_PROPERTIES = [
  "--fork-pill-hole-image",
  "--fork-pill-hole-x",
  "--fork-pill-hole-y",
  "--fork-pill-hole-w",
  "--fork-pill-hole-h",
] as const;

type HoleProperty = (typeof HOLE_PROPERTIES)[number];

const SCROLLER_SELECTOR = ".fork-timeline-cutoff";

/** The pill's frame in the scroller's border box, which the mask is laid out in. */
export function pillHoleStyle(
  pill: {
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
    readonly radius: number;
  },
  scroller: { readonly x: number; readonly y: number },
): Record<HoleProperty, string> {
  return {
    "--fork-pill-hole-image": roundedHoleImage(pill.width, pill.height, pill.radius),
    "--fork-pill-hole-x": `${round(pill.centerX - pill.width / 2 - scroller.x)}px`,
    "--fork-pill-hole-y": `${round(pill.centerY - pill.height / 2 - scroller.y)}px`,
    "--fork-pill-hole-w": `${round(pill.width)}px`,
    "--fork-pill-hole-h": `${round(pill.height)}px`,
  };
}

/**
 * Ref for the pill's lane wrapper. Re-cuts when the pill, its lane or the
 * scroller resizes, and when the pill's `bottom` offset moves it.
 */
export function useForkGlassScrollPillHole(bottom: number) {
  const laneRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<(() => void) | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- binds the pill to a sibling component's scroller DOM node for the Glass mask
  useLayoutEffect(() => {
    const lane = laneRef.current;
    const pill = lane?.querySelector<HTMLElement>("[data-scroll-to-end]");
    const host = lane?.parentElement;
    if (!lane || !pill || !host) return;

    let scroller: HTMLElement | null = null;
    let unobserve = () => {};
    let written = "";
    // Only while unbound: the transcript renders a placeholder before its scroller.
    const waiting = new MutationObserver(() => {
      if (host.querySelector(SCROLLER_SELECTOR)) bind();
    });

    const release = () => {
      unobserve();
      unobserve = () => {};
      pill.removeAttribute(FORK_PILL_HOLE_CUT_ATTRIBUTE);
      for (const property of HOLE_PROPERTIES) scroller?.style.removeProperty(property);
      scroller = null;
      written = "";
    };

    const cut = () => {
      // A replaced scroller reports one last resize as it detaches.
      if (!scroller?.isConnected) {
        bind();
        return;
      }
      // Size from layout and position from the centre, so a press's scale
      // never shrinks the hole.
      const rect = pill.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      const style = pillHoleStyle(
        {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          width: pill.offsetWidth,
          height: pill.offsetHeight,
          radius: Number.parseFloat(getComputedStyle(pill).borderTopLeftRadius) || 0,
        },
        { x: box.left, y: box.top },
      );
      const next = Object.values(style).join("|");
      if (next === written) return;
      written = next;
      for (const property of HOLE_PROPERTIES) scroller.style.setProperty(property, style[property]);
      pill.setAttribute(FORK_PILL_HOLE_CUT_ATTRIBUTE, "");
    };

    const bind = () => {
      release();
      scroller = host.querySelector<HTMLElement>(SCROLLER_SELECTOR);
      if (!scroller) {
        waiting.observe(host, { childList: true, subtree: true });
        return;
      }
      waiting.disconnect();
      unobserve = observeResize([pill, lane, scroller], cut);
      cut();
    };

    bind();
    cutRef.current = cut;
    return () => {
      cutRef.current = null;
      waiting.disconnect();
      release();
    };
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- re-cuts the hole on the scroller, a sibling component's DOM node
  useLayoutEffect(() => {
    cutRef.current?.();
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new bottom moves the pill without resizing anything observed, so it re-cuts.
    bottom,
  ]);

  return laneRef;
}
