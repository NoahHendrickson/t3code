/**
 * Fork glass popup cutout — see `.fork/customizations.yaml#fork-glass-popup-cutout`.
 *
 * Under Glass the blur is macOS's own material, drawn behind a transparent
 * window, and no CSS filter can sample it. The composer's control row still
 * reads as glass because nothing in the page paints behind it: the transcript
 * is masked off above the composer, so its white wash lands straight on the
 * native material. Popups get the same treatment, except they open anywhere.
 * While one is open this masks a popup-shaped hole out of the app root, so the
 * rows and text under it stop painting and the popup's own tint
 * (theme.custom.palettes.css) sits directly on the glass.
 *
 * Popups portal into <body>, outside #root, so the mask never cuts them. The
 * mask exists only while a popup is open: a mask on the root puts the whole app
 * on its own render surface, which is fine for a menu's lifetime and not
 * something to keep around.
 */

/** Where each primitive puts `dropdown-glass` — the arms of the popup rule. */
export const FORK_GLASS_POPUP_SELECTOR = [
  ':is([data-slot="menu-popup"], [data-slot="popover-popup"], [data-slot="tooltip-popup"], [data-slot="dialog-popup"]).dropdown-glass',
  '[data-slot="select-popup"] > .dropdown-glass',
  '.dropdown-glass:has(> [data-slot="combobox-popup"])',
].join(", ");

/** The attributes Base UI moves when a popup opens, closes, or repositions. */
const WATCHED_ATTRIBUTES = [
  "style",
  "class",
  "hidden",
  "data-open",
  "data-closed",
  "data-starting-style",
  "data-ending-style",
  "data-side",
  "data-align",
];

/** Frames a popup must hold still before tracking stops. */
const SETTLED_FRAMES = 3;

type Hole = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
};

const round = (value: number) => Math.round(value * 2) / 2;

function collectHoles(body: HTMLElement, appRoot: HTMLElement): Array<Hole> {
  const holes: Array<Hole> = [];
  for (const container of body.children) {
    if (container === appRoot) continue;
    for (const popup of container.querySelectorAll<HTMLElement>(FORK_GLASS_POPUP_SELECTOR)) {
      // A closing popup fades out over the content it no longer hides, like a
      // cross-fade, rather than leaving a hole the fade reveals.
      if (popup.closest("[data-ending-style]")) continue;
      const rect = popup.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const style = getComputedStyle(popup);
      if (style.visibility === "hidden") continue;
      holes.push({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      });
    }
  }
  return holes;
}

/**
 * An SVG mask the size of the root: white everywhere, black where a popup
 * sits. Drawn through an inner <mask> so overlapping popups union instead of
 * cancelling out, as they would with an even-odd path.
 */
function buildMask(root: DOMRect, holes: ReadonlyArray<Hole>): string {
  const cutouts = holes
    .map(
      (hole) =>
        `<rect x='${round(hole.x - root.left)}' y='${round(hole.y - root.top)}' width='${round(hole.width)}' height='${round(hole.height)}' rx='${round(hole.radius)}' fill='black'/>`,
    )
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${Math.ceil(root.width)}' height='${Math.ceil(root.height)}'><mask id='m'><rect width='100%' height='100%' fill='white'/>${cutouts}</mask><rect width='100%' height='100%' mask='url(#m)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function startCutout(body: HTMLElement, appRoot: HTMLElement): () => void {
  let applied = "";
  let frame = 0;
  let stillFrames = 0;

  const write = (mask: string) => {
    if (mask === applied) return false;
    applied = mask;
    if (mask === "") {
      appRoot.style.removeProperty("mask-image");
      appRoot.style.removeProperty("mask-size");
      appRoot.style.removeProperty("mask-repeat");
    } else {
      appRoot.style.setProperty("mask-image", mask);
      appRoot.style.setProperty("mask-size", "100% 100%");
      appRoot.style.setProperty("mask-repeat", "no-repeat");
    }
    return true;
  };

  const update = () => {
    const holes = collectHoles(body, appRoot);
    return write(holes.length === 0 ? "" : buildMask(appRoot.getBoundingClientRect(), holes));
  };

  // Follows a popup frame by frame only while it is moving — a reposition
  // transition, a resize — and stops once it has held still.
  const track = () => {
    frame = 0;
    stillFrames = update() ? 0 : stillFrames + 1;
    if (stillFrames < SETTLED_FRAMES) frame = requestAnimationFrame(track);
  };

  // Runs in the mutation callback, before paint, so a hole lands in the same
  // frame as the popup that needs it.
  const kick = () => {
    stillFrames = 0;
    update();
    if (frame === 0) frame = requestAnimationFrame(track);
  };

  // Only the portal containers are watched, never #root: a streaming
  // transcript would otherwise run this on every token.
  const portalObserver = new MutationObserver(kick);
  const watched = new WeakSet<Element>();
  const watchPortals = () => {
    for (const container of body.children) {
      if (container === appRoot || watched.has(container)) continue;
      watched.add(container);
      portalObserver.observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: WATCHED_ATTRIBUTES,
      });
    }
  };
  const bodyObserver = new MutationObserver(() => {
    watchPortals();
    kick();
  });
  bodyObserver.observe(body, { childList: true });
  watchPortals();
  window.addEventListener("resize", kick);
  kick();

  return () => {
    bodyObserver.disconnect();
    portalObserver.disconnect();
    window.removeEventListener("resize", kick);
    if (frame !== 0) cancelAnimationFrame(frame);
    write("");
  };
}

let stop: (() => void) | null = null;

/** Called with whether glass resolved on; cuts popup holes only while it is. */
export function syncForkGlassPopupCutout(glassOn: boolean): void {
  stop?.();
  stop = null;
  if (!glassOn || typeof document === "undefined") return;
  const appRoot = document.getElementById("root");
  if (appRoot === null) return;
  stop = startCutout(document.body, appRoot);
}
