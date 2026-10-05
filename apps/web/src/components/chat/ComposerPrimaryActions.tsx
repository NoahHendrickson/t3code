import { memo, type MouseEventHandler, type PointerEventHandler } from "react";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, PlayIcon } from "lucide-react";
import { CornerUpRight, ListPlus } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
/* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell */
import { StopSquareIcon } from "~/custom/StopSquareIcon";
/* fork:end fork-composer-shell */
/* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation */
import {
  ForkDictationPrimaryButton,
  type ForkDictationPrimary,
} from "~/custom/voice/ForkDictationControl";
/* fork:end fork-local-dictation */
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";
import {
  alternateComposerDispatchAction,
  resolveComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  /** The turn is running: sending steers or queues instead of starting a turn. */
  isRunning: boolean;
  /** Stop can reach a run, including one still preparing or starting. */
  canInterrupt: boolean;
  followUpBehavior?: "queue" | "steer";
  alternateShortcutLabel?: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  canResume?: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation */
  /** Set when dictation takes the send slot: the mic with nothing to send, the
   * check (and a cancel X beside it) while a session is live. */
  forkDictation?: ForkDictationPrimary | null;
  /* fork:end fork-local-dictation */
  isEditingQueuedMessage?: boolean;
  onSubmitMessage?: MouseEventHandler<HTMLButtonElement>;
  onResume?: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

// The composer's labeled primary actions (Submit, Refine, Implement) share the send button's
// message-action pill, so they are composer-owned buttons rather than restyled Buttons.
const messageActionPillClassName =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-message-action font-medium text-base text-message-action-foreground shadow-xs shadow-message-action/24 outline-none hover:bg-message-action-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none sm:text-sm";

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  canInterrupt,
  followUpBehavior = "steer",
  alternateShortcutLabel = null,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  canResume = false,
  preserveComposerFocusOnPointerDown = false,
  /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation */
  forkDictation = null,
  /* fork:end fork-local-dictation */
  isEditingQueuedMessage = false,
  onSubmitMessage,
  onResume,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const shortcutModifiers = useShortcutModifierState();
  const isQueuing =
    !isEditingQueuedMessage &&
    resolveComposerDispatchMode({
      running: isRunning,
      activeTurnDefault: followUpBehavior,
      alternateModifier: shortcutModifiers.metaKey || shortcutModifiers.ctrlKey,
    }) === "queue";
  const alternateAction = alternateComposerDispatchAction(followUpBehavior);
  const isSendDisabled = sendDisabledReason !== null;
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );

  const renderStopGenerationButton = (insidePendingAction: boolean) => (
    <Tooltip key="interrupt">
      <TooltipTrigger
        render={
          <button
            type="button"
            /* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell */
            data-fork-composer-action="stop"
            /* fork:end fork-composer-shell */
            className={cn(
              "flex cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-control-highlight transition-all duration-150 hover:bg-destructive hover:scale-105 active:inset-shadow-control-pressed active:shadow-none [&_svg]:pointer-events-none",
              insidePendingAction ? "size-8 sm:size-7" : "size-8 sm:h-8 sm:w-8",
            )}
            {...pointerFocusProps}
            onClick={onInterrupt}
            aria-label="Stop generation"
          />
        }
      >
        {/* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell */}
        <StopSquareIcon />
        {/* fork:end fork-composer-shell */}
      </TooltipTrigger>
      <TooltipPopup>Interrupt</TooltipPopup>
    </Tooltip>
  );

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {canInterrupt ? renderStopGenerationButton(true) : null}
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              /* fork:begin fork-pending-user-input — see .fork/customizations.yaml#fork-pending-user-input */
              data-fork-pending-user-input-action="previous"
              /* fork:end fork-pending-user-input */
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              /* fork:begin fork-pending-user-input — see .fork/customizations.yaml#fork-pending-user-input */
              data-fork-pending-user-input-action="previous"
              /* fork:end fork-pending-user-input */
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-8 sm:h-7", compact ? "px-3" : "px-4")}
          /* fork:begin fork-pending-user-input — see .fork/customizations.yaml#fork-pending-user-input */
          data-fork-pending-user-input-action="advance"
          /* fork:end fork-pending-user-input */
          {...pointerFocusProps}
          disabled={
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt && (promptHasText || !canResume)) {
    if (promptHasText) {
      return (
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-9 sm:h-8", compact ? "px-3" : "px-4")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-9 rounded-r-none px-4 sm:h-8")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </button>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  messageActionPillClassName,
                  "h-9 rounded-l-none border-l border-message-action-foreground/20 px-2 sm:h-8",
                )}
                aria-label="Implementation actions"
                {...pointerFocusProps}
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" {...composerFloatingLayerProps}>
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
     The send button's look, hoisted so dictation can wear it: with nothing to
     send the slot shows the mic instead of a disabled send, and a live session
     shows the check with a cancel X beside it. Always the filled variant: the
     fork's send is its normal button on every build (fork-composer-shell hides
     the Dev/Nightly stage art below), so the transparent art variant would
     leave a white glyph on nothing. ChatComposer decides when dictation owns
     the slot (an idle mic yields to upstream's resume action; a live session
     never does), so a non-null forkDictation always wins here. */
  const sendButtonClassName =
    "relative isolate flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-message-action text-message-action-foreground shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-control-highlight enabled:shadow-message-action/24 hover:scale-105 hover:bg-message-action-hover active:inset-shadow-control-pressed active:shadow-none disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8 [&_svg]:pointer-events-none";
  const forkDictationButton = forkDictation ? (
    <ForkDictationPrimaryButton
      dictation={forkDictation.dictation}
      disabled={forkDictation.disabled}
      className={sendButtonClassName}
    />
  ) : null;
  /* fork:end fork-local-dictation */

  if (canInterrupt && !hasSendableContent && !isEditingQueuedMessage) {
    /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
       Dictation sits to stop's left, as the ghost mic does over typed text,
       so stop keeps the right edge: the mic beside it, and a live session's
       timeline, X and check growing leftward without moving it. */
    if (forkDictationButton) {
      return (
        <>
          {forkDictationButton}
          {renderStopGenerationButton(false)}
        </>
      );
    }
    /* fork:end fork-local-dictation */
    return renderStopGenerationButton(false);
  }

  const showResume = canResume && !hasSendableContent && !isEditingQueuedMessage;
  const submitLabel = showResume
    ? "Resume thread"
    : isEditingQueuedMessage
      ? "Update queued message"
      : isQueuing
        ? "Queue message"
        : isRunning
          ? "Steer message"
          : "Submit message";
  const submitStatus = isEnvironmentUnavailable
    ? "Environment disconnected"
    : (sendDisabledReason ??
      (isConnecting
        ? "Connecting"
        : isPreparingWorktree
          ? "Preparing worktree"
          : isSendBusy
            ? isEditingQueuedMessage
              ? "Updating queued message"
              : "Submitting message"
            : null));
  const submitTooltip =
    submitStatus ??
    (isRunning && !isEditingQueuedMessage
      ? `Click to ${followUpBehavior}, Ctrl/⌘-click${alternateShortcutLabel ? ` or ${alternateShortcutLabel}` : ""} to ${alternateAction}`
      : submitLabel);

  const sendButton = (
    <button
      type={showResume ? "button" : "submit"}
      /* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell
         Always "flat": the fork's send is its normal button on every build. */
      data-fork-composer-action="send"
      data-fork-composer-send-tone="flat"
      /* fork:end fork-composer-shell */
      /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation */
      className={sendButtonClassName}
      /* fork:end fork-local-dictation */
      {...pointerFocusProps}
      onClick={showResume ? onResume : onSubmitMessage}
      disabled={
        isSendBusy ||
        isSendDisabled ||
        isConnecting ||
        isEnvironmentUnavailable ||
        (!hasSendableContent && !showResume)
      }
      aria-label={submitStatus ?? submitLabel}
    >
      {stageBackdropVariant ? (
        <span
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
          /* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell
             theme.custom.css hides the Dev/Nightly stage art off this: the
             fork's send is its normal button on every build. Rendered still,
             so upstream's artwork test and exports stand. */
          data-fork-composer-send-art=""
          /* fork:end fork-composer-shell */
        >
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {isConnecting || isSendBusy ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : showResume ? (
        <PlayIcon className="size-4 fill-current" aria-hidden="true" />
      ) : isEditingQueuedMessage ? (
        <CheckIcon className="size-4" aria-hidden="true" />
      ) : isRunning ? (
        <MorphIcon className="size-4" icon={isQueuing ? ListPlus : CornerUpRight} />
      ) : (
        /* fork:begin fork-composer-shell — see .fork/customizations.yaml#fork-composer-shell */
        /* The return arrow from the designs, replacing upstream's up arrow. Kept
           on the button's own 24x24 grid rather than retraced onto a tight
           viewBox, so the glyph lands at the drawn 12x7 centred on 12,12. */
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8.5V12.5H6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 9.5L6 12.5L9 15.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        /* fork:end fork-composer-shell */
      )}
    </button>
  );

  /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
     The dictation button carries its own labels, so it takes the slot bare
     rather than under the send tooltip. */
  if (forkDictationButton) {
    return forkDictationButton;
  }
  /* fork:end fork-local-dictation */
  return (
    <Tooltip key="submit">
      <TooltipTrigger render={<span className="inline-flex" />}>{sendButton}</TooltipTrigger>
      <TooltipPopup>{submitTooltip}</TooltipPopup>
    </Tooltip>
  );
});
