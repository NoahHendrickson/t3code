/**
 * What the panel renders when MORE THAN ONE element is selected.
 *
 * The panel used to render `selection[0]` outright, which lies the moment a second element
 * disagrees: a multi-select of two differently-padded cards showed one card's padding as if
 * it were both. Figma's answer is "Mixed" — show no value, and let any edit unify them,
 * which is exactly what the existing fan-out write already does.
 *
 * Draft state is the other half: a property with a live draft on ANY selected element counts
 * as changed, so the field can mark itself and offer the per-property revert.
 */
import type { DesignModeElementSnapshot, DesignModeStyleKey } from "../protocol";

/** Draft/mixed state for one field, spread straight onto it: `{...field("width")}`. */
export interface FieldState {
  readonly mixed: boolean;
  readonly drafted: boolean;
  readonly onRevert: () => void;
}

export type FieldKeys = DesignModeStyleKey | readonly DesignModeStyleKey[];

const asList = (keys: FieldKeys): readonly DesignModeStyleKey[] =>
  typeof keys === "string" ? [keys] : keys;

/** True when the selection disagrees on any of these computed properties. */
export function isMixed(selection: readonly DesignModeElementSnapshot[], keys: FieldKeys): boolean {
  const first = selection[0];
  if (!first || selection.length < 2) return false;
  return asList(keys).some((key) =>
    selection.some((element) => element.styles[key] !== first.styles[key]),
  );
}

/** True when any selected element carries a draft for any of these properties. */
export function isDrafted(
  selection: readonly DesignModeElementSnapshot[],
  properties: readonly string[],
): boolean {
  return selection.some((element) =>
    properties.some((property) => element.drafted.includes(property)),
  );
}

/**
 * Builds the panel's per-field state helper.
 *
 * `read` names the computed properties the field DISPLAYS; `write` (when it differs) names
 * the properties it actually drafts — the gap field reads `row-gap` but writes the `gap`
 * shorthand, and reverting has to drop what was written, not what was shown.
 */
export function fieldStateFor(
  selection: readonly DesignModeElementSnapshot[],
  revert: (properties: readonly string[]) => void,
): (read: FieldKeys, write?: readonly string[]) => FieldState {
  return (read, write) => {
    const properties = write ?? asList(read);
    return {
      mixed: isMixed(selection, read),
      drafted: isDrafted(selection, properties),
      onRevert: () => revert(properties),
    };
  };
}

export type FieldStateFor = ReturnType<typeof fieldStateFor>;
