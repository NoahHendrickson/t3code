/**
 * Composer density — which shell the chat composer wears.
 *
 * `tall`      stacks the prompt over its own control row, in a 20px-radius box.
 * `slim`      runs the prompt inline with the model pills and the send button,
 *             in a 12px-radius box half the height.
 * `collapsed` is upstream's mobile tap target, which the fork restyles but does
 *             not lay out.
 *
 * The new-chat screen is always tall; a started thread starts slim and grows
 * into tall the moment the prompt no longer fits on one line. Everything else
 * here is a state the designs do not draw, resolved to tall because the slim
 * shell is a single 24px row with nowhere to put approval actions or a pending
 * question's Next/Submit pair.
 *
 * `collapsed` is a distinct value rather than a flavour of `slim` on purpose.
 * Folding it into `slim` meant the DOM advertised
 * `data-fork-composer-density="slim"` on a composer the slim layout was not
 * applied to, so every call site had to re-exclude the collapsed case by hand
 * and two things named "slim" disagreed about what they meant.
 */
export type ComposerDensity = "slim" | "tall" | "collapsed";

export interface ComposerDensityInput {
  /** The new-chat hero: a local draft with no messages yet. Always tall. */
  isDraftHero: boolean;
  /**
   * The prompt has wrapped past its first line. This must be latched by the
   * caller — see `nextWrapLatch` — because the two shells give the editor
   * different widths and an unlatched measurement oscillates.
   */
  isPromptWrapped: boolean;
  /**
   * The box is showing an approval request, a pending user-input question, or a
   * plan follow-up banner. These own the box's internal layout and carry their
   * own action rows, so the inline shell cannot host them.
   */
  hasComposerHeader: boolean;
  /** The composer is collapsed to a single tap target on mobile. */
  isCollapsedMobile: boolean;
  /**
   * A phone-width viewport. The slim shell is desktop-only: at 375px the model
   * pill and the send button leave the flex-1 editor about 90-150px, and the
   * placeholder — an absolutely positioned overlay outside the editor's scroll
   * box — wraps to several lines and paints straight through the 48px box with
   * nothing to clip it. Worse, it is stable: the overlay never changes the
   * observed editor height, so the wrap latch cannot rescue it.
   */
  isNarrowViewport: boolean;
}

export function resolveComposerDensity(input: ComposerDensityInput): ComposerDensity {
  if (input.isCollapsedMobile) {
    return "collapsed";
  }
  if (
    input.isNarrowViewport ||
    input.isDraftHero ||
    input.hasComposerHeader ||
    input.isPromptWrapped
  ) {
    return "tall";
  }
  return "slim";
}

/**
 * The prompt editor's line box at the fork's desktop composer type (14px/16px).
 * Only a fallback: the prompt is 16px on mobile to keep iOS from zooming on
 * focus, so the live check reads the element's own computed line-height.
 */
export const COMPOSER_PROMPT_LINE_HEIGHT_PX = 16;

/**
 * Wrapped means taller than one line plus half a line of slack. The slack
 * absorbs sub-pixel line-box rounding, which would otherwise flap the composer
 * between densities on a single line of text.
 */
export function isPromptHeightWrapped(
  promptHeightPx: number,
  lineHeightPx: number = COMPOSER_PROMPT_LINE_HEIGHT_PX,
): boolean {
  const lineHeight =
    Number.isFinite(lineHeightPx) && lineHeightPx > 0
      ? lineHeightPx
      : COMPOSER_PROMPT_LINE_HEIGHT_PX;
  return promptHeightPx > lineHeight * 1.5;
}

/**
 * Attribute toggled on the prompt editor when its content has actually hit
 * `max-height` and needs a scrollbar. See `isComposerPromptScrollable`.
 */
export const COMPOSER_PROMPT_SCROLLABLE_ATTR = "data-composer-prompt-scrollable";

/**
 * Whether the prompt editor should expose a vertical scrollbar.
 *
 * Upstream's `overflow-y: auto` is correct once the editor has hit `max-h-50`,
 * but the fork's 14px/16px line box lets Geist ink overflow the line box by a
 * pixel or two. That inflates `scrollHeight` above `clientHeight` on a single
 * unwrapped line, so `overflow-y: auto` paints a thumb with nothing to scroll.
 *
 * Compare against the capped max height, not against client height: glyph ink
 * on a short prompt is noise; content past the max is the real scroll case.
 */
export function isComposerPromptScrollable(input: {
  scrollHeightPx: number;
  maxHeightPx: number;
}): boolean {
  if (!Number.isFinite(input.maxHeightPx) || input.maxHeightPx <= 0) {
    return false;
  }
  if (!Number.isFinite(input.scrollHeightPx) || input.scrollHeightPx <= 0) {
    return false;
  }
  // 1px of slack absorbs sub-pixel scrollHeight rounding at the max edge.
  return input.scrollHeightPx > input.maxHeightPx + 1;
}

/**
 * The wrap latch, and the reason it has to exist.
 *
 * The two shells do not give the prompt the same width: slim shares its line
 * with the pills and the send button, leaving the editor roughly 460px at the
 * composer's 768px max, while tall hands it the full ~736px. So a prompt
 * between those two widths wraps in slim and fits in tall — and a density
 * derived straight from the measurement flips to tall, un-wraps, flips back to
 * slim, re-wraps, forever, pinning the main thread.
 *
 * Latching breaks the cycle: the wrap only ever turns on from a measurement,
 * and only an empty prompt turns it off. That also reads better than the
 * alternative, since a composer that snapped back to one line mid-sentence
 * would move the caret out from under the user.
 */
export function nextWrapLatch(input: {
  latched: boolean;
  measuredWrapped: boolean;
  isPromptEmpty: boolean;
}): boolean {
  if (input.isPromptEmpty) {
    return false;
  }
  return input.latched || input.measuredWrapped;
}
