/**
 * The wire contract between the T3 web app (host) and the headless design-mode engine
 * injected into the preview webview's guest page. Two channels, both fork-owned:
 *
 * - Guest → host: the engine `console.log`s one line per message, prefixed with
 *   `DESIGN_MODE_CONSOLE_PREFIX` and carrying a JSON-encoded `DesignModeEngineMessage`.
 *   The host listens on the webview element's `console-message` DOM event — event-driven,
 *   no polling, and available to the renderer with no desktop-process changes.
 * - Host → guest: `webview.executeJavaScript` against the `window.__T3_DESIGN_MODE__`
 *   handle the engine installs at boot (`DESIGN_MODE_GLOBAL`, shape below). Commands are
 *   fire-and-forget except `buildSend`, whose JSON-serializable return value rides the
 *   executeJavaScript promise back to the host.
 *
 * The panel UI itself is NATIVE T3 React (custom/designMode/panel/) — the guest keeps only
 * what must touch the page: selection chrome, inline-style drafts, gestures, inspection,
 * and the change-request builder.
 *
 * This module is imported by BOTH the host React code (web tsconfig) and the engine bundle
 * (engine tsconfig) — keep it dependency-free and strict-clean under both projects.
 */

export const DESIGN_MODE_CONSOLE_PREFIX = "__t3-design-mode__:";

/** Name of the guest-global handle the engine installs: `window.__T3_DESIGN_MODE__`. */
export const DESIGN_MODE_GLOBAL = "__T3_DESIGN_MODE__";

/**
 * Bumped whenever this contract changes in a way an older injected engine can't satisfy.
 * `boot()` compares it against a live handle's own stamp and rebuilds on a mismatch instead
 * of reusing it: a host update while the webview keeps its engine used to fail SILENTLY —
 * new verbs threw into `fire`'s catch, and the old engine's snapshots (missing whatever the
 * contract had grown) were rejected wholesale by the stricter parser, so selection simply
 * stopped updating with nothing in the UI to say why (PR #57 review).
 */
export const DESIGN_MODE_PROTOCOL_VERSION = 3;

/** The computed-style properties the native panel renders (READ keys), in section
 * order. The guest snapshot carries exactly these keys (engine/snapshot.ts); the panel
 * reads them by name. Writes may additionally target the shorthands below — the split
 * keeps the snapshot honest (no write-only keys serialized per selection) while the
 * writable union keeps every panel edit type-checked end to end. */
export const DESIGN_MODE_STYLE_KEYS = [
  "position",
  "top",
  "left",
  "display",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "aspect-ratio",
  "flex-direction",
  "flex-wrap",
  "row-gap",
  "column-gap",
  "justify-content",
  "align-items",
  "align-self",
  "flex-grow",
  "flex-shrink",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-top-color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "color",
  "background-color",
  "opacity",
] as const;

export type DesignModeStyleKey = (typeof DESIGN_MODE_STYLE_KEYS)[number];

/** WRITE-only shorthands: the panel reads longhands (border-top-width, row-gap) for
 * display but writes the shorthand so the change-request builder collapses cleanly. */
export const DESIGN_MODE_WRITE_ONLY_KEYS = [
  "gap",
  "border-width",
  "border-style",
  "border-color",
  "flex-basis",
  /** Written by the align row on grid children (engine/align.ts); nothing displays it. */
  "justify-self",
] as const;

export type DesignModeWritableKey =
  | DesignModeStyleKey
  | (typeof DESIGN_MODE_WRITE_ONLY_KEYS)[number];

/** How a layers-row click lands: replace the selection (plain click) or add/remove this one
 * element from it (Cmd/Shift-click), matching the canvas's own Shift-click. */
export type DesignModeSelectMode = "replace" | "toggle";

/** Figma's sizing vocabulary for one axis: explicit px / size-to-content / take the
 * available space. Read by the guest (draft-first — computed px can't distinguish an
 * authored `auto` from an authored `240px`); written through `setSizeMode`. */
export type DesignModeSizeMode = "fixed" | "hug" | "fill";

const SIZE_MODES: readonly DesignModeSizeMode[] = ["fixed", "hug", "fill"];

const parseSizeMode = (value: unknown): DesignModeSizeMode | null =>
  SIZE_MODES.find((mode) => mode === value) ?? null;

