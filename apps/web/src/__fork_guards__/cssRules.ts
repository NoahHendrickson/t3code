/**
 * A minimal CSS rule reader for the fork guards.
 *
 * Guards that ask "is this declaration scoped?" have to read a rule's own
 * selector. Two earlier attempts got this wrong in ways worth recording:
 *
 * - Asking whether the fork marker appears *earlier in the file* than a given
 *   line passes for anything below the first marker block, scoped or not.
 * - A regex over `selector { body }` breaks on `theme.custom.css` specifically,
 *   because it holds `@keyframes` — nested blocks whose inner braces make the
 *   naive match swallow the wrong span — and comments that contain braces.
 *
 * So: strip comments, then walk the braces, and return only leaf rules (blocks
 * whose body contains no further block). Every selector a fork guard cares
 * about is a leaf; the at-rules that are not are exactly the ones to skip.
 *
 * This is not a CSS parser and does not want to be. It is enough to answer
 * "which selector does this declaration sit under", which is the only question
 * the guards ask.
 */

export interface CssRule {
  /** Everything between the previous block and this one's `{`, trimmed. */
  readonly selector: string;
  /** The declarations, verbatim. */
  readonly body: string;
}

function stripComments(css: string): string {
  // Replaced with spaces rather than removed so every offset still lines up
  // with the original text, which keeps selector slicing honest.
  return css.replace(/\/\*[\s\S]*?\*\//gu, (match) => " ".repeat(match.length));
}

export function cssRules(css: string): ReadonlyArray<CssRule> {
  const source = stripComments(css);
  const rules: CssRule[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "{") continue;

    const close = source.indexOf("}", index);
    if (close < 0) break;

    const body = source.slice(index + 1, close);
    // A nested block: this `{` opens an at-rule, so its "body" is another
    // selector. Step inside rather than recording it.
    if (body.includes("{")) continue;

    const previousBoundary = Math.max(
      source.lastIndexOf("}", index - 1),
      source.lastIndexOf("{", index - 1),
    );
    rules.push({
      selector: source.slice(previousBoundary + 1, index).trim(),
      body,
    });
    index = close;
  }

  return rules;
}
