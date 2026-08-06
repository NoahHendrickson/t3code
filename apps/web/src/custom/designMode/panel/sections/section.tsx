/**
 * The pieces every panel section shares: what a section is handed, and the two small
 * controls more than one of them renders.
 *
 * Sections live in sibling modules (PR #57 review) so ForkDesignPanel stays store + bridge
 * wiring; this is the seam between them.
 */
import { useState } from "react";

import type {
  DesignModeElementSnapshot,
  DesignModeStyleKey,
  DesignModeWritableKey,
} from "../../protocol";
import { ScrubField } from "../DesignPanelFields";
import type { FieldStateFor } from "../selectionValues";

export type ApplyEdit = (property: DesignModeWritableKey, value: string) => void;

export interface SectionProps {
  /** The first selected element — the values every field displays. */
  element: DesignModeElementSnapshot;
  /** The whole selection: toggles light only when every element agrees, and a control with
   * no "mixed" rendering of its own (the align matrix, a segment strip) goes blank instead
   * of claiming the first element's state for all of them. */
  selection: readonly DesignModeElementSnapshot[];
  apply: ApplyEdit;
  spacingBase: number | null;
  /** Mixed/changed state per field — see panel/selectionValues.ts. */
  field: FieldStateFor;
}

export const isFlexDisplay = (display: string): boolean =>
  display === "flex" || display === "inline-flex";

/** A disclosure INSIDE a section grid — the fork keeps every control the panel ever had
 * (per-side spacing, min/max sizing, the raw display select), and this is where the ones
 * Figma doesn't show by default live. Spans the whole section grid, whatever its columns. */
export function Expando({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open ? "true" : "false"}
        className="col-span-full flex h-4 items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <span className="font-mono">{open ? "−" : "+"}</span>
        {label}
      </button>
      {open ? children : null}
    </>
  );
}

const SIDE_LABELS: Record<string, string> = { top: "T", right: "R", bottom: "B", left: "L" };

/** The side a TRBL-shaped property names: `padding-top` and `border-top-width` both say
 * "top", so one component can serve every block of four. */
const sideOf = (key: string): string => /(top|right|bottom|left)/u.exec(key)?.[1] ?? key;

/**
 * The four per-side scrubs of a box property. Padding, margin and stroke width all take it:
 * the keys carry the sides, so a TRBL-shaped section really is a one-liner rather than
 * another zip-two-parallel-arrays block (PR #57 review).
 */
export function SideFields({
  keys,
  title,
  styles,
  apply,
  field,
  tokenBasePx,
  min,
}: {
  keys: readonly DesignModeStyleKey[];
  /** Reads the field's tooltip from the side ("Padding top", "Border top width"). */
  title: (side: string) => string;
  styles: DesignModeElementSnapshot["styles"];
  apply: ApplyEdit;
  field: FieldStateFor;
  tokenBasePx?: number | null;
  min?: number;
}) {
  return keys.map((key) => {
    const side = sideOf(key);
    return (
      <ScrubField
        key={key}
        label={SIDE_LABELS[side] ?? side}
        title={title(side)}
        {...(tokenBasePx !== undefined ? { tokenBasePx } : {})}
        value={styles[key]}
        {...(min !== undefined ? { min } : {})}
        {...field(key)}
        onEdit={(v) => apply(key, v)}
      />
    );
  });
}

/** The TRBL key sets the panel edits, spelled once. */
export const PADDING_KEYS = [
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
] as const;

export const MARGIN_KEYS = ["margin-top", "margin-right", "margin-bottom", "margin-left"] as const;

export const BORDER_WIDTH_KEYS = [
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
] as const;
