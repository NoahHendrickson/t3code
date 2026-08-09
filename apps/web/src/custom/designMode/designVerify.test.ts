import { describe, expect, it } from "vite-plus/test";

import { verifySummaryLine } from "./designSentPreviews";
import {
  DESIGN_MODE_CONSOLE_PREFIX,
  parseDesignModeConsoleMessage,
  parseVerifyReport,
  summarizeVerifyReport,
  verdictFor,
  type DesignVerifyReport,
} from "./protocol";

/**
 * The verification layer's pure core. Every way of getting a verdict wrong is a way of
 * inventing a claim about the user's page — the exact thing this feature exists to stop —
 * so the precedence rules, the counting rules and the untrusted-input boundary each get
 * pinned behaviorally here, DOM-free.
 */

describe("verdictFor", () => {
  const base = {
    beforeCss: "8px",
    afterCss: "32px",
    intentShaped: false,
    inlineAuthored: false,
    viewportChanged: false,
  };

  it("reads the asked-for value as applied", () => {
    expect(verdictFor({ ...base, measured: "32px" })).toEqual({
      verdict: "applied",
      actual: "32px",
    });
  });

  it("reads the send-time before as unchanged — the ask did not land", () => {
    expect(verdictFor({ ...base, measured: "8px" })).toEqual({
      verdict: "unchanged",
      actual: "8px",
    });
  });

  it("reads anything else as diverged, carrying what the page shows", () => {
    expect(verdictFor({ ...base, measured: "16px" })).toEqual({
      verdict: "diverged",
      actual: "16px",
    });
  });

  it("a viewport change downgrades MISMATCHES only — a match still verifies", () => {
    // A changed pane size cannot manufacture the asked-for value, so applied survives:
    // one splitter drag must not void the checks a user could still act on.
    expect(verdictFor({ ...base, viewportChanged: true, measured: "32px" })).toEqual({
      verdict: "applied",
      actual: "32px",
    });
    // A DIFFERING value under different conditions proves nothing, in either direction.
    expect(verdictFor({ ...base, viewportChanged: true, measured: "8px" })).toEqual({
      verdict: "unverifiable",
      actual: null,
      reason: "viewport",
    });
    expect(verdictFor({ ...base, viewportChanged: true, measured: "16px" })).toEqual({
      verdict: "unverifiable",
      actual: null,
      reason: "viewport",
    });
  });

  it("an intent-shaped ask gets a non-answer, not a guess — even when strings match", () => {
    // `auto` computes to a px measurement — exact-match verification would judge the
    // wrong thing, so the honest verdict is a fourth state the user can read.
    expect(verdictFor({ ...base, intentShaped: true, measured: "32px" })).toEqual({
      verdict: "unverifiable",
      actual: null,
      reason: "intent",
    });
  });

  it("a page-authored inline property is never judged", () => {
    // The draft overwrote the page's own inline declaration: suppression cannot read the
    // page's value without guessing (restoring the recorded original pins a possibly-stale
    // value; removing the slot deletes the page's declaration too). Honest answer: neither
    // — even when the measured string happens to equal the ask.
    expect(verdictFor({ ...base, inlineAuthored: true, measured: "32px" })).toEqual({
      verdict: "unverifiable",
      actual: null,
      reason: "inline",
    });
  });

  it("the degenerate before == after case reads as applied, not unchanged", () => {
    // The builder filters no-ops, but storage could resurrect one; the harmless verdict
    // (and the harmless action: drop a redundant preview) must win.
    expect(verdictFor({ ...base, beforeCss: "32px", measured: "32px" })).toEqual({
      verdict: "applied",
      actual: "32px",
    });
  });
});

const report = (overrides: Partial<DesignVerifyReport> = {}): DesignVerifyReport => ({
  viewportChanged: false,
  truncated: false,
  elements: [
    {
      tag: "div",
      sourceLabel: "App.tsx:5",
      missing: false,
      checks: [
        { property: "padding-inline", expected: "32px", verdict: "applied", actual: "32px" },
        {
          property: "color",
          expected: "rgb(0, 0, 0)",
          verdict: "unchanged",
          actual: "rgb(1, 1, 1)",
        },
      ],
      structuralOps: 1,
    },
    { tag: "button", sourceLabel: null, missing: true, checks: [], structuralOps: 0 },
  ],
  ...overrides,
});

describe("summarizeVerifyReport", () => {
  it("counts verdicts, structural ops as unverifiable, and a missing element once", () => {
    expect(summarizeVerifyReport(report())).toEqual({
      applied: 1,
      unchanged: 1,
      diverged: 0,
      unverifiable: 1,
      missing: 1,
    });
  });
});