/** What owns this element's placement right now (engine/vendor/panel-specs.ts
 * `positionStateOf`). `draft`: an absolute-position draft is previewing it, so X/Y edits move
 * that draft's inset. `code`: the app's own CSS already places it absolutely, so X/Y are plain
 * left/top drafts. `flow`: in normal flow — X/Y are read-only offsets. Three states, not two:
 * an absolute draft with `on: false` is the absolute→flow direction and reads `flow`. */
export type DesignModePositionState = "draft" | "code" | "flow";

const POSITION_STATES: readonly DesignModePositionState[] = ["draft", "code", "flow"];

/** The two axes of Figma's align row. */
export type DesignModeAlignAxis = "horizontal" | "vertical";

/** Where the element lands on that axis within its parent. */
export type DesignModeAlignValue = "start" | "center" | "end";

/** Which halves of the align row have an honest CSS mapping for this element (engine/align.ts
 * decides; a block child has no vertical answer, so the panel disables those three buttons
 * rather than writing something that does nothing). */
export interface DesignModeAlignCaps {
  readonly horizontal: boolean;
  readonly vertical: boolean;
}

/** One selected element as the native panel sees it. `id` is minted by the guest engine
 * and is only meaningful for the current selection — commands referencing a stale id
 * no-op. `sourceLabel` is "file.tsx:12" when the element carries a data-dc-source tag. */
export interface DesignModeElementSnapshot {
  readonly id: number;
  readonly tag: string;
  readonly sourceLabel: string | null;
  readonly styles: Readonly<Record<DesignModeStyleKey, string>>;
  /** Current W/H sizing modes (engine/sizeMode.ts) — drives the panel's per-axis menu. */
  readonly sizeModes: { readonly width: DesignModeSizeMode; readonly height: DesignModeSizeMode };
  /** The panel's X/Y readout, in the same basis those fields WRITE (margin edge once out of
   * flow, offsetParent-relative in flow) — offsets aren't computed-style properties, so they
   * ride the snapshot rather than `styles`. */
  readonly offsets: { readonly x: number; readonly y: number };
  readonly positionState: DesignModePositionState;
  readonly alignCaps: DesignModeAlignCaps;
  /** CSS properties this element currently carries a draft for — the panel marks those
   * fields as changed and offers the per-property revert. Property names, not values: the
   * values are already visible through `styles` (computed styles include live drafts). */
  readonly drafted: readonly string[];
}

/** One theme color custom property from the previewed app's stylesheets ("red-500",
 * "oklch(0.637 0.237 25.331)"). Values are raw CSS — the panel renders them directly. */
export interface DesignModeColorToken {
  readonly name: string;
  readonly value: string;
}

/** One layers-tree node. Forge-tagged pages keep the curated walk (untagged wrappers
 * never mint nodes); untagged pages mint every visible element instead. Svg subtrees are
 * opaque in both walks. Ids come from the same registry as selection snapshots, so
 * tree ↔ panel selection stays consistent. */
export interface DesignModeLayerNode {
  readonly id: number;
  readonly tag: string;
  readonly label: string;
  /** Whether a drag can reorder this row among its siblings. The vendored move op previews
   * as inline `order`, which only auto-layout (flex/grid) parents honor — so the rail refuses
   * the drop everywhere else instead of accepting a gesture the guest would drop. */
  readonly reorderable: boolean;
  /** Identifies this node's DOM parent within one layers message. Two rows can only be
   * reordered against each other when these match — the curated walk hoists tagged
   * descendants through untagged wrappers, so rows that look like siblings in the TREE
   * routinely aren't in the DOM, and the guest refuses those (PR #57 review). Only equality
   * is meaningful; the numbers are per-message and mean nothing across two. */
  readonly siblingGroup: number;
  readonly children: readonly DesignModeLayerNode[];
}

/** Deepest node index the layers protocol carries (roots are 0, so 33 levels). The parser
 * bounds its own recursion here against a hostile payload, and the GUEST serializer stops
 * at the same number so an honestly-deep page can never emit a message the host rejects
 * wholesale — the node budget caps breadth, and nothing capped depth until untagged pages
 * started minting a node per DOM element (PR #52/#54 review). One constant, both sides. */
