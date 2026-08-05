/**
 * Figma's numeric fields take arithmetic, not just numbers: `100/2`, `2*4`, `(8+4)*2`. The
 * field pre-fills with the current value, so `16+8` is already the natural way to add — the
 * only relative shorthand is a leading `*` or `/` (`*2` halves nothing, doubles the value),
 * which no literal can start with. A leading `-` stays a NEGATIVE NUMBER, not a subtraction:
 * letter-spacing and margins take negatives, and guessing wrong there loses the user's value.
 *
 * A hand-rolled shunting-yard rather than `eval`/`new Function`: this parses text typed into
 * a panel inside an app that renders untrusted project pages, and there is no reason for a
 * spacing field to be able to run code.
 */

type Token = { kind: "number"; value: number } | { kind: "op"; value: string };

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Splits `"(8+4)*2"` into tokens; null on any character the grammar doesn't allow. */
function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index] ?? "";
    if (char === " ") {
      index += 1;
      continue;
    }
    if (char in PRECEDENCE || char === "(" || char === ")") {
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }
    const rest = input.slice(index);
    const match = /^\d*\.?\d+/u.exec(rest);
    if (!match) return null;
    tokens.push({ kind: "number", value: Number.parseFloat(match[0]) });
    index += match[0].length;
  }
  return tokens;
}

/** Unary minus/plus — rewritten to a binary op against 0 so the evaluator stays one shape. */
function normalizeUnary(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const [index, token] of tokens.entries()) {
    const previous = tokens[index - 1];
    const isUnary =
      token.kind === "op" &&
      (token.value === "-" || token.value === "+") &&
      (previous === undefined || (previous.kind === "op" && previous.value !== ")"));
    if (isUnary) out.push({ kind: "number", value: 0 });
    out.push(token);
  }
  return out;
}

function evaluate(tokens: Token[]): number | null {
  const values: number[] = [];
  const ops: string[] = [];

  const applyTop = (): boolean => {
    const op = ops.pop();
    const right = values.pop();
    const left = values.pop();
    if (op === undefined || right === undefined || left === undefined) return false;
    if (op === "/" && right === 0) return false;
    values.push(
      op === "+"
        ? left + right
        : op === "-"
          ? left - right
          : op === "*"
            ? left * right
            : left / right,
    );
    return true;
  };

  for (const token of tokens) {
    if (token.kind === "number") {
      values.push(token.value);
      continue;
    }
    if (token.value === "(") {
      ops.push(token.value);
      continue;
    }
    if (token.value === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        if (!applyTop()) return null;
      }
      if (ops.pop() !== "(") return null;
      continue;
    }
    const precedence = PRECEDENCE[token.value];
    if (precedence === undefined) return null;
    while (
      ops.length > 0 &&
      ops[ops.length - 1] !== "(" &&
      (PRECEDENCE[ops[ops.length - 1] ?? ""] ?? 0) >= precedence
    ) {
      if (!applyTop()) return null;
    }
    ops.push(token.value);
  }
  while (ops.length > 0) {
    if (ops[ops.length - 1] === "(") return null;
    if (!applyTop()) return null;
  }
  const result = values.pop();
  return values.length === 0 && result !== undefined && Number.isFinite(result) ? result : null;
}

/**
 * Resolves what the user typed to a number. `current` is the field's value, used as the left
 * operand for the `*`/`/` shorthand. Returns null when the entry isn't a number or a valid
 * expression — callers revert to the displayed value rather than committing a guess.
 */
export function evaluateNumericInput(input: string, current: number): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const expression = /^[*/]/u.test(trimmed) ? `${current}${trimmed}` : trimmed;
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;
  return evaluate(normalizeUnary(tokens));
}
