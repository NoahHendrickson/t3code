/**
 * Fork guard — see `.fork/customizations.yaml#fork-pending-user-input`.
 *
 * ComposerPendingUserInputCard is `memo(fn)` and keyed by requestId, so it
 * stays mounted while questionIndex advances. react-dom refreshes a
 * useEffectEvent impl only for FunctionComponent fibers, so one declared in
 * useComposerPendingUserInputCard would answer every later question with
 * question 1's closure — taking the single-select branch on a multi-select
 * question, arming the 200 ms auto-advance, and writing through the
 * mount-time onToggleOption. This pins the selection handler against the
 * question actually on screen.
 */
import { act, memo, StrictMode, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PendingUserInput } from "~/session-logic";
import { useComposerPendingUserInputCard } from "../custom/useComposerPendingUserInputCard";

const PROMPT = {
  requestId: "req-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  dismissible: true,
  questions: [
    {
      id: "q1",
      header: "Pick one",
      question: "Which library?",
      multiSelect: false,
      options: [{ label: "Zod", value: "zod" }],
    },
    {
      id: "q2",
      header: "Pick any",
      question: "Which features?",
      multiSelect: true,
      options: [
        { label: "Auth", value: "auth" },
        { label: "Billing", value: "billing" },
      ],
    },
  ],
} as unknown as PendingUserInput;

type Card = ReturnType<typeof useComposerPendingUserInputCard>;

let root: Root;
let card: Card;
let mountToken: object;
let toggled: Array<[string, string]>;
let advances: number;

const Host = memo(function Host({ questionIndex }: { questionIndex: number }) {
  // Survives a re-render, not a remount — the harness's own invariant.
  const token = useRef({});
  const value = useComposerPendingUserInputCard({
    prompt: PROMPT,
    isResponding: false,
    answers: {},
    questionIndex,
    onToggleOption: (questionId, optionValue) => {
      toggled.push([questionId, optionValue]);
    },
    onAdvance: () => {
      advances += 1;
    },
  });
  useLayoutEffect(() => {
    card = value;
    mountToken = token.current;
  });
  return null;
});

async function renderQuestion(questionIndex: number) {
  await act(() => {
    root.render(
      <StrictMode>
        <Host questionIndex={questionIndex} />
      </StrictMode>,
    );
  });
}

beforeEach(() => {
  // The probe renders no host nodes, but ReactDOM still needs an event target.
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      document,
      // react-dom's before-mutation phase walks document.activeElement.
      HTMLIFrameElement: EventTarget,
      // The single-select branch arms its auto-advance through window.
      // Delegate lazily, so a test switching to fake timers is honoured.
      setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) =>
        globalThis.setTimeout(...args),
      clearTimeout: (handle?: Parameters<typeof globalThis.clearTimeout>[0]) =>
        globalThis.clearTimeout(handle),
    }),
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  toggled = [];
  advances = 0;
  root = createRoot(container as unknown as HTMLElement);
});

afterEach(async () => {
  try {
    await act(() => {
      root.unmount();
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("fork guard: pending user input question advance", () => {
  it("takes the multi-select branch once the card advances to a multi-select question", async () => {
    vi.useFakeTimers();
    try {
      const mounts = new Set<object>();
      await renderQuestion(0);
      mounts.add(mountToken);
      await renderQuestion(1);
      mounts.add(mountToken);
      // The card is reconciled, not remounted — the premise the bug needs.
      // A remount would rebuild the hook and hide the staleness entirely.
      expect(mounts.size).toBe(1);
      expect(card.activeQuestion?.id).toBe("q2");

      await act(async () => {
        card.handleOptionSelection("q2", "auth");
      });
      expect(toggled).toEqual([["q2", "auth"]]);
      // Multi-select toggles in place: no optimistic single pick, no timer.
      expect(card.optimisticSingleSelect).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(advances).toBe(0);

      await act(async () => {
        card.handleOptionSelection("q2", "billing");
      });
      expect(toggled).toEqual([
        ["q2", "auth"],
        ["q2", "billing"],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still auto-advances a single-select question", async () => {
    vi.useFakeTimers();
    try {
      await renderQuestion(0);
      await act(async () => {
        card.handleOptionSelection("q1", "zod");
      });
      expect(toggled).toEqual([["q1", "zod"]]);
      expect(card.optimisticSingleSelect).toEqual({ questionId: "q1", optionValue: "zod" });
      expect(advances).toBe(0);
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(advances).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances through the callbacks of the render that is on screen", async () => {
    await renderQuestion(0);
    // Stands in for the panel's own onAdvance changing between questions.
    const retained = card;
    await renderQuestion(1);
    await act(async () => {
      retained.handleOptionSelection("q2", "billing");
    });
    expect(toggled).toEqual([["q2", "billing"]]);
    expect(card.optimisticSingleSelect).toBeNull();
  });
});
