import { describe, expect, it } from "vite-plus/test";

import { evaluateNumericInput } from "./numericExpression";

describe("evaluateNumericInput", () => {
  it("reads plain numbers, including negatives and decimals", () => {
    expect(evaluateNumericInput("16", 0)).toBe(16);
    expect(evaluateNumericInput(" 12.5 ", 0)).toBe(12.5);
    // A leading minus is a negative VALUE, never a subtraction from the current one —
    // letter-spacing and margins take negatives.
    expect(evaluateNumericInput("-4", 100)).toBe(-4);
  });

  it("evaluates arithmetic with precedence and parentheses", () => {
    expect(evaluateNumericInput("100/2", 0)).toBe(50);
    expect(evaluateNumericInput("2*4", 0)).toBe(8);
    expect(evaluateNumericInput("16+8", 0)).toBe(24);
    expect(evaluateNumericInput("2+3*4", 0)).toBe(14);
    expect(evaluateNumericInput("(8+4)*2", 0)).toBe(24);
    expect(evaluateNumericInput("24-8-4", 0)).toBe(12);
  });

  it("treats a leading * or / as relative to the current value", () => {
    expect(evaluateNumericInput("*2", 16)).toBe(32);
    expect(evaluateNumericInput("/4", 16)).toBe(4);
  });

  it("rejects anything it can't resolve rather than guessing", () => {
    expect(evaluateNumericInput("", 10)).toBeNull();
    expect(evaluateNumericInput("auto", 10)).toBeNull();
    expect(evaluateNumericInput("16px", 10)).toBeNull();
    expect(evaluateNumericInput("(8+4", 10)).toBeNull();
    expect(evaluateNumericInput("8+4)", 10)).toBeNull();
    expect(evaluateNumericInput("8/0", 10)).toBeNull();
    expect(evaluateNumericInput("8+", 10)).toBeNull();
    expect(evaluateNumericInput("+", 10)).toBeNull();
    // No code execution path, however inviting the input looks.
    expect(evaluateNumericInput("alert(1)", 10)).toBeNull();
  });
});
