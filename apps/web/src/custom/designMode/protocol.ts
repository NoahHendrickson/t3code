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

/** The computed-style properties the native panel renders, in section order. The guest
 * snapshot carries exactly these keys (engine/snapshot.ts); the panel reads them by name. */
export const DESIGN_MODE_STYLE_KEYS = [
  "display",
  "width",
  "height",
  "flex-direction",
  "flex-wrap",
  "gap",
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
  "border-top-style",
  "border-top-color",
  "border-width",
  "border-style",
  "border-color",
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

/** One selected element as the native panel sees it. `id` is minted by the guest engine
 * and is only meaningful for the current selection — commands referencing a stale id
 * no-op. `sourceLabel` is "file.tsx:12" when the element carries a data-dc-source tag. */
export interface DesignModeElementSnapshot {
  readonly id: number;
  readonly tag: string;
  readonly sourceLabel: string | null;
  readonly styles: Readonly<Record<DesignModeStyleKey, string>>;
}

/** One theme color custom property from the previewed app's stylesheets ("red-500",
 * "oklch(0.637 0.237 25.331)"). Values are raw CSS — the panel renders them directly. */
export interface DesignModeColorToken {
  readonly name: string;
  readonly value: string;
}

export type DesignModeEngineMessage =
  /** Engine finished booting. `tagged` reports whether the page carries any
   * `data-dc-source` attributes (the forge-mode dev plugin's JSX tags) — without them
   * selection is inert and the host shows the setup hint instead. */
  | { readonly type: "ready"; readonly tagged: boolean }
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
  setActive(on: boolean): void;
  isActive(): boolean;
  /** Applies one CSS draft to every listed element id (multi-select edits fan out here). */
  applyDraft(ids: readonly number[], property: string, value: string): void;
  discardAll(): void;
  /** Flips every draft to its "before" (true) or "after" (false) rendering. */
  compareAll(on: boolean): void;
  /** Builds the standalone change-request markdown plus pill summaries; null when there
   * is nothing to send. */
  buildSend(): DesignChangeRequestPayload | null;
  destroy(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isStyleMap = (value: unknown): value is Readonly<Record<DesignModeStyleKey, string>> =>
  isRecord(value) && DESIGN_MODE_STYLE_KEYS.every((key) => typeof value[key] === "string");

function parseElementSnapshot(value: unknown): DesignModeElementSnapshot | null {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.tag !== "string" ||
    (value.sourceLabel !== null && typeof value.sourceLabel !== "string") ||
    !isStyleMap(value.styles)
  ) {
    return null;
  }
  return {
    id: value.id,
    tag: value.tag,
    sourceLabel: value.sourceLabel,
    styles: value.styles,
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
      case "ready":
        return typeof value.tagged === "boolean" ? { type: "ready", tagged: value.tagged } : null;
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
      default:
        return null;
    }
  } catch {
    return null;
  }
}
