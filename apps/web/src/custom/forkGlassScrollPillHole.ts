/**
 * Fork glass scroll pill — see `.fork/customizations.yaml#fork-glass-scroll-pill`.
 * Writes the pill's frame onto the transcript scroller; the Glass mask in
 * theme.custom.palettes.css cuts it out so the pill's wash lands on the stage.
 */

import { useLayoutEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";

export const FORK_PILL_HOLE_ATTRIBUTE = "data-fork-pill-hole";

const HOLE_PROPERTIES = [
  "--fork-pill-hole-image",
  "--fork-pill-hole-x",
  "--fork-pill-hole-y",
  "--fork-pill-hole-w",
  "--fork-pill-hole-h",
];

const round = (value: number) => Math.round(value * 2) / 2;

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
): Record<string, string> {
  const width = round(pill.width);
  const height = round(pill.height);
  const radius = round(Math.min(pill.radius, pill.height / 2));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' rx='${radius}'/></svg>`;
  return {
    "--fork-pill-hole-image": `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    "--fork-pill-hole-x": `${round(pill.centerX - pill.width / 2 - scroller.x)}px`,
    "--fork-pill-hole-y": `${round(pill.centerY - pill.height / 2 - scroller.y)}px`,
    "--fork-pill-hole-w": `${width}px`,
    "--fork-pill-hole-h": `${height}px`,
  };
}

/**
 * Ref for the pill's lane wrapper. Re-cuts when the pill, its lane or the
 * scroller resizes, and when the pill's `bottom` offset moves it.
 */
export function useForkGlassScrollPillHole(bottom: number) {
  const laneRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the pill's measured frame onto a sibling component's DOM node for the Glass mask
  useLayoutEffect(() => {
    const lane = laneRef.current;
    const pill = lane?.querySelector<HTMLElement>("[data-scroll-to-end]");
    const scroller = lane?.parentElement?.querySelector<HTMLElement>(".fork-timeline-cutoff");
    if (!lane || !pill || !scroller) return;

    let written = "";
    const cut = () => {
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
      for (const [property, value] of Object.entries(style)) {
        scroller.style.setProperty(property, value);
      }
    };

    cut();
    scroller.setAttribute(FORK_PILL_HOLE_ATTRIBUTE, "");
    const unobserve = observeResize([pill, lane, scroller], cut);
    return () => {
      unobserve();
      scroller.removeAttribute(FORK_PILL_HOLE_ATTRIBUTE);
      for (const property of HOLE_PROPERTIES) scroller.style.removeProperty(property);
    };
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new bottom moves the pill without resizing anything observed, so it re-cuts.
    bottom,
  ]);
  return laneRef;
}
