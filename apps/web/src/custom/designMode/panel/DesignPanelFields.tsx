import { ChevronDownIcon } from "lucide-react";
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
  /** Optional trailing control docked at the field's right edge (the W/H size-mode menu). */
  suffix?: React.ReactNode;
  /** Read-only display — the value is real but this element can't take an edit right now
   * (an in-flow element's X/Y). Scrub and typing are both inert, and the field greys out
   * rather than disappearing, so the reading stays available. */
  readOnly?: boolean;
  onEdit: (cssValue: string) => void;
}

/** Preserve in-progress typing until a fresh snapshot changes the displayed element value. */
function useSyncedDraftText(display: string) {
  const [text, setText] = useState(display);
  const [lastDisplay, setLastDisplay] = useState(display);
  if (display !== lastDisplay) {
    setLastDisplay(display);
    setText(display);
  }
  return [text, setText] as const;
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
  suffix,
  readOnly = false,
  onEdit,
}: ScrubFieldProps) {
  const parsed = Number.parseFloat(value);
  const numeric = Number.isFinite(parsed) ? parsed : null;
  const display = numeric === null ? value : formatNumber(numeric, precision);
  const [text, setText] = useSyncedDraftText(display);
  // The guest re-emits snapshots for the SAME selection (a size-mode pick, Discard all, a
  // draft-sync flush), and the fields container is keyed by selection identity — so nothing
  // remounts and the field would keep showing a number the element no longer has, then
  // scrub/arrow from that stale base (PR #54/#55 review). Re-sync on the incoming DISPLAY
  // value, not on `text`: a half-typed entry is only replaced when the element actually
  // changed under it.
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
    if (readOnly) return;
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
        className={cn(
          "flex h-6 min-w-6 shrink-0 select-none items-center justify-center px-1 text-xs text-muted-foreground/70 [&_svg]:size-4",
          readOnly ? "cursor-default" : "cursor-ew-resize",
        )}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        {/* sr-only beside an icon (not aria-label on the span) so the wrapping label's
            accessible name comes from plain text content, not accname recursion. */}
        {icon ? <span className="sr-only">{label}</span> : null}
        {icon ?? label}
      </span>
      <input
        value={text}
        readOnly={readOnly}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={readOnly ? undefined : onInputKeyDown}
        onBlur={() => {
          if (readOnly) return;
          const v = Number.parseFloat(text);
          if (Number.isFinite(v)) commit(v);
        }}
        spellCheck={false}
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-xs outline-none",
          readOnly ? "text-muted-foreground/60" : "text-foreground",
        )}
      />
      {!readOnly && tokenBasePx != null && tokenBasePx > 0 && unit === "px" ? (
        <SpacingTokenAffordance
          basePx={tokenBasePx}
          currentPx={Number.parseFloat(text)}
          onPickStep={(scaleStep) => commit(scaleStep * tokenBasePx)}
        />
      ) : null}
      {suffix}
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
  const display = formatPair(current[0], current[1]);
  const [text, setText] = useSyncedDraftText(display);
  // Same prop re-sync ScrubField documents — the pair goes stale on exactly the same paths.
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
        className="flex h-6 min-w-6 shrink-0 cursor-ew-resize select-none items-center justify-center px-1 text-xs text-muted-foreground/70 [&_svg]:size-4"
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        {icon ? <span className="sr-only">{label}</span> : null}
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
  /** Optional icon rendered in the prefix cell instead of the text label. */
  icon?: React.ReactNode;
  title: string;
  /** The computed CSS color (rgb/rgba). */
  value: string;
  /** Previewed app's theme tokens — shown as swatches inside the picker popover. */
  tokens?: DesignModeTokens | null;
  onEdit: (cssValue: string) => void;
}

/** Swatch (opens the picker popover) + hex pair. Fully-transparent computed values
 * display as "transparent" until a color is picked. */
export function ColorField({ label, icon, title, value, tokens, onEdit }: ColorFieldProps) {
  const isTransparent = /^rgba\(\d+,\s*\d+,\s*\d+,\s*0\)$/u.test(value.trim());
  const hex = rgbToHex(value);
  const display = isTransparent ? "transparent" : (hex ?? value);
  const [text, setText] = useSyncedDraftText(display);

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
      <span className="flex h-6 min-w-6 shrink-0 select-none items-center justify-center px-1 text-xs text-muted-foreground/70 [&_svg]:size-4">
        {icon ? <span className="sr-only">{label}</span> : null}
        {icon ?? label}
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
          if (text && text !== display) commit(text);
        }}
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent pe-1.5 text-xs text-foreground outline-none"
      />
    </label>
  );
}

/**
 * A read-only reading in the panel's field chrome — a property the designer needs to SEE to
 * work (the current typeface) but that this tool has no honest way to set: swapping a font
 * family is a code change, not an inline-style preview.
 */
export function ValueRow({
  label,
  title,
  value,
  className,
}: {
  label: string;
  title: string;
  value: string;
  className?: string;
}) {
  // Computed font-family stacks are long and quoted; the first family is the real answer.
  const display = value.split(",")[0]?.replace(/["']/gu, "").trim() ?? value;
  return (
    <div
      className={cn(
        "flex h-6 items-center overflow-hidden rounded bg-[var(--fork-design-field)]",
        className,
      )}
      title={`${title}: ${value}`}
    >
      <span className="flex h-6 min-w-6 shrink-0 select-none items-center justify-center px-1 text-xs text-muted-foreground/70">
        {label}
      </span>
      <span className="truncate pe-1.5 text-xs text-muted-foreground">{display || "—"}</span>
    </div>
  );
}

/**
 * The panel's square 24px toggle — the accent-lit button Figma hangs off section headers and
 * field rows (auto layout, absolute position, per-corner radius, aspect lock). One component
 * because the panel has four of them and they must light identically.
 */
export function PanelToggle({
  pressed,
  title,
  onClick,
  disabled,
  children,
}: {
  pressed: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed ? "true" : "false"}
      aria-label={title}
      title={title}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded transition-colors [&_svg]:size-4",
        disabled
          ? "text-muted-foreground/30"
          : pressed
            ? "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]"
            : "bg-[var(--fork-design-field)] text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One collapsible group of the properties panel. Collapsing is Figma's own affordance for a
 * panel this dense — and it is what lets the fork keep every control it had (margins, the raw
 * `display` select, per-side spacing) while the default view stays as short as the Figma spec.
 * Open state is per-mount: the fields container is keyed by selection identity, so a section
 * a user opened for one element does not leak its disclosure onto the next.
 */
export function PanelSection({
  title,
  action,
  children,
  className,
  defaultOpen = true,
}: {
  title: string;
  /** Optional header-right accessory (the Figma layouts hang toggles there). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2">
      <div className="flex min-h-6 items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open ? "true" : "false"}
          className="-ms-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDownIcon
            className={cn("size-3 transition-transform", open ? undefined : "-rotate-90")}
          />
          {title}
        </button>
        {open ? action : null}
      </div>
      {open ? <div className={cn("grid gap-2", className)}>{children}</div> : null}
    </section>
  );
}
