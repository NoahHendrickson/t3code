// oxlint-disable t3code/no-native-title-tooltip -- Vendored design-mode island (see .fork/customizations.yaml#fork-design-mode); native titles kept to stay close to the Forge source.
import { ChevronDownIcon } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

import type { DesignModeTokens } from "../designModeStore";
import { DesignColorPicker, rgbToHex } from "./DesignColorPicker";
import { evaluateNumericInput } from "./numericExpression";

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

/** The changed marker Figma puts on an overridden property, doubling as its reset: a dot in
 * the field's trailing edge that reverts just this property to the page's own value. */
function FieldRevert({ onRevert }: { onRevert: () => void }) {
  return (
    <button
      type="button"
      title="Revert this property to the page's own value"
      aria-label="Revert this property"
      onClick={(event) => {
        // Inside a <label>: without this the click also focuses the input behind it.
        event.preventDefault();
        onRevert();
      }}
      className="flex size-4 shrink-0 items-center justify-center"
    >
      <span className="size-1.5 rounded-full bg-[var(--fork-design-accent)]" />
    </button>
  );
}

interface NumericChromeProps {
  /** Short leading label ("W", "Size") — also the scrub handle, and the accessible name
   * when an icon takes the prefix cell. */
  label: string;
  icon?: React.ReactNode;
  title: string;
  /** In-progress entry, owned by the field (which knows how to parse it). */
  text: string;
  onTextChange: (value: string) => void;
  /** What the element actually has — a blur that didn't change it costs nothing. */
  display: string;
  mixed?: boolean;
  readOnly?: boolean;
  drafted?: boolean;
  onRevert?: () => void;
  /** Trailing controls: the spacing-token badge, then anything field-specific. */
  token?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Scrubbing: the chrome owns pointer capture and reports deltas; what a delta MEANS is
   * the field's business (one value, or both halves of a pair). */
  onScrubStart: () => void;
  onScrubMove: (dx: number, shiftKey: boolean) => void;
  onCommit: () => void;
  onArrow: (direction: 1 | -1, shiftKey: boolean) => void;
}

/**
 * The shell every numeric field in the panel wears: prefix cell doubling as the scrub
 * handle, the input, the changed dot, the token badge, and Enter/blur/arrow plumbing.
 *
 * Extracted because ScrubField and PairField had grown two copies of all of it and this PR
 * would have thickened both (PR #57 review). What legitimately differs between them is the
 * commit strategy — one value versus two — and that is exactly what stays in the fields.
 */
function NumericFieldChrome({
  label,
  icon,
  title,
  text,
  onTextChange,
  display,
  mixed = false,
  readOnly = false,
  drafted = false,
  onRevert,
  token,
  suffix,
  onScrubStart,
  onScrubMove,
  onCommit,
  onArrow,
}: NumericChromeProps) {
  const scrub = useRef<{ pointerId: number; startX: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (readOnly) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { pointerId: event.pointerId, startX: event.clientX };
    onScrubStart();
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const active = scrub.current;
    if (!active || active.pointerId !== event.pointerId) return;
    onScrubMove(event.clientX - active.startX, event.shiftKey);
  };

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (scrub.current?.pointerId === event.pointerId) scrub.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onCommit();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onArrow(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* sr-only beside an icon (not aria-label on the span) so the wrapping label's
            accessible name comes from plain text content, not accname recursion. */}
        {icon ? <span className="sr-only">{label}</span> : null}
        {icon ?? label}
      </span>
      <input
        value={text}
        readOnly={readOnly}
        placeholder={mixed ? "Mixed" : undefined}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={readOnly ? undefined : onKeyDown}
        onBlur={() => {
          if (readOnly || text === display) return;
          onCommit();
        }}
        spellCheck={false}
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50",
          readOnly ? "text-muted-foreground/60" : "text-foreground",
        )}
      />
      {drafted && onRevert ? <FieldRevert onRevert={onRevert} /> : null}
      {readOnly ? null : token}
      {suffix}
    </label>
  );
}

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
  /** The selected elements disagree on this property (Figma's "Mixed"). The field shows no
   * value; any edit unifies them, which is exactly what typing into Figma's mixed field does. */
  mixed?: boolean;
  /** CSS keywords this field accepts verbatim instead of parsing as a number ("auto" on
   * W/H and line-height). Typed keywords ship as intent — never a measured px. */
  keywords?: readonly string[];
  /** Draft state for the property (or properties) this field writes — see FieldRevert. */
  drafted?: boolean;
  onRevert?: () => void;
  onEdit: (cssValue: string) => void;
}

