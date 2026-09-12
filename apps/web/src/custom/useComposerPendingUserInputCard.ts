/**
 * Shared pending-user-input card logic for the fork Questions chrome.
 * See `.fork/customizations.yaml#fork-pending-user-input`.
 *
 * Owns auto-advance, optimistic single-select, and number-key selection so the
 * override can stay presentational. Port upstream effect fixes here first.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "~/pendingUserInput";
import { type PendingUserInput } from "~/session-logic";

export function useComposerPendingUserInputCard({
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
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionValue: string;
  } | null>(null);

  // ComposerPendingUserInputCard is `memo(fn)`, and react-dom applies
  // useEffectEvent impls only for FunctionComponent fibers — memo and
  // forwardRef hosts are skipped outright (`case 11: case 15: break;` in
  // commitBeforeMutationEffects, react-dom 19.2.6). The card is keyed by
  // requestId, so it stays mounted while questionIndex advances, and an effect
  // event here would answer every later question with question 1's closure.
  // A layout-phase mirror instead, the same shape and reasoning as
  // useForkDictationController. Audit on a React bump: grep useEffectEvent,
  // check whether the host component is memoized or a forwardRef.
  const latestRef = useRef({ activeQuestion, onToggleOption, onAdvance });
  useLayoutEffect(() => {
    latestRef.current = { activeQuestion, onToggleOption, onAdvance };
  });

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
      progress.selectedOptionValues.includes(optimisticSingleSelect.optionValue)
    ) {
      setOptimisticSingleSelect(null);
    }
  }, [
    activeQuestion,
    optimisticSingleSelect,
    progress.customAnswer,
    progress.selectedOptionValues,
  ]);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  // Stable so the number-key listener below is not torn down and rebuilt on
  // every render; everything it reads comes from the mirror or a setState.
  const handleOptionSelection = useCallback((questionId: string, optionValue: string) => {
    const { activeQuestion: question, onToggleOption: toggle } = latestRef.current;
    if (question?.multiSelect) {
      toggle(questionId, optionValue);
      return;
    }
    setOptimisticSingleSelect({ questionId, optionValue });
    toggle(questionId, optionValue);
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      latestRef.current.onAdvance();
    }, 200);
  }, []);

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
      handleOptionSelection(activeQuestion.id, option.value ?? option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, isResponding, handleOptionSelection]);

  return {
    progress,
    activeQuestion,
    optimisticSingleSelect,
    handleOptionSelection,
  } as const;
}
