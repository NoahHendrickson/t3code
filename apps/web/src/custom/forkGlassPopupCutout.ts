/**
 * Fork glass popup cutout — see `.fork/customizations.yaml#fork-glass-popup-cutout`.
 *
 * Under Glass the blur is macOS's own material, drawn behind a transparent
 * window, and no CSS filter can sample it. The composer's control row still
 * reads as glass because nothing in the page paints behind it: the transcript
 * is masked off above the composer, so its white wash lands straight on the
 * native material. Popups get the same treatment, except they open anywhere.
 * While one is open this masks a popup-shaped hole out of everything painted
 * beneath it, so the popup's own tint (theme.custom.palettes.css) sits
 * directly on the glass.
 *
 * "Beneath" is #root plus any portal opened before the popup — a menu over
 * the Usage panel, a select inside a dialog. Popups portal into <body> in the
 * order they open, so a portal container is under every popup whose container
 * comes after it. An empty-box portal container cannot carry the mask for its
 * fixed children, so the mask goes on the container's children instead
 * (positioners, backdrops), and only on those a hole actually touches.
 *
 * Masks exist only while a popup is open. With none open, all that runs is a
 * childList observer on <body> and on the portal containers, to notice one
 * mounting (Base UI mounts the container before rendering into it, so body
 * alone would see an empty div). Attribute and size observers attach only to
 * containers that hold an open popup.
 */

/** Where each primitive puts `dropdown-glass` — the arms of the popup rule. */
export const FORK_GLASS_POPUP_SELECTOR = [
  ':is([data-slot="menu-popup"], [data-slot="popover-popup"], [data-slot="tooltip-popup"], [data-slot="dialog-popup"]).dropdown-glass',
  '[data-slot="select-popup"] > .dropdown-glass',
  '.dropdown-glass:has(> [data-slot="combobox-popup"])',
].join(", ");

/** The attributes Base UI moves on a popup's subtree when it closes or repositions. */
const POPUP_ATTRIBUTES = ["style", "hidden", "data-ending-style", "data-side", "data-align"];

/**
 * Frames a popup must hold still before frame tracking stops. Tooltip and
 * popover positioners transition top/left/transform when they hop between
 * triggers; the one style write that starts the transition is the only
 * mutation it makes, so the hole follows the rest frame by frame.
 */
const SETTLED_FRAMES = 3;

/** Reaches past a lower surface's border box to the popup shadows around it. */
const SHADOW_REACH = 48;

const MASK_PROPERTIES = ["mask-image", "mask-size", "mask-position", "mask-repeat", "mask-clip"];

type Hole = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /** Index of the portal container the popup lives in; higher opened later. */
  readonly layer: number;
};

const round = (value: number) => Math.round(value * 2) / 2;

function measure(popup: HTMLElement, layer: number): Hole | null {
  // A closing popup fades out over the content it no longer hides, like a
  // cross-fade, rather than leaving a hole the fade reveals.
  if (popup.closest("[data-ending-style]")) return null;
  const rect = popup.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const style = getComputedStyle(popup);
  if (style.visibility === "hidden") return null;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    layer,
  };
}

function touches(rect: DOMRect, hole: Hole): boolean {
  return (
    rect.left - SHADOW_REACH < hole.x + hole.width &&
    rect.right + SHADOW_REACH > hole.x &&
    rect.top - SHADOW_REACH < hole.y + hole.height &&
    rect.bottom + SHADOW_REACH > hole.y
  );
}

/**
 * An SVG mask the size of the viewport: white everywhere, black where a popup
 * sits. Drawn through an inner <mask> so overlapping popups union instead of
 * cancelling out, as they would with an even-odd path.
 */
