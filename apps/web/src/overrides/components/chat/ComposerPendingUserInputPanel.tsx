import { type ApprovalRequestId } from "@t3tools/contracts";
import { memo } from "react";
import { CheckIcon } from "lucide-react";

import { useComposerPendingUserInputCard } from "~/custom/useComposerPendingUserInputCard";
import { ComposerBanner } from "./ComposerBanner";
import { cn } from "~/lib/utils";
import { type PendingUserInputDraftAnswer } from "~/pendingUserInput";
import { type PendingUserInput } from "~/session-logic";

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: ApprovalRequestId) => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
      onDismiss={onDismiss}
    />
  );
});

function OptionControl({ multiSelect, selected }: { multiSelect: boolean; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center border border-foreground/50",
        multiSelect ? "rounded-[4px]" : "rounded-full",
        selected && "border-transparent bg-primary text-primary-foreground",
      )}
    >
      {selected ? (
        multiSelect ? (
          <CheckIcon className="size-3" strokeWidth={3} />
        ) : (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        )
      ) : null}
    </span>
  );
}

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: ApprovalRequestId) => void;
}) {
  const { progress, activeQuestion, optimisticSingleSelect, handleOptionSelection } =
    useComposerPendingUserInputCard({
      prompt,
      isResponding,
      answers,
      questionIndex,
      onToggleOption,
      onAdvance,
    });

  if (!activeQuestion) {
    return null;
  }

  const customAnswerActive = progress.customAnswer.trim().length > 0;
  const multiSelect = activeQuestion.multiSelect === true;

  return (
    <div data-fork-pending-user-input="true" className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
        <span>Questions</span>
        {prompt.questions.length > 1 ? (
          <span className="tabular-nums">
            {questionIndex + 1}/{prompt.questions.length}
          </span>
        ) : null}
        {prompt.dismissible ? (
          // Async questions may be closed without a reply. The fork header is a
          // plain row rather than upstream's disclosure trigger, so this is a
          // real button and needs none of upstream's click/keydown containment.
          <ComposerBanner.Dismiss
            className="ms-auto"
            aria-label="Dismiss question without answering"
            title="Dismiss question without answering"
            disabled={isResponding}
            data-pending-user-input-dismiss
            onClick={() => {
              onDismiss(prompt.requestId);
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-col text-sm">
        <p className="font-medium text-foreground">{activeQuestion.question}</p>
        <p className="font-normal text-muted-foreground">
          {multiSelect ? "Select one or more" : "Select one"}
        </p>
      </div>

      <div className="flex flex-col gap-4" role={multiSelect ? "group" : "radiogroup"}>
        {activeQuestion.options.map((option, index) => {
          const optionValue = option.value ?? option.label;
          const isOptimisticallySelected =
            optimisticSingleSelect?.questionId === activeQuestion.id &&
            optimisticSingleSelect.optionValue === optionValue;
          const isSelected =
            isOptimisticallySelected ||
            (!customAnswerActive && progress.selectedOptionValues.includes(optionValue));
          const digitShortcut = index < 9 ? String(index + 1) : undefined;

          return (
            <button
              key={`${activeQuestion.id}:${optionValue}`}
              type="button"
              role={multiSelect ? "checkbox" : "radio"}
              aria-checked={isSelected}
              aria-keyshortcuts={digitShortcut}
              disabled={isResponding}
              onClick={() => {
                handleOptionSelection(activeQuestion.id, optionValue);
              }}
              className={cn(
                "group flex w-full flex-col gap-1 rounded-lg border p-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-ring/40",
                isSelected
                  ? "border-foreground/24 bg-foreground/8 text-foreground"
                  : "border-transparent hover:bg-foreground/4",
                isResponding && "cursor-not-allowed opacity-50",
                !isResponding && "cursor-pointer",
              )}
            >
              <div className="flex items-center gap-2">
                <OptionControl multiSelect={multiSelect} selected={isSelected} />
                <span className="text-sm font-medium text-foreground">{option.label}</span>
              </div>
              {option.description && option.description !== option.label ? (
                <div className="flex w-full items-center pl-6">
                  <span
                    className={cn(
                      "flex-1 text-sm font-normal",
                      isSelected ? "text-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
});
