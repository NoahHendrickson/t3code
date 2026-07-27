import { useEffect, useState } from "react";

import { isPromptHeightWrapped, nextWrapLatch } from "./composerDensity";

export interface ComposerPromptWrapLatch {
  /** Latched: the prompt has wrapped and has not been cleared since. */
  isPromptWrapped: boolean;
  /** Ref callback for the element wrapping the prompt editor. */
  attachPromptElement: (element: HTMLDivElement | null) => void;
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
export function useComposerPromptWrapLatch(prompt: string): ComposerPromptWrapLatch {
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
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      measure(entry.contentRect.height);
    });
    observer.observe(editable);
    measure(editable.clientHeight);
    return () => {
      observer.disconnect();
    };
  }, [promptElement]);

  // Releasing the latch cannot be left to the observer alone: clearing a
  // one-line prompt in the tall shell changes no height, so no resize fires and
  // the composer would stay tall for the rest of the thread.
  useEffect(() => {
    if (prompt.trim().length === 0) {
      setIsPromptWrapped(false);
    }
  }, [prompt]);

  return { isPromptWrapped, attachPromptElement: setPromptElement };
}
