import { useEffect, useRef } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { ForkDictation } from "./useForkDictationController";

const BAR_COUNT = 10;
const MIN_SCALE = 0.15;
// Quiet speech sits around -40 dBFS and normal speech near -20, so map the
// -50…-10 dB range to the bar height instead of raw amplitude, which barely
// moves for anything below a raised voice.
const FLOOR_DB = -50;
const CEILING_DB = -10;

function levelToScale(rms: number): number {
  if (rms <= 0) return MIN_SCALE;
  const db = 20 * Math.log10(rms);
  const unit = (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB);
  return Math.min(1, Math.max(MIN_SCALE, unit));
}

/**
 * Rolling input-level bars: each sample shifts in from the right, so the meter
 * moves only while something is being heard. Writes transforms straight to the
 * DOM because samples arrive at 20 Hz and nothing else needs them.
 */
function VoiceLevelBars(props: { subscribe: ForkDictation["subscribeLevel"] }) {
  const { subscribe } = props;
  const containerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bars = Array.from(containerRef.current?.children ?? []) as HTMLElement[];
    const scales = Array.from({ length: BAR_COUNT }, () => MIN_SCALE);
    return subscribe((level) => {
      scales.shift();
      scales.push(levelToScale(level));
      bars.forEach((bar, index) => {
        bar.style.transform = `scaleY(${scales[index]})`;
      });
    });
  }, [subscribe]);
  return (
    <span ref={containerRef} aria-hidden className="flex h-4 items-center gap-0.5 px-1">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          className="h-full w-px rounded-full bg-foreground transition-transform duration-75 ease-out"
          style={{ transform: `scaleY(${MIN_SCALE})` }}
        />
      ))}
    </span>
  );
}

/** Renders the composer mic for a session owned by `useForkDictationController`. */
export function ForkDictationControl(props: { dictation: ForkDictation; disabled: boolean }) {
  const { dictation, disabled } = props;
  if (!dictation.isAvailable) return null;
  const { phase } = dictation.state;
  const recording = phase === "recording";
  const transcribing = phase === "transcribing";
  const busy = dictation.blocksSubmission;
  const label = transcribing
    ? "Transcribing"
    : recording
      ? "Done, transcribe (Ctrl+Shift+Space)"
      : "Dictate (Ctrl+Shift+Space)";
  // Preparing is normally a blink (permission + model check) and transcribing
  // is the spinner on the check; only the one-time model download says anything.
  const status =
    phase === "preparing" && dictation.downloadPercent !== null
      ? `Downloading model ${dictation.downloadPercent}%`
      : null;
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      {status ? (
        <span role="status" className="max-w-36 text-xs text-muted-foreground">
          {status}
        </span>
      ) : null}
      {phase === "preparing" || recording ? (
        <VoiceLevelBars subscribe={dictation.subscribeLevel} />
      ) : null}
      {busy && !transcribing ? (
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
      ) : null}
      {dictation.error ? (
        <div
          role="alert"
          className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          {dictation.error}
          <Button type="button" variant="ghost" size="sm" onClick={dictation.cancel}>
            Dismiss
          </Button>
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
              aria-pressed={recording}
              // Sized with attach/send/stop by theme.custom.css so the row stays 44px.
              data-fork-composer-action="dictate"
              // Preparing has nothing to confirm yet (X is the way out). While
              // transcribing the button is the spinner: inert but not dimmed.
              className={transcribing ? "pointer-events-none" : undefined}
              aria-busy={transcribing}
              disabled={phase === "preparing" || (!busy && disabled)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={recording ? dictation.stop : transcribing ? undefined : dictation.start}
            />
          }
        >
          {transcribing ? (
            <Spinner className="size-4" aria-hidden />
          ) : busy ? (
            <CheckIcon />
          ) : (
            <MicrophoneIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup>{label}. Free and local. First use downloads a 181 MiB model.</TooltipPopup>
      </Tooltip>
    </div>
  );
}
