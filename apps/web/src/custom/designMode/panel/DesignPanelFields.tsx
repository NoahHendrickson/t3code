import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "~/lib/utils";

import type { DesignModeTokens } from "../designModeStore";
import { DesignColorPicker, rgbToHex } from "./DesignColorPicker";

/** Formats a number for display/writeback without float noise (12, 12.5 — never 12.50001). */
const formatNumber = (value: number, precision: number): string => {
  const factor = 10 ** precision;
  return String(Math.round(value * factor) / factor);
};

interface ScrubFieldProps {
  /** Short leading label ("W", "T", "Size") — also the scrub handle. */
  label: string;
  title: string;
  /** The computed CSS value ("16px", "auto", "1.5"). Non-numeric values display as-is
   * and scrub from 0. */
  value: string;
  /** Suffix written back to the guest; "none" writes the bare number (opacity). */
  unit?: "px" | "none";
  min?: number;
  max?: number;
  /** Value change per dragged pixel (Shift multiplies by 10). */
  step?: number;
  precision?: number;
  onEdit: (cssValue: string) => void;
}

/**
 * The panel's numeric control: type a value, or drag the label to scrub it — the native
 * counterpart of the Forge's NumberField. Every change fires `onEdit` immediately; the
 * guest engine coalesces repaints, so live scrubbing over the bridge stays smooth.
 */
export function ScrubField({
  label,
  title,
  value,
  unit = "px",
  min,
  max,
  step = 1,
  precision = 0,
  onEdit,
}: ScrubFieldProps) {
  const parsed = Number.parseFloat(value);
  const numeric = Number.isFinite(parsed) ? parsed : null;
  const [text, setText] = useState(numeric === null ? value : formatNumber(numeric, precision));
  const scrub = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);

  const clamp = useCallback(
    (v: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? -Infinity, v)),
    [max, min],
  );

  const commit = useCallback(
    (v: number) => {
      const next = clamp(v);
      const display = formatNumber(next, precision);
      setText(display);
      onEdit(unit === "px" ? `${display}px` : display);
    },
    [clamp, onEdit, precision, unit],
  );

  const onLabelPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: numeric ?? (Number.parseFloat(text) || 0),
    };
  };

  const onLabelPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const active = scrub.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    commit(active.startValue + dx * step * (event.shiftKey ? 10 : 1));
  };

  const onLabelPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (scrub.current?.pointerId === event.pointerId) scrub.current = null;
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const v = Number.parseFloat(text);
      if (Number.isFinite(v)) commit(v);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const base = Number.parseFloat(text);
      const start = Number.isFinite(base) ? base : 0;
      const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1) * step;
      commit(start + delta);
    }
  };

  return (
    <label className="flex h-6 items-center gap-1 rounded bg-muted/40" title={title}>
      <span
        className="w-7 shrink-0 cursor-ew-resize select-none ps-1.5 text-[10px] font-medium text-muted-foreground"
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        {label}
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onInputKeyDown}
        onBlur={() => {
          const v = Number.parseFloat(text);
          if (Number.isFinite(v)) commit(v);
        }}
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent pe-1.5 text-xs text-foreground outline-none"
      />
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  title: string;
  /** The computed CSS color (rgb/rgba). */
  value: string;
  /** Previewed app's theme tokens — shown as swatches inside the picker popover. */
  tokens?: DesignModeTokens | null;
  onEdit: (cssValue: string) => void;
}

/** Swatch (opens the picker popover) + hex pair. Fully-transparent computed values
 * display as "transparent" until a color is picked. */
export function ColorField({ label, title, value, tokens, onEdit }: ColorFieldProps) {
  const isTransparent = /^rgba\(\d+,\s*\d+,\s*\d+,\s*0\)$/u.test(value.trim());
  const hex = rgbToHex(value);
  const [text, setText] = useState(isTransparent ? "transparent" : (hex ?? value));

  const commit = useCallback(
    (next: string) => {
      setText(next);
      onEdit(next);
    },
    [onEdit],
  );

  return (
    <label className="flex h-6 items-center gap-1 rounded bg-muted/40" title={title}>
      <span className="w-7 shrink-0 select-none ps-1.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      <DesignColorPicker
        value={value}
        tokens={tokens ?? null}
        onPick={commit}
        triggerAriaLabel={`${title} swatch`}
      />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(text);
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (text && text !== (isTransparent ? "transparent" : (hex ?? value))) commit(text);
        }}
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent pe-1.5 text-xs text-foreground outline-none"
      />
    </label>
  );
}

export function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className={cn("grid gap-1", className)}>{children}</div>
    </section>
  );
}
