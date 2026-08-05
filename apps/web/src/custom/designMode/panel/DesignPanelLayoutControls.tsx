import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import type { DesignModeAlignAxis, DesignModeAlignCaps, DesignModeAlignValue } from "../protocol";
import {
  AlignHCenterIcon,
  AlignHEndIcon,
  AlignHStartIcon,
  AlignVCenterIcon,
  AlignVEndIcon,
  AlignVStartIcon,
} from "./PanelIcons";

interface SegmentOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly title: string;
}

/** Compact segmented control — flex direction, wrap, text-align. Figma's tab strip:
 * a field-surface track whose selected segment lifts on a white/8% fill with a
 * hairline border (see the design tokens in theme.custom.css). */
export function SegmentField({
  options,
  value,
  onSelect,
  className,
}: {
  options: readonly SegmentOption[];
  value: string;
  onSelect: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-6 items-center rounded bg-[var(--fork-design-field)]", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value ? "true" : "false"}
          onClick={() => onSelect(option.value)}
          className={cn(
            "flex h-full flex-1 items-center justify-center rounded px-1 text-xs transition-colors [&_svg]:size-4",
            value === option.value
              ? "border border-border bg-[var(--fork-design-selected)] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const ALIGN_BUTTONS: ReadonlyArray<{
  axis: DesignModeAlignAxis;
  value: DesignModeAlignValue;
  title: string;
  Icon: (props: { className?: string }) => ReactNode;
}> = [
  { axis: "horizontal", value: "start", title: "Align left", Icon: AlignHStartIcon },
  {
    axis: "horizontal",
    value: "center",
    title: "Align horizontal centers",
    Icon: AlignHCenterIcon,
  },
  { axis: "horizontal", value: "end", title: "Align right", Icon: AlignHEndIcon },
  { axis: "vertical", value: "start", title: "Align top", Icon: AlignVStartIcon },
  { axis: "vertical", value: "center", title: "Align vertical centers", Icon: AlignVCenterIcon },
  { axis: "vertical", value: "end", title: "Align bottom", Icon: AlignVEndIcon },
];

/**
 * Figma's align row: two groups of three, horizontal then vertical. These are VERBS, not
 * state — CSS has no single property they read back from — so no button ever lights up.
 * An axis the element can't honor (engine/align.ts's caps: no vertical answer for a block
 * child, no main axis for an auto-layout child, exactly as Figma disables them) greys out
 * with the reason in its tooltip instead of writing something inert.
 */
export function AlignRow({
  caps,
  onAlign,
}: {
  caps: DesignModeAlignCaps;
  onAlign: (axis: DesignModeAlignAxis, value: DesignModeAlignValue) => void;
}) {
  const reason = "No alignment on this axis — the element's parent lays it out";
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2" role="group" aria-label="Align in parent">
      {(["horizontal", "vertical"] as const).map((axis) => {
        const enabled = axis === "horizontal" ? caps.horizontal : caps.vertical;
        return (
          <div key={axis} className="flex h-6 items-center rounded bg-[var(--fork-design-field)]">
            {ALIGN_BUTTONS.filter((button) => button.axis === axis).map(
              ({ value, title, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={!enabled}
                  title={enabled ? title : reason}
                  aria-label={title}
                  onClick={() => onAlign(axis, value)}
                  className={cn(
                    "flex h-full flex-1 items-center justify-center rounded transition-colors [&_svg]:size-4",
                    enabled
                      ? "text-muted-foreground hover:bg-[var(--fork-design-selected)] hover:text-foreground"
                      : "text-muted-foreground/30",
                  )}
                >
                  <Icon />
                </button>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Labelled native select in the panel's field chrome — display, border style, align-self,
 * font weight. `optionValue` lets an option read as design vocabulary while committing CSS
 * ("500 Medium" → `500`); without it the option IS the value. */
export function SelectRow({
  label,
  icon,
  title,
  value,
  options,
  optionValue,
  onSelect,
}: {
  label: string;
  icon?: ReactNode;
  title: string;
  value: string;
  options: readonly string[];
  optionValue?: (option: string) => string;
  onSelect: (value: string) => void;
}) {
  const valueOf = optionValue ?? ((option: string) => option);
  const selected = options.find((option) => valueOf(option) === value);
  return (
    <label
      className="flex h-6 items-center overflow-hidden rounded bg-[var(--fork-design-field)]"
      title={title}
    >
      <span className="flex h-6 min-w-6 shrink-0 select-none items-center justify-center px-1 text-xs text-muted-foreground/70 [&_svg]:size-4">
        {icon ? <span className="sr-only">{label}</span> : null}
        {icon ?? label}
      </span>
      <select
        // Controlled, NOT defaultValue: the guest re-emits snapshots for the same selection
        // (Discard all, the draft-sync flush, the Layout header's auto-layout toggle) and
        // the fields container is keyed by selection identity, so an uncontrolled select
        // kept showing a value the element no longer had (PR #50/#52 review).
        value={selected ?? ""}
        onChange={(event) => onSelect(valueOf(event.target.value))}
        className="h-full w-full min-w-0 appearance-none bg-transparent pe-1.5 text-xs text-foreground outline-none"
      >
        {selected === undefined ? <option value="">{value || "—"}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const AXIS_VALUES = ["flex-start", "center", "flex-end"] as const;

const normalizeAxisValue = (value: string): string => {
  if (value === "start" || value === "normal") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
};

/**
 * The 9-dot alignment matrix — Figma's auto-layout alignment control. Direction-aware:
 * for a row the x axis is justify-content and the y axis is align-items; a column
 * transposes them. Distribution values (space-between …) select no dot; clicking a dot
 * writes plain start/center/end alignment.
 */
export function AlignMatrix({
  direction,
  justifyContent,
  alignItems,
  onChange,
}: {
  direction: "row" | "column";
  justifyContent: string;
  alignItems: string;
  onChange: (justifyContent: string, alignItems: string) => void;
}) {
  const justify = normalizeAxisValue(justifyContent);
  const align = normalizeAxisValue(alignItems);
  return (
    <div
      className="grid grid-cols-3 grid-rows-3 rounded bg-[var(--fork-design-field)]"
      role="group"
      aria-label="Alignment"
    >
      {AXIS_VALUES.flatMap((yValue) =>
        AXIS_VALUES.map((xValue) => {
          const cellJustify = direction === "row" ? xValue : yValue;
          const cellAlign = direction === "row" ? yValue : xValue;
          const active = justify === cellJustify && align === cellAlign;
          return (
            <button
              key={`${xValue}:${yValue}`}
              type="button"
              title={`justify ${cellJustify} · align ${cellAlign}`}
              aria-pressed={active ? "true" : "false"}
              onClick={() => onChange(cellJustify, cellAlign)}
              className="group flex size-6 items-center justify-center rounded"
            >
              <span
                className={cn(
                  "size-1 rounded-full transition-all",
                  active
                    ? "bg-[var(--fork-design-accent)] shadow-[0_0_6px_1px_var(--fork-design-accent-bg),0_0_2px_var(--fork-design-accent)]"
                    : "bg-muted-foreground/40 group-hover:bg-muted-foreground/70",
                )}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}
