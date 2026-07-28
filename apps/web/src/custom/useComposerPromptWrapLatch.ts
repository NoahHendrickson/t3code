import { useEffect, useState } from "react";

import {
  COMPOSER_PROMPT_SCROLLABLE_ATTR,
  isComposerPromptScrollable,
  isPromptHeightWrapped,
  nextWrapLatch,
} from "./composerDensity";

export interface ComposerPromptWrapLatch {
  /** Latched: the prompt has wrapped and has not been cleared since. */
  isPromptWrapped: boolean;
  /** Ref callback for the element wrapping the prompt editor. */
  attachPromptElement: (element: HTMLDivElement | null) => void;
}

function syncComposerPromptScrollable(editable: HTMLElement): void {
  const maxHeightPx = Number.parseFloat(window.getComputedStyle(editable).maxHeight);
  editable.toggleAttribute(
    COMPOSER_PROMPT_SCROLLABLE_ATTR,
    isComposerPromptScrollable({
      scrollHeightPx: editable.scrollHeight,
      maxHeightPx,
    }),
  );
}

/**
 * Watches the prompt editor and reports whether it has wrapped past one line —
 * the signal that grows the slim shell into the tall one.
 *
 * This is the impure half of the density decision, and it lives here rather
 * than inline in ChatComposer for two reasons: it is fork-authored behaviour
 * that upstream has no counterpart for, and keeping it beside the pure
 * `nextWrapLatch` it drives means the whole rule reads in one place.
 *
 * Two things about it are load-bearing:
 *
 * The measurement is observed, not derived. Lexical reflows the prompt without
 * a React render, so a height read during render is stale by construction.
 *
 * The result is latched, and the caller must not un-latch it. The two shells
 * give the prompt different widths — roughly 460px slim against 736px tall — so
 * a prompt between them un-wraps the instant the flip lands, re-wraps when it
 * flips back, and oscillates until it pins the main thread.
 */
export function useComposerPromptWrapLatch(
  prompt: string,
  /**
   * The draft the prompt belongs to. ChatComposer is not keyed by thread, so it
   * persists across thread and draft switches and so does this latch — and the
   * latch only ever clears on an *empty* prompt. Without this, leaving a thread
   * whose prompt had wrapped and arriving at one with a short saved draft would
   * render the new thread in the tall shell and strand it there until the user
   * emptied the field. "Only an empty prompt turns it off" is a rule about a
   * single composing session; a different thread is a different session.
   */
  draftKey: string,
): ComposerPromptWrapLatch {
  const [isPromptWrapped, setIsPromptWrapped] = useState(false);
  const [promptElement, setPromptElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const editable = promptElement?.querySelector<HTMLElement>('[data-testid="composer-editor"]');
    if (!editable) {
      setIsPromptWrapped(false);
      return;
    }
    const measure = (heightPx: number) => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(editable).lineHeight);
      const measuredWrapped = isPromptHeightWrapped(heightPx, lineHeight);
      setIsPromptWrapped((latched) =>
        nextWrapLatch({
          latched,
          measuredWrapped,
          isPromptEmpty: editable.textContent?.trim().length === 0,
        }),
      );
      // Height can clamp at max-h while content keeps growing, so the wrap
      // measurement alone would miss the transition into a scrollable prompt.
      syncComposerPromptScrollable(editable);
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      measure(entry.contentRect.height);
    });
    // No priming read. `observe()` delivers an initial observation for a
    // rendered element, so a manual call was always redundant — and it was the
    // only path using a padding-box metric (`clientHeight`) against a threshold
    // calibrated for the observer's content-box `contentRect`. The editor picks
    // up `max-sm:pb-11` in the mobile pending-answer state, where those 44px
    // would have latched the wrap on an empty prompt, and a latched value can
    // never be lowered by the observer's correct readings afterwards.
    observer.observe(editable);
    return () => {
      observer.disconnect();
      editable.removeAttribute(COMPOSER_PROMPT_SCROLLABLE_ATTR);
    };
  }, [promptElement]);

  // Releasing the latch cannot be left to the observer alone: clearing a
  // one-line prompt in the tall shell changes no height, so no resize fires and
  // the composer would stay tall for the rest of the thread.
  //
  // The same gap exists for scrollability: pasting past max-h does not change
  // the clamped height, so ResizeObserver stays quiet while scrollHeight grows.
  useEffect(() => {
    if (prompt.trim().length === 0) {
      setIsPromptWrapped(false);
    }
    const editable = promptElement?.querySelector<HTMLElement>('[data-testid="composer-editor"]');
    if (editable) {
      syncComposerPromptScrollable(editable);
    }
  }, [prompt, promptElement]);

  // A new draft is a new composing session, so the latch starts clean whether
  // or not the incoming prompt happens to be empty. Drop scrollability here
  // rather than re-measuring: Lexical may still hold the previous draft's
  // DOM when draftKey flips, and a sync against that would keep the scrollbar
  // on a short incoming draft. The prompt effect re-applies it once content
  // catches up.
  useEffect(() => {
    setIsPromptWrapped(false);
    const editable = promptElement?.querySelector<HTMLElement>('[data-testid="composer-editor"]');
    editable?.removeAttribute(COMPOSER_PROMPT_SCROLLABLE_ATTR);
  }, [draftKey, promptElement]);

  return { isPromptWrapped, attachPromptElement: setPromptElement };
}
