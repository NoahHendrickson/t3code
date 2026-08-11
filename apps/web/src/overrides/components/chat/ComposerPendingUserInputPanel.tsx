import { type ApprovalRequestId } from "@t3tools/contracts";
import { memo, useEffect, useEffectEvent, useRef, useState } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
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
    />
  );
});

function OptionControl({ multiSelect, selected }: { multiSelect: boolean; selected: boolean }) {
  if (multiSelect) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px]",
          selected
            ? "bg-primary text-primary-foreground"
            : "border border-[color:var(--neutral-50,#929293)]",
        )}
      >
        {selected ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full",
        selected
          ? "bg-primary text-primary-foreground"
          : "border border-[color:var(--neutral-50,#929293)]",
      )}
    >
      {selected ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
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
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionLabel: string;
  } | null>(null);

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (!activeQuestion || activeQuestion.multiSelect || !optimisticSingleSelect) {
      return;
    }
    if (optimisticSingleSelect.questionId !== activeQuestion.id) {
      setOptimisticSingleSelect(null);
      return;
    }
    if (
      progress.customAnswer.trim().length === 0 &&
      progress.selectedOptionLabels.includes(optimisticSingleSelect.optionLabel)
    ) {
      setOptimisticSingleSelect(null);
    }
  }, [
    activeQuestion,
    optimisticSingleSelect,
    progress.customAnswer,
    progress.selectedOptionLabels,
  ]);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  const handleOptionSelection = useEffectEvent((questionId: string, optionLabel: string) => {
    if (activeQuestion?.multiSelect) {
      onToggleOption(questionId, optionLabel);
      return;
    }
    setOptimisticSingleSelect({ questionId, optionLabel });
    onToggleOption(questionId, optionLabel);
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      onAdvanceRef.current();
    }, 200);
  });

  // Keyboard shortcut: number keys 1-9 select corresponding options when focus is
  // outside editable fields. Multi-select prompts toggle options in place; single-
  // select prompts keep the existing auto-advance behavior.
  useEffect(() => {
    if (!activeQuestion || isResponding) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, isResponding]);

  if (!activeQuestion) {
    return null;
  }

  const customAnswerActive = progress.customAnswer.trim().length > 0;
  const multiSelect = activeQuestion.multiSelect === true;

  return (
    <div data-fork-pending-user-input="true" className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
        <span>Questions</span>
        <span className="tabular-nums">
          {progress.answeredQuestionCount}/{prompt.questions.length}
        </span>
      </div>

      <div className="flex flex-col text-sm">
        <p className="font-medium text-foreground">{activeQuestion.question}</p>
        <p className="font-normal text-muted-foreground">
          {multiSelect ? "Select one or more" : "Select one"}
        </p>
      </div>

      <div className="flex flex-col gap-4" role={multiSelect ? "group" : "radiogroup"}>
        {activeQuestion.options.map((option) => {
          const isOptimisticallySelected =
            optimisticSingleSelect?.questionId === activeQuestion.id &&
            optimisticSingleSelect.optionLabel === option.label;
          const isSelected =
            isOptimisticallySelected ||
            (!customAnswerActive && progress.selectedOptionLabels.includes(option.label));

          return (
            <button
              key={`${activeQuestion.id}:${option.label}`}
              type="button"
              role={multiSelect ? "checkbox" : "radio"}
              aria-checked={isSelected}
              disabled={isResponding}
              onClick={() => {
                handleOptionSelection(activeQuestion.id, option.label);
              }}
              className={cn(
                "group flex w-full flex-col gap-1 rounded-lg p-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-ring/40",
                isSelected
                  ? "border border-white/24 bg-white/8 text-foreground"
                  : "border border-transparent hover:bg-white/4",
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
