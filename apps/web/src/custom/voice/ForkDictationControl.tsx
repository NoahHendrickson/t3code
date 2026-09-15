import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { readForkVoiceInputBridge } from "./forkVoiceInputBridge";
import type { ForkDictation } from "./useForkDictationController";

// Figma 472:33881 draws 2px blue dots on a 4px pitch, 3px in from either
// edge, bars up to 16px tall in a 24px row. By request the bars are 1px wide
// and painted in the canvas's own `color` (the foreground; pure white in dark
// via theme.custom.css), matching the X and check beside them. The pitch stays
// 4px so the timeline scrolls at the same speed, and a silent sample is a 1×2
// mark so it still reads as a dot.
const BAR_WIDTH = 1;
const BAR_PITCH = 4;
const BAR_GAP = BAR_PITCH - BAR_WIDTH;
const DOT_HEIGHT = 2;
const BAR_MAX_HEIGHT = 16;
const BAR_INSET = 3;
// Samples arrive at 20 Hz; 30 s of history at 4px each outruns any composer.
const HISTORY_LIMIT = 600;
// Quiet speech sits around -40 dBFS and normal speech near -20, so map the
// -50…-10 dB range to the bar height instead of raw amplitude, which barely
// moves for anything below a raised voice.
const FLOOR_DB = -50;
const CEILING_DB = -10;

function levelToUnit(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));
}

/**
 * Input-level timeline: one dot per sample, newest at the right edge, so
 * silence is a row of dots and speech is bars scrolling left across the row.
 * Fills whatever width the tray gives it and shows as much history as fits.
 *
 * Painted on a canvas rather than as DOM bars: the row can be hundreds of
 * samples wide and every sample moves all of them, so one clear-and-fill per
 * sample beats hundreds of style writes. No CSS transition, since a new value
 * every 50 ms would never settle. Stays mounted while the tray slides shut so
 * the row keeps its width for the whole collapse; `active` clears the history
 * between sessions instead.
 *
 * The bitmap follows the element's box, so the tray's 240ms slide repaints
 * it once per frame while the width moves. A paint is a clear plus a few
 * hundred 1px fillRects, well under a millisecond, and the slide is bounded:
 * it runs once per open and once per close, never continuously.
 */
function VoiceLevelTimeline(props: {
  subscribe: ForkDictation["subscribeLevel"];
  active: boolean;
}) {
  const { subscribe, active } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const history: number[] = [];
    const paint = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * scale);
      const pixelHeight = Math.round(height * scale);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      // Read per paint so an appearance switch mid-session recolours the
      // next sample rather than the next session.
      context.fillStyle = getComputedStyle(canvas).color;
      const slots = Math.floor((width - 2 * BAR_INSET + BAR_GAP) / BAR_PITCH);
      for (let slot = 0; slot < slots; slot++) {
        const sample = history[history.length - slots + slot];
        const barHeight =
          sample === undefined
            ? DOT_HEIGHT
            : DOT_HEIGHT + Math.round(sample * (BAR_MAX_HEIGHT - DOT_HEIGHT));
        const x = width - BAR_INSET + BAR_GAP - (slots - slot) * BAR_PITCH;
        context.fillRect(x, (height - barHeight) / 2, BAR_WIDTH, barHeight);
      }
    };
    // The tray's slide resizes the canvas every frame; repaint to keep the
    // newest sample pinned to the right edge as the row grows.
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    paint();
    if (!active) return () => observer.disconnect();
    const unsubscribe = subscribe((level) => {
      history.push(levelToUnit(level));
      if (history.length > HISTORY_LIMIT) history.shift();
      paint();
    });
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [subscribe, active]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-fork-dictation-tray-item="bars"
      // Its minimum width comes from theme.custom.css, shared with the tray's
      // own animated minimum so the two never disagree. The paint colour is
      // this element's `color`.
      className="block h-6 flex-1 text-foreground"
    />
  );
}

/**
 * Renders the composer mic for a session owned by `useForkDictationController`.
 *
 * The mic keeps its place; starting a session opens a tray to its right with
 * the level timeline, cancel X and check, so the mic slides left as the tray
 * grows (theme.custom.css transitions the tray's flex-grow and springs the
 * three items in behind it). The tray takes every pixel its row can spare, so
 * on the drawn draft box it spans the whole action row. It stays in the DOM
 * while closed so the slide runs both ways; `inert` keeps its buttons out of
 * the tab order and the accessibility tree until it opens.
 *
 * The tray reports three states, not two. A session ending drops it to
 * "closing", which slides it shut exactly like "closed" but keeps a started
 * thread's row stacked (theme.custom.css keys the stack on open or closing),
 * so the prompt holds its reserve and the typed text its measure until the
 * slide has brought the tray back to zero. The tray's own box says when:
 * a ResizeObserver flips "closing" to "closed" the moment its content width
 * reaches zero, which is at once under Reduce Motion and after the 240ms
 * slide otherwise, with no timer to drift from the CSS.
 */
