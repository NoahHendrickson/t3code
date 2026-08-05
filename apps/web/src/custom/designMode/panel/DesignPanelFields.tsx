import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

import type { DesignModeTokens } from "../designModeStore";
import { DesignColorPicker, rgbToHex } from "./DesignColorPicker";

/** Tailwind's canonical numeric spacing ladder — token pickers offer these steps and the
 * badge lights up when a value sits exactly on one (utility = step × --spacing base). */
const TAILWIND_SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44,
  48, 52, 56, 60, 64, 72, 80, 96,
] as const;

/** The spacing step a px value sits on, or null when off-scale. */
function spacingStepFor(px: number, basePx: number): number | null {
  const step = px / basePx;
  const match = TAILWIND_SPACING_STEPS.find((candidate) => Math.abs(candidate - step) < 0.001);
  return match ?? null;
}

/** Formats a number for display/writeback without float noise (12, 12.5 — never 12.50001). */
const formatNumber = (value: number, precision: number): string => {
  const factor = 10 ** precision;
  return String(Math.round(value * factor) / factor);
};

interface ScrubFieldProps {
  /** Short leading label ("W", "T", "Size") — also the scrub handle. */
  label: string;
  /** Optional icon rendered in the prefix cell instead of the text label (the label
   * stays as the accessible name and scrub handle either way). */
  icon?: React.ReactNode;
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
  /** The previewed app's --spacing base (px). Enables the Tailwind step badge and the
   * scale-ladder picker on spacing-shaped fields. */
  tokenBasePx?: number | null;
  onEdit: (cssValue: string) => void;
}

/**
 * The panel's numeric control: type a value, or drag the label to scrub it — the native
 * counterpart of the Forge's NumberField. Every change fires `onEdit` immediately; the
 * guest engine coalesces repaints, so live scrubbing over the bridge stays smooth.
 */
export function ScrubField({
  label,
  icon,
  title,
  value,
  unit = "px",
  min,
  max,
  step = 1,
  precision = 0,
  tokenBasePx,
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
    <label
      className="flex h-6 items-center overflow-hidden rounded bg-[var(--fork-design-field)]"
      title={title}
    >
      <span
        aria-label={label}
        className="flex size-6 shrink-0 cursor-ew-resize select-none items-center justify-center text-xs text-muted-foreground/70 [&_svg]:size-4"
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        {icon ?? label}
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
        className="h-full w-full min-w-0 bg-transparent text-xs text-foreground outline-none"
      />
      {tokenBasePx != null && tokenBasePx > 0 && unit === "px" ? (
        <SpacingTokenAffordance
          basePx={tokenBasePx}
          currentPx={Number.parseFloat(text)}
          onPickStep={(scaleStep) => commit(scaleStep * tokenBasePx)}
        />
      ) : null}
    </label>
  );
}

interface PairFieldProps {
  /** Accessible name and scrub handle when no icon is given. */
  label: string;
  icon?: React.ReactNode;
  title: string;
  /** Computed CSS for the pair, in write order (e.g. [padding-left, padding-right]). */
  values: readonly [string, string];
  min?: number;
  tokenBasePx?: number | null;
  /** Writes both halves. A single typed value lands on both. */
  onEdit: (first: string, second: string) => void;
}

/** Renders a value pair the Figma way: "8" while both halves agree, "8, 16" when split. */
function formatPair(first: number, second: number): string {
  return first === second ? String(first) : `${first}, ${second}`;
}

/**
 * The paired spacing control from the Figma design — one field drives two longhand
 * properties (left/right or top/bottom padding). Typing "8" sets both; "8, 16" splits
 * them (first value = left/top). Scrubbing the prefix cell moves BOTH halves by the
 * drag delta, preserving an asymmetric split instead of collapsing it.
 */
