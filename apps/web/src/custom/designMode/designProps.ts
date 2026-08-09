/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The rendering component's primitive-props snapshot, on its way from the desktop
 * resolver into the change request: validation, the stamp attribute, and the JSX-shaped
 * inline rendering. Lives OUTSIDE engine/ (the cssOrigin.ts pattern) so it stays
 * unit-testable in apps/web's project while the engine island includes it by reference.
 *
 * Trust boundary: this is the guest-side TWIN of `normalizeResolvedProps` in
 * apps/desktop/src/preview/DesignSourceResult.ts — deliberate duplication, not a shared
 * helper, because each side of the page-shared global must hold on its own. Keep the
 * caps and shapes in step. The validator runs TWICE per journey on purpose: once on the
 * resolver result (nativeSource.ts), and again when the request builder reads the stamped
 * attribute back — any element in the served DOM can carry an attacker-authored
 * `data-t3-props`, exactly like `data-dc-source`.
 */

/** Stamped beside COMPONENT_NAME_ATTR by nativeSource.ts, and only ever alongside it —
 * the request renders props as `<Name> — props: ...`, so a props bag with no component
 * name has nowhere honest to appear. */
export const PROPS_ATTR = "data-t3-props";

export type DesignProps = Record<string, string | number | boolean>;

/** Caps twinned with DesignSourceResult.ts (flood control for a page-controlled object). */
export const MAX_PROPS = 12;
export const MAX_PROP_VALUE_LENGTH = 64;

/** JSX-attribute-shaped names only (identifier, plus the `-` of `data-*`/`aria-*`). */
const PROP_NAME_PATTERN = /^[A-Za-z_$][\w$-]{0,63}$/;

/** Unknown → validated primitive props, or null when nothing usable survives.
 * Entry-level skipping, not rejection — props are best-effort context. `children` is
 * excluded even when primitive (the request already carries `Text:`); strings are
 * control-character-rejected and sliced to the cap. */
export function readDesignProps(value: unknown): DesignProps | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: DesignProps = {};
  let count = 0;
  for (const [name, raw] of Object.entries(value)) {
    if (count >= MAX_PROPS) break;
    if (name === "children" || !PROP_NAME_PATTERN.test(name)) continue;
    if (typeof raw === "boolean") out[name] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) out[name] = raw;
    else if (typeof raw === "string") {
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(raw)) continue;
      out[name] = raw.slice(0, MAX_PROP_VALUE_LENGTH);
    } else continue;
    count += 1;
  }
  return count === 0 ? null : out;
}

/** The stamped attribute's value → validated props. JSON that does not parse, or parses
 * to anything but a usable bag, is null — the attribute is page-controlled either way. */
export function parsePropsAttr(attr: string | null): DesignProps | null {
  if (!attr) return null;
  try {
    return readDesignProps(JSON.parse(attr));
  } catch {
    return null;
  }
}

/** Validated props → the JSX vocabulary the agent will actually grep for:
 * `variant="ghost" count={3} disabled` (bare name for `true`, `={false}` for false).
 * JSON.stringify escapes quotes and would escape any control character, so a value can
 * never break out of its attribute — the caller still owns code-span hygiene for the
 * line it embeds this in (request.ts wraps it in backticks after sanitizeInline). */
export function formatDesignProps(props: DesignProps): string {
  return Object.entries(props)
    .map(([name, value]) => {
      if (value === true) return name;
      if (value === false) return `${name}={false}`;
      if (typeof value === "number") return `${name}={${value}}`;
      return `${name}=${JSON.stringify(value)}`;
    })
    .join(" ");
}
