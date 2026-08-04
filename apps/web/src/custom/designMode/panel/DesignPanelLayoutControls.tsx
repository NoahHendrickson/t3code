import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

interface SegmentOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly title: string;
}

/** Compact segmented control — flex direction, wrap, text-align. */
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
    <div className={cn("flex h-6 items-center gap-0.5 rounded bg-muted/40 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value ? "true" : "false"}
          onClick={() => onSelect(option.value)}
          className={cn(
            "h-full flex-1 rounded-[3px] px-1 text-[10px] font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled native select in the panel's field chrome — display, border style, align-self. */
export function SelectRow({
  label,
  title,
  value,
  options,
  onSelect,
}: {
  label: string;
  title: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
}) {
  return (
    <label className="flex h-6 items-center gap-1 rounded bg-muted/40" title={title}>
      <span className="w-7 shrink-0 select-none ps-1.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      <select
        // defaultValue (uncontrolled) — the fields container remounts per selection
        // (keyed in ForkDesignPanel), matching the ScrubField reset model.
        defaultValue={options.includes(value) ? value : ""}
        onChange={(event) => onSelect(event.target.value)}
        className="h-full w-full min-w-0 appearance-none bg-transparent pe-1.5 text-xs text-foreground outline-none"
      >
        {!options.includes(value) ? <option value="">{value || "—"}</option> : null}
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
      className="grid size-[66px] grid-cols-3 grid-rows-3 gap-0.5 rounded bg-muted/40 p-1"
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
              className="group flex items-center justify-center rounded-[3px] hover:bg-background/60"
            >
              <span
                className={cn(
                  "rounded-full transition-all",
                  active
                    ? "size-2 bg-primary"
                    : "size-1.5 bg-muted-foreground/40 group-hover:bg-muted-foreground/70",
                )}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}