export function PairField({
  label,
  icon,
  title,
  values,
  min,
  tokenBasePx,
  onEdit,
}: PairFieldProps) {
  const parse = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const current: [number, number] = [parse(values[0]), parse(values[1])];
  const [text, setText] = useState(formatPair(current[0], current[1]));
  const scrub = useRef<{ pointerId: number; startX: number; start: [number, number] } | null>(null);

  const clamp = useCallback(
    (v: number) => Math.max(min ?? Number.NEGATIVE_INFINITY, Math.round(v)),
    [min],
  );

  const commit = useCallback(
    (first: number, second: number) => {
      const a = clamp(first);
      const b = clamp(second);
      setText(formatPair(a, b));
      onEdit(`${a}px`, `${b}px`);
    },
    [clamp, onEdit],
  );

  /** "8" → both; "8, 16" (or "8 16") → first/second; anything unparsable reverts. */
  const commitText = useCallback(() => {
    const numbers = text
      .split(/[,\s]+/u)
      .filter(Boolean)
      .map((part) => Number.parseFloat(part))
      .filter((value) => Number.isFinite(value));
    if (numbers.length === 0) {
      setText(formatPair(current[0], current[1]));
      return;
    }
    commit(numbers[0]!, numbers[1] ?? numbers[0]!);
  }, [commit, current, text]);

  const onLabelPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { pointerId: event.pointerId, startX: event.clientX, start: current };
  };

  const onLabelPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const active = scrub.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = (event.clientX - active.startX) * (event.shiftKey ? 10 : 1);
    commit(active.start[0] + dx, active.start[1] + dx);
  };

  const onLabelPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (scrub.current?.pointerId === event.pointerId) scrub.current = null;
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitText();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
      commit(current[0] + delta, current[1] + delta);
    }
  };

  return (
    <label
      className="flex h-6 items-center overflow-hidden rounded bg-[var(--fork-design-field)]"
      title={title}
    >
      <span
        aria-label={label}
        className="flex size-6 shrink-0 cursor-ew-resize select-none items-center justify-center text-xs text-muted-foreground/70 [&_svg]:size-4"
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        {icon ?? label}
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onInputKeyDown}
        onBlur={commitText}
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent text-xs text-foreground outline-none"
      />
      {tokenBasePx != null && tokenBasePx > 0 ? (
        <SpacingTokenAffordance
          basePx={tokenBasePx}
          // Asymmetric pairs read as off-scale (NaN never matches a step); picking from
          // the ladder collapses the pair onto the chosen step, like typing one value.
          currentPx={current[0] === current[1] ? current[0] : Number.NaN}
          onPickStep={(scaleStep) => commit(scaleStep * tokenBasePx, scaleStep * tokenBasePx)}
        />
      ) : null}
    </label>
  );
}

/** The token half of a spacing field: a badge with the matching Tailwind step (lit when
 * the value sits exactly on the scale) that opens the scale-ladder picker. */
function SpacingTokenAffordance({
  basePx,
  currentPx,
  onPickStep,
}: {
  basePx: number;
  currentPx: number;
  onPickStep: (step: number) => void;
}) {
  const matched = Number.isFinite(currentPx) ? spacingStepFor(currentPx, basePx) : null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={
              matched !== null
                ? `On the spacing scale: ${matched} (${currentPx}px) — click for the ladder`
                : "Pick from the spacing scale"
            }
            className={cn(
              "me-1 shrink-0 rounded-[3px] px-1 font-mono text-[9px] leading-4 transition-colors",
              matched !== null
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground/50 hover:text-foreground",
            )}
          >
            {matched !== null ? matched : "{ }"}
          </button>
        }
      />
      <PopoverPopup className="w-32 p-1" data-fork-design-token-ladder>
        <div className="max-h-48 overflow-y-auto">
          {TAILWIND_SPACING_STEPS.map((scaleStep) => (
            <button
              key={scaleStep}
              type="button"
              onClick={() => onPickStep(scaleStep)}
              className={cn(
                "flex w-full items-center justify-between rounded px-1.5 py-0.5 text-xs",
                scaleStep === matched
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="font-mono">{scaleStep}</span>
              <span className="text-[10px] text-muted-foreground/70">{scaleStep * basePx}px</span>
            </button>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
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
    <label
      className="flex h-6 items-center gap-1 overflow-hidden rounded bg-[var(--fork-design-field)]"
      title={title}
    >
      <span className="flex size-6 shrink-0 select-none items-center justify-center text-xs text-muted-foreground/70">
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
  action,
  children,
  className,
}: {
  title: string;
  /** Optional header-right accessory (the Figma layouts hang toggles there). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-5 items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className={cn("grid gap-2", className)}>{children}</div>
    </section>
  );
}
