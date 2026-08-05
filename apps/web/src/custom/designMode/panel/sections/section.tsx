/**
 * The pieces every panel section shares: what a section is handed, and the two small
 * controls more than one of them renders.
 *
 * Sections live in sibling modules (PR #57 review) so ForkDesignPanel stays store + bridge
 * wiring; this is the seam between them.
 */
import { useState } from "react";

import type { DesignModeElementSnapshot, DesignModeWritableKey } from "../../protocol";
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

const SIDES = [
  ["T", "top"],
  ["R", "right"],
  ["B", "bottom"],
  ["L", "left"],
] as const;

/** The four per-side scrubs of a box property — Padding and Margin share it, and the
 * next TRBL-shaped section is a one-liner instead of another 4-field clone block. */
export function SideFields({
  prefix,
  styles,
  apply,
  field,
  tokenBasePx,
  min,
}: {
  prefix: "padding" | "margin";
  styles: DesignModeElementSnapshot["styles"];
  apply: ApplyEdit;
  field: FieldStateFor;
  tokenBasePx: number | null;
  min?: number;
}) {
  const title = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  return SIDES.map(([label, side]) => {
    const key = `${prefix}-${side}` as const;
    return (
      <ScrubField
        key={key}
        label={label}
        title={`${title} ${side}`}
        tokenBasePx={tokenBasePx}
        value={styles[key]}
        {...(min !== undefined ? { min } : {})}
        {...field(key)}
        onEdit={(v) => apply(key, v)}
      />
    );
  });
}