function viewportMask(width: number, height: number, holes: ReadonlyArray<Hole>): string {
  const cutouts = holes
    .map(
      (hole) =>
        `<rect x='${round(hole.x)}' y='${round(hole.y)}' width='${round(hole.width)}' height='${round(hole.height)}' rx='${round(hole.radius)}' fill='black'/>`,
    )
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><mask id='m'><rect width='100%' height='100%' fill='white'/>${cutouts}</mask><rect width='100%' height='100%' mask='url(#m)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function startCutout(body: HTMLElement, appRoot: HTMLElement): () => void {
  /** Element → the mask it carries, as written, so unchanged frames write nothing. */
  const masked = new Map<HTMLElement, string>();
  let containers: Array<Element> = [];
  let popups: Array<HTMLElement> = [];
  let frame = 0;
  let stillFrames = 0;

  const clearMask = (element: HTMLElement) => {
    for (const property of MASK_PROPERTIES) element.style.removeProperty(property);
  };

  /** Writes every mask for the current popups; true if anything changed. */
  const apply = (): boolean => {
    const holes: Array<Hole> = [];
    containers.forEach((container, layer) => {
      for (const popup of container.querySelectorAll<HTMLElement>(FORK_GLASS_POPUP_SELECTOR)) {
        const hole = measure(popup, layer);
        if (hole !== null) holes.push(hole);
      }
    });

    const next = new Map<HTMLElement, ReadonlyArray<Hole>>();
    if (holes.length > 0) {
      next.set(appRoot, holes);
      containers.forEach((container, layer) => {
        const above = holes.filter((hole) => hole.layer > layer);
        if (above.length === 0) return;
        for (const child of container.children) {
          if (!(child instanceof HTMLElement)) continue;
          const rect = child.getBoundingClientRect();
          const cut = above.filter((hole) => touches(rect, hole));
          if (cut.length > 0) next.set(child, cut);
        }
      });
    }

    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    let changed = false;
    for (const [element, cut] of next) {
      // The same viewport-sized image on every surface, shifted so it lines up
      // with the viewport; no-clip keeps a lower popup's shadow outside its box.
      const rect = element.getBoundingClientRect();
      const image = viewportMask(width, height, cut);
      const position = `${round(-rect.left)}px ${round(-rect.top)}px`;
      const written = `${image} ${position}`;
      if (masked.get(element) === written) continue;
      masked.set(element, written);
      element.style.setProperty("mask-image", image);
      element.style.setProperty("mask-size", `${width}px ${height}px`);
      element.style.setProperty("mask-position", position);
      element.style.setProperty("mask-repeat", "no-repeat");
      element.style.setProperty("mask-clip", "no-clip");
      changed = true;
    }
    for (const element of masked.keys()) {
      if (next.has(element)) continue;
      masked.delete(element);
      clearMask(element);
      changed = true;
    }
    return changed;
  };

  const structure = new MutationObserver(() => refresh());
  const moves = new MutationObserver(() => refresh());
  const sizes = new ResizeObserver(() => refresh());

  const sameElements = (a: ReadonlyArray<Element>, b: ReadonlyArray<Element>) =>
    a.length === b.length && a.every((element, index) => element === b[index]);

  // Re-observes rather than accumulating, so a portal that unmounts is dropped.
  const rewatchContainers = (next: Array<Element>) => {
    containers = next;
    structure.disconnect();
    structure.observe(body, { childList: true });
    for (const container of containers) {
      structure.observe(container, { childList: true, subtree: true });
    }
  };

  const rewatchPopups = (next: Array<HTMLElement>) => {
    popups = next;
    moves.disconnect();
    sizes.disconnect();
    for (const popup of popups) {
      const container = containers.find((candidate) => candidate.contains(popup));
      if (container !== undefined) {
        moves.observe(container, {
          subtree: true,
          attributes: true,
          attributeFilter: POPUP_ATTRIBUTES,
        });
      }
      sizes.observe(popup);
    }
  };

  // Follows popups frame by frame only while they move, then stops.
  const track = () => {
    frame = 0;
    stillFrames = apply() ? 0 : stillFrames + 1;
    if (popups.length > 0 && stillFrames < SETTLED_FRAMES) frame = requestAnimationFrame(track);
  };

  // Runs in the observer callbacks, before paint, so a hole lands in the same
  // frame as the popup that needs it.
  function refresh() {
    const nextContainers = Array.from(body.children).filter((child) => child !== appRoot);
    if (!sameElements(containers, nextContainers)) rewatchContainers(nextContainers);
    const nextPopups = containers.flatMap((container) =>
      Array.from(container.querySelectorAll<HTMLElement>(FORK_GLASS_POPUP_SELECTOR)),
    );
    if (!sameElements(popups, nextPopups)) rewatchPopups(nextPopups);
    stillFrames = 0;
    apply();
    if (popups.length > 0 && frame === 0) frame = requestAnimationFrame(track);
  }

  window.addEventListener("resize", refresh);
  rewatchContainers(Array.from(body.children).filter((child) => child !== appRoot));
  refresh();

  return () => {
    structure.disconnect();
    moves.disconnect();
    sizes.disconnect();
    window.removeEventListener("resize", refresh);
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const element of masked.keys()) clearMask(element);
    masked.clear();
  };
}

let stop: (() => void) | null = null;

/**
 * Called with whether glass is on. Idempotent: a palette sync that leaves glass
 * where it was keeps the running cutout instead of tearing it down.
 */
export function syncForkGlassPopupCutout(glassOn: boolean): void {
  if (glassOn === (stop !== null)) return;
  if (!glassOn) {
    stop?.();
    stop = null;
    return;
  }
  if (typeof document === "undefined") return;
  const appRoot = document.getElementById("root");
  if (appRoot === null) return;
  stop = startCutout(document.body, appRoot);
}