export const DESIGN_MODE_LAYERS_MAX_DEPTH = 32;

/** How the engine maps elements to source on this page. `forge`: the project runs
 * forge-mode's JSX tagger — exact pre-compile tags, the most precise mapping. `native-react`:
 * no tags, but the desktop preload's react-grab resolver is present, so React development
 * metadata recovers file:line:col lazily. `selector-only`: neither — everything stays
 * editable and sends describe elements by selector/text/style context. */
export type DesignModeSourceMode = "forge" | "native-react" | "selector-only";

const SOURCE_MODES: readonly DesignModeSourceMode[] = ["forge", "native-react", "selector-only"];

/** Host-triggered canvas verbs beyond on/off — exactly the verbs the panel's zoom strip
 * fires; the guest's CanvasMode owns the math (vendored Forge canvas: cursor-anchored
 * zoom, powers-of-2 ladder, fit). Zoom-to-selection exists only as the guest's own
 * Shift+2 shortcut — no host verb until a panel control sends one. `reset-view` pins the
 * artboard 1:1 at the page origin; the screen-size picker fires it after the viewport
 * commit so the artboard lands ON the freshly sized window instead of keeping the previous
 * size's pan/zoom. It is NOT `zoom-100`, which holds the viewport centre. */
export type DesignModeCanvasCommand =
  | "zoom-in"
  | "zoom-out"
  | "zoom-fit"
  | "zoom-100"
  | "reset-view";

export type DesignModeEngineMessage =
  /** Engine finished booting; reports how source mapping works on this page. */
  | { readonly type: "ready"; readonly sourceMode: DesignModeSourceMode }
  /** Canvas (zoom/pan artboard) state — emitted on toggle and, debounced, as gestures
   * move the zoom. `scalePercent` is a whole number (100 = 1:1). */
  | { readonly type: "canvas"; readonly on: boolean; readonly scalePercent: number }
  /** Mirrors every setActive transition (Esc inside the page exits too). */
  | { readonly type: "state"; readonly active: boolean }
  /** The in-page selection changed; empty array means deselected. */
  | { readonly type: "selection"; readonly elements: readonly DesignModeElementSnapshot[] }
  /** The draft count changed (emitted on change only, never per scrub tick). */
  | { readonly type: "drafts"; readonly count: number }
  /** The previewed app's Tailwind theme tokens, read from its live stylesheets on every
   * activation (theme edits between sessions are picked up). Empty colors + null spacing
   * means "not a Tailwind project" — the panel hides token affordances. */
  | {
      readonly type: "tokens";
      readonly colors: readonly DesignModeColorToken[];
      readonly spacingBasePx: number | null;
    }
  /** The curated layers tree; re-emitted (debounced, change-gated) as the page mutates.
   * `truncated` reports the 400-node serialization cap being hit. */
  | {
      readonly type: "layers";
      readonly roots: readonly DesignModeLayerNode[];
      readonly truncated: boolean;
    };

/** One element's worth of a built change request, compact enough for the composer's
 * attachment pill: "div · App.tsx:15" plus per-change deltas like
 * "padding-top 24px → 32px". */
export interface DesignChangeElementSummary {
  readonly tag: string;
  readonly sourceLabel: string | null;
  readonly deltas: readonly string[];
}

export interface DesignChangeRequestPayload {
  readonly markdown: string;
  readonly elementCount: number;
  readonly elements: readonly DesignChangeElementSummary[];
}

/** The command surface `boot.ts` installs at `window.__T3_DESIGN_MODE__`. The host calls
 * these through `webview.executeJavaScript` (designModeBridge.ts) — every argument and
 * return value must stay JSON-serializable. */
