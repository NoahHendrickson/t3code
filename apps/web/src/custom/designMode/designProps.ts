/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The rendering component's primitive-props snapshot, on its way from the desktop
 * resolver into the change request: validation, the stamp attribute, and the JSX-shaped
 * inline rendering. Lives OUTSIDE engine/ (the cssOrigin.ts pattern) so it stays
 * unit-testable in apps/web's project while the engine island includes it by reference.
 *
 * Trust boundary: the props POLICY itself is shared — `normalizeForkDesignProps` in
 * @t3tools/shared/forkDesignProps, which the desktop resolver
 * (apps/desktop/src/preview/DesignSourceResult.ts) validates against too. What stays
 * duplicated is the CALL, not the rules: the validator runs TWICE per journey on purpose,
 * once on the resolver result (nativeSource.ts) and again when the request builder reads
 * the stamped attribute back — any element in the served DOM can carry an
 * attacker-authored `data-t3-props`, exactly like `data-dc-source`.
 */

import {
  type ForkDesignProps,
  MAX_DESIGN_PROP_VALUE_LENGTH,
  MAX_DESIGN_PROPS,
  normalizeForkDesignProps,
} from "@t3tools/shared/forkDesignProps";

/** Stamped beside COMPONENT_NAME_ATTR by nativeSource.ts, and only ever alongside it —
 * the request renders props as `<Name> — props: ...`, so a props bag with no component
 * name has nowhere honest to appear. */
export const PROPS_ATTR = "data-t3-props";

/** Local names for the shared props policy. */
export type DesignProps = ForkDesignProps;
export const MAX_PROPS = MAX_DESIGN_PROPS;
export const MAX_PROP_VALUE_LENGTH = MAX_DESIGN_PROP_VALUE_LENGTH;

/** Unknown → validated primitive props, or null when nothing usable survives. The rules
 * live in @t3tools/shared/forkDesignProps; this is the guest-side CALL of them. */
export const readDesignProps = normalizeForkDesignProps;

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