/**
 * The panel's numeric control: type a value (or an expression), or drag the label to scrub
 * it — the native counterpart of the Forge's NumberField. Every change fires `onEdit`
 * immediately; the guest engine coalesces repaints, so live scrubbing over the bridge stays
 * smooth.
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
  mixed = false,
  keywords,
  drafted = false,
  onRevert,
  onEdit,
}: ScrubFieldProps) {
  const parsed = Number.parseFloat(value);
  const numeric = Number.isFinite(parsed) ? parsed : null;
  const display = mixed ? "" : numeric === null ? value : formatNumber(numeric, precision);
  // The guest re-emits snapshots for the SAME selection (a size-mode pick, Discard all, a
  // draft-sync flush), and the fields container is keyed by selection identity — so nothing
  // remounts and the field would keep showing a number the element no longer has, then
  // scrub/arrow from that stale base (PR #54/#55 review). Re-sync on the incoming DISPLAY
  // value, not on `text`: a half-typed entry is only replaced when the element actually
  // changed under it.
  const [text, setText] = useSyncedDraftText(display);
  const scrubBase = useRef(0);

  const clamp = useCallback(
    (v: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? -Infinity, v)),
    [max, min],
  );

  const commit = useCallback(
    (v: number) => {
      const next = clamp(v);
      const committed = formatNumber(next, precision);
      setText(committed);
      onEdit(unit === "px" ? `${committed}px` : committed);
    },
    [clamp, onEdit, precision, setText, unit],
  );

  /** Enter/blur commit: a listed keyword ships verbatim, anything else goes through the
   * expression evaluator (so `100/2` and `*2` work), and an entry that resolves to neither
   * snaps the field back to what the element actually has rather than committing a guess. */
  const commitText = useCallback(() => {
    const entry = text.trim();
    const keyword = keywords?.find((candidate) => candidate === entry.toLowerCase());
    if (keyword) {
      setText(keyword);
      onEdit(keyword);
      return;
    }
    const evaluated = evaluateNumericInput(entry, numeric ?? 0);
    if (evaluated === null) {
      setText(display);
      return;
    }
    commit(evaluated);
  }, [commit, display, keywords, numeric, onEdit, setText, text]);

  return (
    <NumericFieldChrome
      label={label}
      {...(icon !== undefined ? { icon } : {})}
      title={title}
      text={text}
      onTextChange={setText}
      display={display}
      mixed={mixed}
      readOnly={readOnly}
      drafted={drafted}
      {...(onRevert ? { onRevert } : {})}
      {...(suffix !== undefined ? { suffix } : {})}
      token={
        tokenBasePx != null && tokenBasePx > 0 && unit === "px" ? (
          <SpacingTokenAffordance
            basePx={tokenBasePx}
            currentPx={Number.parseFloat(text)}
            onPickStep={(scaleStep) => commit(scaleStep * tokenBasePx)}
          />
        ) : null
      }
      onScrubStart={() => {
        scrubBase.current = numeric ?? (Number.parseFloat(text) || 0);
      }}
      onScrubMove={(dx, shiftKey) => commit(scrubBase.current + dx * step * (shiftKey ? 10 : 1))}
      onCommit={commitText}
      onArrow={(direction, shiftKey) => {
        const base = Number.parseFloat(text);
        const start = Number.isFinite(base) ? base : (numeric ?? 0);
        commit(start + direction * (shiftKey ? 10 : 1) * step);
      }}
    />
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
  /** The selected elements disagree — see ScrubField's own `mixed`. */
  mixed?: boolean;
  drafted?: boolean;
  onRevert?: () => void;
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
  mixed = false,
  drafted = false,
  onRevert,
  onEdit,
}: PairFieldProps) {
  const parse = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const current: [number, number] = [parse(values[0]), parse(values[1])];
  const display = mixed ? "" : formatPair(current[0], current[1]);
  // Same prop re-sync ScrubField documents — the pair goes stale on exactly the same paths.
  const [text, setText] = useSyncedDraftText(display);
  const scrubBase = useRef<[number, number]>([0, 0]);

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
    [clamp, onEdit, setText],
  );

  /** "8" → both halves; "8, 16" → first/second, comma-separated because spaces are legal
   * INSIDE an expression. Each half takes the same arithmetic ScrubField does ("100/2"),
   * evaluated against that half's own current value. A third value, or a half that resolves
   * to nothing, reverts the whole entry — committing the first two of three silently drops
   * what the user typed (PR #57 review). */
  const commitText = useCallback(() => {
    const parts = text.split(",").filter((part) => part.trim() !== "");
    const numbers = parts
      .map((part, index) => evaluateNumericInput(part, current[index === 0 ? 0 : 1]))
      .filter((value): value is number => value !== null);
    if (parts.length > 2 || numbers.length === 0 || numbers.length !== parts.length) {
      setText(display);
      return;
    }
    commit(numbers[0]!, numbers[1] ?? numbers[0]!);
  }, [commit, current, display, setText, text]);

  return (
    <NumericFieldChrome
      label={label}
      {...(icon !== undefined ? { icon } : {})}
      title={title}
      text={text}
      onTextChange={setText}
      display={display}
      mixed={mixed}
      drafted={drafted}
      {...(onRevert ? { onRevert } : {})}
      token={
        tokenBasePx != null && tokenBasePx > 0 ? (
          <SpacingTokenAffordance
            basePx={tokenBasePx}
            // Asymmetric pairs read as off-scale (NaN never matches a step); picking from
            // the ladder collapses the pair onto the chosen step, like typing one value.
            currentPx={current[0] === current[1] ? current[0] : Number.NaN}
            onPickStep={(scaleStep) => commit(scaleStep * tokenBasePx, scaleStep * tokenBasePx)}
          />
        ) : null
      }
      onScrubStart={() => {
        scrubBase.current = current;
      }}
      onScrubMove={(dx, shiftKey) => {
        const delta = dx * (shiftKey ? 10 : 1);
        commit(scrubBase.current[0] + delta, scrubBase.current[1] + delta);
      }}
      onCommit={commitText}
      onArrow={(direction, shiftKey) => {
        const delta = direction * (shiftKey ? 10 : 1);
        commit(current[0] + delta, current[1] + delta);
      }}
    />
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
  /** The selected elements disagree — see ScrubField's own `mixed`. */
  mixed?: boolean;
  drafted?: boolean;
  onRevert?: () => void;
  onEdit: (cssValue: string) => void;
}

/** Swatch (opens the picker popover) + hex pair. Fully-transparent computed values
 * display as "transparent" until a color is picked. */
export function ColorField({
  label,
  icon,
  title,
  value,
  tokens,
  mixed = false,
  drafted = false,
  onRevert,
  onEdit,
}: ColorFieldProps) {
  const isTransparent = /^rgba\(\d+,\s*\d+,\s*\d+,\s*0\)$/u.test(value.trim());
  const hex = rgbToHex(value);
  const display = mixed ? "" : isTransparent ? "transparent" : (hex ?? value);
  const [text, setText] = useSyncedDraftText(display);

  const commit = useCallback(
    (next: string) => {
      setText(next);
      onEdit(next);
    },
    [onEdit, setText],
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
        placeholder={mixed ? "Mixed" : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(text);
            event.currentTarget.blur();
          }
        }}
        spellCheck={false}
        onBlur={() => {
          if (text && text !== display) commit(text);
        }}
        className="h-full w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      {drafted && onRevert ? <FieldRevert onRevert={onRevert} /> : null}
      <span className="w-1.5 shrink-0" />
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
