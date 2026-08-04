import { useCallback, useRef, useState, type PointerEvent } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

import type { DesignModeTokens } from "../designModeStore";

/** "rgb(a, b, c)" / "rgba(a, b, c, d)" → "#rrggbb", or null for anything else. */
export function rgbToHex(value: string): string | null {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/u.exec(value.trim());
  if (!match) return null;
  const channel = (raw: string | undefined) =>
    Math.min(255, Number.parseInt(raw ?? "0", 10))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`;
}

interface Hsv {
  readonly h: number; // 0..360
  readonly s: number; // 0..1
  readonly v: number; // 0..1
}

function hexToHsv(hex: string): Hsv | null {
  const match = /^#?([0-9a-f]{6})$/iu.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "0", 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const channel = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Shared drag-a-fraction helper for the SV area and hue bar. */
function useFractionDrag(onFraction: (x: number, y: number) => void) {
  const dragging = useRef(false);
  const report = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      onFraction(x, y);
    },
    [onFraction],
  );
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragging.current = true;
      report(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (dragging.current) report(event);
    },
    onPointerUp: () => {
      dragging.current = false;
    },
  };
}

interface Props {
  /** Current field value — an rgb()/hex string; seeds the picker when parseable. */
  value: string;
  tokens: DesignModeTokens | null;
  onPick: (cssValue: string) => void;
  triggerAriaLabel: string;
}

/**
 * The panel's color picker — a Figma-style popover with an SV area, hue bar, hex field,
 * and the previewed app's own theme color tokens as a swatch grid (picking a token
 * applies its raw CSS value; the change-request builder maps it back to the token name
 * at send time). Replaces the bare native color input.
 */
export function DesignColorPicker({ value, tokens, onPick, triggerAriaLabel }: Props) {
  const seededHex = rgbToHex(value) ?? (value.startsWith("#") ? value : null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(seededHex ?? "") ?? { h: 0, s: 0, v: 0.5 });
  const [hexText, setHexText] = useState(seededHex ?? "#808080");

  const commitHsv = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexText(hex);
      onPick(hex);
    },
    [onPick],
  );

  const svDrag = useFractionDrag((x, y) => commitHsv({ h: hsv.h, s: x, v: 1 - y }));
  const hueDrag = useFractionDrag((x) => commitHsv({ ...hsv, h: x * 360 }));

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={triggerAriaLabel}
            className="size-4 shrink-0 cursor-pointer rounded-[3px] border border-border/70"
            style={{ backgroundColor: seededHex ?? value }}
          />
        }
      />
      <PopoverPopup className="w-56 p-2" data-fork-design-color-picker>
        <div className="space-y-2">
          <div
            className="relative h-32 w-full cursor-crosshair touch-none rounded"
            style={{
              backgroundColor: hueColor,
              backgroundImage:
                "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
            }}
            {...svDrag}
          >
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          <div
            className="relative h-3 w-full cursor-ew-resize touch-none rounded"
            style={{
              background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
            {...hueDrag}
          >
            <span
              className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="size-5 shrink-0 rounded border border-border/70"
              style={{ backgroundColor: hexText }}
            />
            <input
              value={hexText}
              onChange={(event) => setHexText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const parsed = hexToHsv(hexText);
                if (parsed) commitHsv(parsed);
              }}
              onBlur={() => {
                const parsed = hexToHsv(hexText);
                if (parsed) commitHsv(parsed);
              }}
              spellCheck={false}
              className="h-6 w-full min-w-0 rounded bg-muted/40 px-1.5 font-mono text-xs text-foreground outline-none"
            />
          </div>
          {tokens && tokens.colors.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Theme colors
              </p>
              <div className="grid max-h-28 grid-cols-10 gap-1 overflow-y-auto pr-0.5">
                {tokens.colors.map((token) => (
                  <button
                    key={token.name}
                    type="button"
                    title={token.name}
                    onClick={() => {
                      onPick(token.value);
                      const hex = hexToHsv(token.value);
                      if (hex) {
                        setHsv(hex);
                        setHexText(token.value);
                      }
                    }}
                    className={cn(
                      "size-4 rounded-[3px] border border-border/50",
                      "transition-transform hover:scale-110",
                    )}
                    style={{ backgroundColor: token.value }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
