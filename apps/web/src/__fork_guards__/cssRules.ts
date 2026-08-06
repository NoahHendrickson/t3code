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
 * about is a leaf; the at-rules that wrap them are recorded on `atRules` so a
 * guard can pin media scoping without a coincidence-detector regex.
 *
 * This is not a CSS parser and does not want to be. It is enough to answer
 * "which selector does this declaration sit under" and "which at-rules wrap
 * it", which are the only questions the guards ask.
 */

export interface CssRule {
  /** Everything between the previous block and this one's `{`, trimmed. */
  readonly selector: string;
  /** The declarations, verbatim. */
  readonly body: string;
  /** Enclosing at-rule headers, outermost first (e.g. `@media (width >= 40rem)`). */
  readonly atRules: ReadonlyArray<string>;
}

function stripComments(css: string): string {
  // Replaced with spaces rather than removed so every offset still lines up
  // with the original text, which keeps selector slicing honest.
  return css.replace(/\/\*[\s\S]*?\*\//gu, (match) => " ".repeat(match.length));
}

function matchingClose(source: string, open: number, end: number): number {
  let depth = 1;
  for (let index = open + 1; index < end; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseBlock(
  source: string,
  start: number,
  end: number,
  atRules: ReadonlyArray<string>,
): CssRule[] {
  const rules: CssRule[] = [];
  let index = start;

  while (index < end) {
    const open = source.indexOf("{", index);
    if (open < 0 || open >= end) break;

    const previousBoundary = Math.max(
      start - 1,
      source.lastIndexOf("}", open - 1),
      source.lastIndexOf("{", open - 1),
    );
    const header = source.slice(previousBoundary + 1, open).trim();
    const close = matchingClose(source, open, end);
    if (close < 0) break;

    const body = source.slice(open + 1, close);
    if (header.startsWith("@")) {
      rules.push(...parseBlock(source, open + 1, close, [...atRules, header]));
    } else if (!body.includes("{")) {
      rules.push({ selector: header, body, atRules });
    } else {
      // Nested non-at block (not used by theme.custom.css today). Step inside
      // without recording the outer selector, same as the previous walker.
      rules.push(...parseBlock(source, open + 1, close, atRules));
    }
    index = close + 1;
  }

  return rules;
}

export function cssRules(css: string): ReadonlyArray<CssRule> {
  const source = stripComments(css);
  return parseBlock(source, 0, source.length, []);
}
