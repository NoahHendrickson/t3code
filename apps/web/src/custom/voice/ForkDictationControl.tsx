import { XIcon } from "lucide-react";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { StopSquareIcon } from "~/custom/StopSquareIcon";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { ForkDictation } from "./useForkDictationController";

/** Renders the composer mic for a session owned by `useForkDictationController`. */
export function ForkDictationControl(props: { dictation: ForkDictation; disabled: boolean }) {
  const { dictation, disabled } = props;
  if (!dictation.isAvailable) return null;
  const { phase } = dictation.state;
  const recording = phase === "recording";
  const label = recording ? "Stop dictation" : "Dictate (Ctrl+Shift+Space)";
  const status =
    phase === "preparing"
      ? dictation.downloadPercent === null
        ? "Preparing…"
        : `Downloading model ${dictation.downloadPercent}%`
      : phase === "transcribing"
        ? "Transcribing…"
        : recording
          ? "Recording"
          : null;
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      {status ? (
        <span role="status" className="max-w-36 text-xs text-muted-foreground">
          {status}
        </span>
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
              disabled={disabled || (dictation.blocksSubmission && !recording)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={recording ? dictation.stop : dictation.start}
            />
          }
        >
          {recording ? (
            <span className="text-red-500">
              <StopSquareIcon />
            </span>
          ) : (
            <MicrophoneIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup>{label}. Free and local. First use downloads a 181 MiB model.</TooltipPopup>
      </Tooltip>
      {dictation.blocksSubmission ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel dictation"
          onClick={dictation.cancel}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