describe("verifySummaryLine", () => {
  it("names each non-zero count in the shared vocabulary and skips the zeros", () => {
    expect(
      verifySummaryLine({ applied: 2, unchanged: 1, diverged: 0, unverifiable: 1, missing: 1 }),
    ).toBe("2 landed · 1 didn't land · 1 can't be checked · 1 gone from the page");
  });

  it("says nothing when there is nothing to say", () => {
    expect(
      verifySummaryLine({ applied: 0, unchanged: 0, diverged: 0, unverifiable: 0, missing: 0 }),
    ).toBe("");
  });
});

describe("parseVerifyReport", () => {
  it("round-trips a well-formed report", () => {
    expect(parseVerifyReport(JSON.parse(JSON.stringify(report())))).toEqual(report());
  });

  it("rides the console-message envelope as the verdict variant", () => {
    const line = DESIGN_MODE_CONSOLE_PREFIX + JSON.stringify({ type: "verdict", report: report() });
    expect(parseDesignModeConsoleMessage(line)).toEqual({ type: "verdict", report: report() });
  });

  it("parses the sent-resolved envelope", () => {
    const line = DESIGN_MODE_CONSOLE_PREFIX + JSON.stringify({ type: "sent-resolved" });
    expect(parseDesignModeConsoleMessage(line)).toEqual({ type: "sent-resolved" });
  });

  it("rejects a verdict outside the closed set — console lines are page-forgeable", () => {
    const forged = report({
      elements: [
        {
          tag: "div",
          sourceLabel: null,
          missing: false,
          checks: [
            {
              property: "color",
              expected: "red",
              verdict: "definitely-applied" as never,
              actual: null,
            },
          ],
          structuralOps: 0,
        },
      ],
    });
    expect(parseVerifyReport(JSON.parse(JSON.stringify(forged)))).toBeNull();
  });

  it("rejects cross-field combinations measure() cannot produce", () => {
    const withCheck = (check: Record<string, unknown>, viewportChanged = false) => ({
      viewportChanged,
      truncated: false,
      elements: [
        { tag: "div", sourceLabel: null, missing: false, checks: [check], structuralOps: 0 },
      ],
    });
    // An applied verdict with nothing measured is an invented claim, not a shape quirk.
    expect(
      parseVerifyReport(
        withCheck({ property: "color", expected: "red", verdict: "applied", actual: null }),
      ),
    ).toBeNull();
    // Unverifiable measured nothing, and always says why.
    expect(
      parseVerifyReport(
        withCheck({ property: "color", expected: "red", verdict: "unverifiable", actual: "red" }),
      ),
    ).toBeNull();
    expect(
      parseVerifyReport(
        withCheck({ property: "color", expected: "red", verdict: "unverifiable", actual: null }),
      ),
    ).toBeNull();
    // The viewport reason can only exist inside a report that says the viewport changed.
    expect(
      parseVerifyReport(
        withCheck({
          property: "color",
          expected: "red",
          verdict: "unverifiable",
          actual: null,
          reason: "viewport",
        }),
      ),
    ).toBeNull();
    expect(
      parseVerifyReport(
        withCheck(
          {
            property: "color",
            expected: "red",
            verdict: "unverifiable",
            actual: null,
            reason: "viewport",
          },
          true,
        ),
      ),
    ).not.toBeNull();
  });

  it("rejects checks smuggled in beside a missing flag", () => {
    // summarize counts a missing element once and skips its checks — a forged line could
    // hide N real checks behind the flag. Reject the combination outright.
    expect(
      parseVerifyReport({
        viewportChanged: false,
        truncated: false,
        elements: [
          {
            tag: "div",
            sourceLabel: null,
            missing: true,
            checks: [{ property: "color", expected: "red", verdict: "unchanged", actual: "blue" }],
            structuralOps: 0,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects an oversized report rather than admitting it into host state", () => {
    const elements = Array.from({ length: 101 }, () => ({
      tag: "div",
      sourceLabel: null,
      missing: true,
      checks: [],
      structuralOps: 0,
    }));
    expect(parseVerifyReport({ viewportChanged: false, truncated: false, elements })).toBeNull();
  });

  it("rejects malformed shapes wholesale", () => {
    expect(parseVerifyReport(null)).toBeNull();
    expect(parseVerifyReport({ viewportChanged: false, elements: [] })).toBeNull();
    expect(
      parseVerifyReport({ viewportChanged: "yes", truncated: false, elements: [] }),
    ).toBeNull();
  });
});