export interface DesignModeGuestHandle {
  /** DESIGN_MODE_PROTOCOL_VERSION as of the injection that installed this handle. */
  readonly version: number;
  setActive(on: boolean): void;
  isActive(): boolean;
  /** Applies one CSS draft to every listed element id (multi-select edits fan out here). */
  applyDraft(ids: readonly number[], property: DesignModeWritableKey, value: string): void;
  /** Applies a Figma sizing mode (fixed/hug/fill) to one axis of every listed element. */
  setSizeMode(ids: readonly number[], axis: "width" | "height", mode: DesignModeSizeMode): void;
  /** Figma's absolute-position toggle — drafts the element out of (or back into) flow. */
  setAbsolute(ids: readonly number[], on: boolean): void;
  /** Writes one axis of the X/Y pair; routed by position state (draft inset vs left/top css).
   * A no-op on elements still in flow, where the fields are read-only. */
  setInset(ids: readonly number[], axis: "x" | "y", px: number): void;
  /** Aligns each element within its own parent (engine/align.ts picks the CSS mapping). */
  alignSelection(
    ids: readonly number[],
    axis: DesignModeAlignAxis,
    value: DesignModeAlignValue,
  ): void;
  /** Figma's aspect-ratio link beside W/H: on pins `aspect-ratio` to the element's current
   * proportion, off releases it. */
  setAspectLock(ids: readonly number[], on: boolean): void;
  /** Drops the drafts for exactly these properties, restoring the page's own values —
   * the per-field revert behind a changed marker. Structural drafts are untouched. */
  revertDraft(ids: readonly number[], properties: readonly string[]): void;
  discardAll(): void;
  /** Flips every draft to its "before" (true) or "after" (false) rendering. */
  compareAll(on: boolean): void;
  /** Builds the standalone change-request markdown plus pill summaries; null when there
   * is nothing to send. Async: the engine grants in-flight native source resolution a
   * bounded grace before falling back to selector context — the promise rides Electron's
   * executeJavaScript back to the host either way. */
  buildSend(): Promise<DesignChangeRequestPayload | null>;
  /** Layers-tree interactions — ids from selection snapshots or layer nodes. `toggle` is
   * the rail's Cmd/Shift-click, adding or removing the row from the current selection. */
  selectElement(id: number, mode?: DesignModeSelectMode): void;
  hoverElement(id: number | null): void;
  /** Moves `id` to sit immediately before `beforeId` among its siblings; null means "to the
   * end" (rail drag-and-drop). Sibling-relative rather than index-based on purpose: the
   * curated layers tree hoists tagged descendants through untagged wrappers, so a row's
   * position in the TREE is not its position in the DOM — only the guest can turn "before
   * this element" into an index. Refused when the two don't share a parent. */
  reorderElement(id: number, beforeId: number | null): void;
  /** Canvas mode: turn the page into a pannable/zoomable artboard (Figma-style). */
  setCanvas(on: boolean): void;
  /** Discrete canvas zoom verbs; no-ops while canvas is off. */
  canvasCommand(action: DesignModeCanvasCommand): void;
  destroy(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isStyleMap = (value: unknown): value is Readonly<Record<DesignModeStyleKey, string>> =>
  isRecord(value) && DESIGN_MODE_STYLE_KEYS.every((key) => typeof value[key] === "string");

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseElementSnapshot(value: unknown): DesignModeElementSnapshot | null {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.tag !== "string" ||
    (value.sourceLabel !== null && typeof value.sourceLabel !== "string") ||
    !isStyleMap(value.styles) ||
    !isRecord(value.sizeModes) ||
    !isRecord(value.offsets) ||
    !isFiniteNumber(value.offsets.x) ||
    !isFiniteNumber(value.offsets.y) ||
    !isRecord(value.alignCaps) ||
    typeof value.alignCaps.horizontal !== "boolean" ||
    typeof value.alignCaps.vertical !== "boolean" ||
    !Array.isArray(value.drafted) ||
    !value.drafted.every((property): property is string => typeof property === "string")
  ) {
    return null;
  }
  const width = parseSizeMode(value.sizeModes.width);
  const height = parseSizeMode(value.sizeModes.height);
  const positionState = POSITION_STATES.find((state) => state === value.positionState);
  if (width === null || height === null || !positionState) return null;
  return {
    id: value.id,
    tag: value.tag,
    sourceLabel: value.sourceLabel,
    styles: value.styles,
    sizeModes: { width, height },
    offsets: { x: value.offsets.x, y: value.offsets.y },
    positionState,
    alignCaps: {
      horizontal: value.alignCaps.horizontal,
      vertical: value.alignCaps.vertical,
    },
    drafted: value.drafted,
  };
}

/** Depth-bounded against a malicious payload — the guest serializer stops at the same
 * DESIGN_MODE_LAYERS_MAX_DEPTH, so a real page's tree never trips this. */
function parseLayerNode(value: unknown, depth: number): DesignModeLayerNode | null {
  if (
    depth > DESIGN_MODE_LAYERS_MAX_DEPTH ||
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.tag !== "string" ||
    typeof value.label !== "string" ||
    typeof value.reorderable !== "boolean" ||
    !isNonNegativeInteger(value.siblingGroup) ||
    !Array.isArray(value.children)
  ) {
    return null;
  }
  const children = value.children.map((child) => parseLayerNode(child, depth + 1));
  if (children.some((child) => child === null)) return null;
  return {
    id: value.id,
    tag: value.tag,
    label: value.label,
    reorderable: value.reorderable,
    siblingGroup: value.siblingGroup,
    children: children.filter((child): child is DesignModeLayerNode => child !== null),
  };
}

function parseColorToken(value: unknown): DesignModeColorToken | null {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.value !== "string") {
    return null;
  }
  return { name: value.name, value: value.value };
}