export function ForkDictationControl(props: { dictation: ForkDictation; disabled: boolean }) {
  const { dictation, disabled } = props;
  const [trayAtRest, setTrayAtRest] = useState(true);
  // A callback ref rather than an effect, so the observer follows the tray's
  // own mount (it only renders once the bridge is available) and React runs
  // the returned cleanup when it unmounts.
  const observeTray = useCallback((tray: HTMLDivElement | null) => {
    if (!tray) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setTrayAtRest(entry.contentRect.width === 0);
    });
    observer.observe(tray);
    return () => observer.disconnect();
  }, []);
  if (!dictation.isAvailable) return null;
  const { phase } = dictation.state;
  const recording = phase === "recording";
  const transcribing = phase === "transcribing";
  const busy = dictation.blocksSubmission;
  const trayState = busy ? "open" : trayAtRest ? "closed" : "closing";
  const label = transcribing
    ? "Transcribing (Escape to cancel)"
    : recording
      ? "Done, transcribe (Right Command)"
      : "Dictate (Right Command)";
  // Preparing is normally a blink (permission + model check) and transcribing
  // is the spinner on the check; only the one-time model download says anything.
  const status =
    phase === "preparing" && dictation.downloadPercent !== null
      ? `Downloading model ${dictation.downloadPercent}%`
      : null;
  return (
    // Always fills its row and packs to the end, so the mic's position is set
    // by the tray's animated width alone: as the tray grows the mic slides
    // left, as it shrinks the mic slides back, with no jump at either end.
    // Idle, the tray is zero wide and the mic sits at the end beside send
    // exactly as a content-sized control would.
    <div className="relative flex min-w-0 flex-1 items-center justify-end">
      {status ? (
        <span role="status" className="mr-1 max-w-36 shrink-0 text-xs text-muted-foreground">
          {status}
        </span>
      ) : null}
      {dictation.error ? (
        <div
          role="alert"
          className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          {dictation.error}
          <div className="mt-2 flex justify-end gap-1">
            {dictation.errorAction === "settings" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void readForkVoiceInputBridge()?.openMicrophoneSettings()}
              >
                Open microphone settings
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={dictation.cancel}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              // Pressed while the tray is open: theme.custom.css gives the live
              // mic its blue fill and glowing blue glyph off this attribute.
              aria-pressed={busy}
              // Sized with attach/send/stop by theme.custom.css so the row stays 44px.
              data-fork-composer-action="dictate"
              // Preparing has nothing to confirm yet (X is the way out). While
              // transcribing the mic is inert but not dimmed; the check spins.
              className={transcribing ? "pointer-events-none" : undefined}
              disabled={phase === "preparing" || (!busy && disabled)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={recording ? dictation.stop : transcribing ? undefined : dictation.start}
            />
          }
        >
          <MicrophoneIcon />
        </TooltipTrigger>
        <TooltipPopup variant="glass" data-fork-glass-tooltip="">
          {recording || transcribing ? label : "Dictate"}
        </TooltipPopup>
      </Tooltip>
      <div ref={observeTray} data-fork-dictation-tray={trayState} inert={!busy}>
        <div className="flex w-full min-w-0 items-center gap-1 pl-1">
          <VoiceLevelTimeline subscribe={dictation.subscribeLevel} active={busy} />
          {/* Each button sits in its own stagger wrapper so the entrance
              transition never fights the button's own press transition. */}
          <span className="flex shrink-0 items-center gap-px">
            <span data-fork-dictation-tray-item="cancel" className="flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel dictation (Escape)"
                data-fork-composer-action="dictate-cancel"
                onPointerDown={(event) => event.preventDefault()}
                onClick={dictation.cancel}
              >
                <XIcon />
              </Button>
            </span>
            <span data-fork-dictation-tray-item="done" className="flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Done, transcribe (Right Command)"
                data-fork-composer-action="dictate-done"
                className={transcribing ? "pointer-events-none" : undefined}
                aria-busy={transcribing}
                disabled={phase === "preparing"}
                onPointerDown={(event) => event.preventDefault()}
                onClick={recording ? dictation.stop : undefined}
              >
                {transcribing ? <Spinner className="size-4" aria-hidden /> : <CheckIcon />}
              </Button>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
