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
 * guard can pin media scoping without a coincidence-detector regex. A leaf
 * nested in a style rule comes back with its selector resolved against its
 * parents, so a guard reads a nested sheet as it would the flat one.
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
  // with the original text, which keeps selector slicing honest. Statement
  // at-rules (`@import …;`) go the same way: they end at a semicolon, not a
  // block, and left in place the walker would read everything up to the next
  // `{` — the first real selector included — as one at-rule header.
  return css
    .replace(/\/\*[\s\S]*?\*\//gu, (match) => " ".repeat(match.length))
    .replace(/@(?:import|charset|namespace|layer)[^;{]*;/gu, (match) => " ".repeat(match.length));
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

// Splits at commas outside parentheses and brackets.
function selectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(from, index).trim());
      from = index + 1;
    }
  }
  parts.push(selector.slice(from).trim());
  return parts;
}

// A nested selector written out against its parent, as the browser reads
// it: `&` is the parent, and a part without one descends from it. A parent
// list goes in :is(), which ranks as its most specific member.
function resolveNested(parent: string | null, selector: string): string {
  if (parent === null) return selector;
  const outer = selectorList(parent).length > 1 ? `:is(${parent})` : parent;
  return selectorList(selector)
    .map((part) => (part.includes("&") ? part.replaceAll("&", outer) : `${outer} ${part}`))
    .join(",\n");
}

function parseBlock(
  source: string,
  start: number,
  end: number,
  atRules: ReadonlyArray<string>,
  parent: string | null = null,
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
      rules.push(...parseBlock(source, open + 1, close, [...atRules, header], parent));
    } else if (!body.includes("{")) {
      rules.push({ selector: resolveNested(parent, header), body, atRules });
    } else {
      // A nesting parent: its children come back with their selectors
      // resolved against it. Declarations of its own beside them are not
      // recorded.
      rules.push(...parseBlock(source, open + 1, close, atRules, resolveNested(parent, header)));
    }
    index = close + 1;
  }

  return rules;
}

export function cssRules(css: string): ReadonlyArray<CssRule> {
  const source = stripComments(css);
  return parseBlock(source, 0, source.length, []);
}

/**
 * Body of the leaf rule whose whole selector equals the given parts joined as
 * a descendant selector (whitespace-normalized). Exact, not substring: a bare
 * `:root[data-fork].dark` must find the stage block, never a longer dark-scoped
 * selector that merely starts with it. Throws when no rule matches, so a guard
 * fails loudly rather than asserting against an empty string. Use this instead
 * of a per-file `selector { body }` regex — the naive regex is exactly what
 * breaks on `theme.custom.css` (see the module comment above).
 */
export function ruleBodyFor(
  rules: ReadonlyArray<CssRule>,
  selectorParts: readonly string[],
): string {
  const wanted = selectorParts.join(" ").replace(/\s+/gu, " ").trim();
  const rule = rules.find(
    (candidate) => candidate.selector.replace(/\s+/gu, " ").trim() === wanted,
  );
  if (rule === undefined) {
    throw new Error(`no rule found for selector: ${wanted}`);
  }
  return rule.body;
}

/** First 6-digit hex assigned to `prop` in a rule body. Throws when absent. */
export function declarationHex(body: string, prop: string): string {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}:\\s*(#[0-9a-f]{6})`, "iu").exec(body);
  const hex = match?.[1];
  if (hex === undefined) {
    throw new Error(`no ${prop} hex declaration in body: ${body.slice(0, 120)}`);
  }
  return hex.toLowerCase();
}

/** `#rrggbb` → [r, g, b] bytes. */
export function parseHex(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Headers of the top-level blocks, at-rules included, in source order. */
export function topLevelHeaders(css: string): ReadonlyArray<string> {
  const source = stripComments(css);
  const headers: string[] = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("{", index);
    if (open < 0) break;
    const close = matchingClose(source, open, source.length);
    if (close < 0) break;
    headers.push(source.slice(index, open).trim());
    index = close + 1;
  }
  return headers;
}
