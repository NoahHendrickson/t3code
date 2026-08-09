/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The ONE primitive-props normalization policy for design mode, shared by the two
 * runtimes that sit on either side of the preview's page-shared global:
 *
 *   - the desktop preload's resolver (`apps/desktop/src/preview/DesignSourceResult.ts`),
 *     which reads props off a React fiber, and
 *   - the guest engine (`apps/web/src/custom/designMode/designProps.ts`), which reads the
 *     stamped `data-t3-props` attribute back off a page-controlled DOM node.
 *
 * It lives here because those are two different apps with two different bundlers and no
 * import path between them; `@t3tools/shared` is the only module graph both reach.
 *
 * What is shared is the POLICY, not the number of times it runs. Both boundaries still
 * call it independently, on purpose: the resolver cannot vouch for what the page later
 * writes into the attribute, and the engine cannot vouch for the fiber. Twinned
 * *predicates* elsewhere in this feature (`normalizeFilePath`/`readSourceFile`,
 * `normalizeComponentName`/`readComponentName`) stay duplicated — they are five-line
 * shapes where a copy is cheaper than a dependency. This is twenty lines of caps,
 * name-pattern and control-character rules, where the copies drift the first time one
 * side is "fixed".
 */

/** The rendering component's primitive props, snapshotted at resolution time. Strings,
 * numbers and booleans ONLY — the design-system vocabulary (`variant="ghost" size="sm"`)
 * is primitive-shaped, and the primitives-only rule is also what keeps functions,
 * elements, styles and refs from ever crossing the bridge. Context for the agent's
 * component-vs-one-off scope judgment, not an oracle: the snapshot can go stale with
 * state and that is fine. */
export type ForkDesignProps = Record<string, string | number | boolean>;

/** Caps are the flood control for a page-controlled object: a hostile (or just enormous)
 * props bag must not balloon the request text. */
export const MAX_DESIGN_PROPS = 12;
export const MAX_DESIGN_PROP_VALUE_LENGTH = 64;

/** JSX-attribute-shaped names only (identifier, plus the `-` that `data-*`/`aria-*`
 * carry). Same posture as the component-name pattern: the name lands in the agent's
 * request text. */
const PROP_NAME_PATTERN = /^[A-Za-z_$][\w$-]{0,63}$/;

/**
 * Validates an unknown value into the primitive props snapshot, or null when nothing
 * usable survives. Non-conforming ENTRIES are skipped, not fatal — props are best-effort
 * context, unlike the source location, where a wrong value poisons the request.
 * `children` is excluded even when primitive: the element's own text already rides the
 * request as `Text:`. String values are control-character-rejected (the request-injection
 * threat model every page-controlled string here shares) and sliced to the cap.
 */
export function normalizeForkDesignProps(value: unknown): ForkDesignProps | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: ForkDesignProps = {};
  let count = 0;
  for (const [name, raw] of Object.entries(value)) {
    if (count >= MAX_DESIGN_PROPS) break;
    if (name === "children" || !PROP_NAME_PATTERN.test(name)) continue;
    if (typeof raw === "boolean") out[name] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) out[name] = raw;
    else if (typeof raw === "string") {
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(raw)) continue;
      out[name] = raw.slice(0, MAX_DESIGN_PROP_VALUE_LENGTH);
    } else continue;
    count += 1;
  }
  return count === 0 ? null : out;
}