function parseElementSummary(value: unknown): DesignChangeElementSummary | null {
  if (
    !isRecord(value) ||
    typeof value.tag !== "string" ||
    (value.sourceLabel !== null && typeof value.sourceLabel !== "string") ||
    !Array.isArray(value.deltas) ||
    !value.deltas.every((delta): delta is string => typeof delta === "string")
  ) {
    return null;
  }
  return { tag: value.tag, sourceLabel: value.sourceLabel, deltas: value.deltas };
}

/** Decodes the result returned across Electron's executeJavaScript boundary. */
export function parseDesignChangeRequestPayload(value: unknown): DesignChangeRequestPayload | null {
  if (
    !isRecord(value) ||
    typeof value.markdown !== "string" ||
    !isNonNegativeInteger(value.elementCount) ||
    !Array.isArray(value.elements)
  ) {
    return null;
  }
  const elements = value.elements.map(parseElementSummary);
  if (elements.some((element) => element === null) || value.elementCount !== elements.length) {
    return null;
  }
  return {
    markdown: value.markdown,
    elementCount: value.elementCount,
    elements: elements.filter((element): element is DesignChangeElementSummary => element !== null),
  };
}

/** Parses one console-message line; null when the line is not a design-mode message. */
export function parseDesignModeConsoleMessage(line: string): DesignModeEngineMessage | null {
  if (!line.startsWith(DESIGN_MODE_CONSOLE_PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(line.slice(DESIGN_MODE_CONSOLE_PREFIX.length));
    if (!isRecord(value)) return null;
    switch (value.type) {
      case "ready": {
        const sourceMode = SOURCE_MODES.find((mode) => mode === value.sourceMode);
        return sourceMode ? { type: "ready", sourceMode } : null;
      }
      case "canvas":
        return typeof value.on === "boolean" &&
          typeof value.scalePercent === "number" &&
          Number.isFinite(value.scalePercent)
          ? { type: "canvas", on: value.on, scalePercent: value.scalePercent }
          : null;
      case "state":
        return typeof value.active === "boolean" ? { type: "state", active: value.active } : null;
      case "selection": {
        if (!Array.isArray(value.elements)) return null;
        const elements = value.elements.map(parseElementSnapshot);
        return elements.some((element) => element === null)
          ? null
          : {
              type: "selection",
              elements: elements.filter(
                (element): element is DesignModeElementSnapshot => element !== null,
              ),
            };
      }
      case "drafts":
        return isNonNegativeInteger(value.count) ? { type: "drafts", count: value.count } : null;
      case "tokens": {
        if (!Array.isArray(value.colors)) return null;
        if (value.spacingBasePx !== null && typeof value.spacingBasePx !== "number") return null;
        const colors = value.colors.map(parseColorToken);
        return colors.some((token) => token === null)
          ? null
          : {
              type: "tokens",
              colors: colors.filter((token): token is DesignModeColorToken => token !== null),
              spacingBasePx: value.spacingBasePx,
            };
      }
      case "layers": {
        if (!Array.isArray(value.roots) || typeof value.truncated !== "boolean") return null;
        const roots = value.roots.map((root) => parseLayerNode(root, 0));
        return roots.some((root) => root === null)
          ? null
          : {
              type: "layers",
              roots: roots.filter((root): root is DesignModeLayerNode => root !== null),
              truncated: value.truncated,
            };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
