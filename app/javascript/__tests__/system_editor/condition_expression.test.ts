import { describe, expect, it } from "vitest"
import { collectConditionExpressionDiagnostics } from "../../system_editor/condition_expression"

// ---------------------------------------------------------------------------
// Basic diagnostics
// ---------------------------------------------------------------------------

describe("system editor condition expression diagnostics", () => {
  it("accepts valid quoted condition expressions", () => {
    const yaml = [
      "conditions:",
      '  long_entry: "(ema.value << close) && ((sentiment.value < 100) || (rsi.value > 90))"',
    ].join("\n")

    expect(collectConditionExpressionDiagnostics(yaml)).toEqual([])
  })

  it("reports syntax errors with yaml coordinates", () => {
    const yaml = [
      "conditions:",
      '  long_entry: "(ema.value << close) &&)"',
    ].join("\n")

    expect(collectConditionExpressionDiagnostics(yaml)).toEqual([
      expect.objectContaining({
        line: 2,
        column: 39,
        code: "condition_expression_syntax",
      }),
    ])
  })

  it("reports unsupported operators immediately", () => {
    const yaml = [
      "conditions:",
      '  long_entry: "close + ema.value"',
    ].join("\n")

    expect(collectConditionExpressionDiagnostics(yaml)).toEqual([
      expect.objectContaining({
        message: "Unsupported operator: +",
        line: 2,
        column: 22,
        code: "condition_expression_syntax",
      }),
    ])
  })
})

// ---------------------------------------------------------------------------
// Parity cases — these expressions must produce the same valid/invalid
// verdict in the frontend (jsep) and the backend (Ruby Parser).
// If you add an operator or feature to one side, add a test here.
// ---------------------------------------------------------------------------

describe("frontend/backend parser parity", () => {
  function accepts(expression: string) {
    const yaml = `conditions:\n  cond: "${expression}"`
    return collectConditionExpressionDiagnostics(yaml).length === 0
  }

  function rejects(expression: string) {
    const yaml = `conditions:\n  cond: "${expression}"`
    return collectConditionExpressionDiagnostics(yaml).length > 0
  }

  // --- Expressions that BOTH parsers must accept ---

  it("accepts simple comparison: close >> ema.value", () => {
    expect(accepts("close >> ema.value")).toBe(true)
  })

  it("accepts simple comparison: close << ema.value", () => {
    expect(accepts("close << ema.value")).toBe(true)
  })

  it("accepts simple comparison: rsi.value > 70", () => {
    expect(accepts("rsi.value > 70")).toBe(true)
  })

  it("accepts simple comparison: rsi.value < 30", () => {
    expect(accepts("rsi.value < 30")).toBe(true)
  })

  it("accepts simple comparison: rsi.value >= 50", () => {
    expect(accepts("rsi.value >= 50")).toBe(true)
  })

  it("accepts simple comparison: rsi.value <= 50", () => {
    expect(accepts("rsi.value <= 50")).toBe(true)
  })

  it("accepts logical AND of two comparisons", () => {
    expect(accepts("close >> ema.value && rsi.value < 70")).toBe(true)
  })

  it("accepts logical OR of two comparisons", () => {
    expect(accepts("close >> ema.value || rsi.value > 30")).toBe(true)
  })

  it("accepts parenthesised sub-expressions", () => {
    expect(accepts("(close >> ema.value) && (rsi.value < 70)")).toBe(true)
  })

  it("accepts params reference: rsi.value << params.lower_threshold", () => {
    expect(accepts("rsi.value << params.lower_threshold")).toBe(true)
  })

  it("accepts numeric literal on right side", () => {
    expect(accepts("rsi.value > 30.5")).toBe(true)
  })

  it("accepts chained AND/OR", () => {
    expect(accepts("(a.value >> b.value) && (c.value < 100) || (d.value > 0)")).toBe(true)
  })

  // --- Expressions that BOTH parsers must reject ---

  it("rejects unsupported arithmetic operator +", () => {
    expect(rejects("close + ema.value")).toBe(true)
  })

  it("rejects unsupported arithmetic operator -", () => {
    expect(rejects("close - ema.value")).toBe(true)
  })

  it("rejects unsupported arithmetic operator *", () => {
    expect(rejects("close * ema.value")).toBe(true)
  })

  it("rejects unsupported arithmetic operator /", () => {
    expect(rejects("close / ema.value")).toBe(true)
  })

  it("rejects string literals", () => {
    expect(rejects("close >> 'hello'")).toBe(true)
  })

  it("rejects syntax error: unmatched parenthesis", () => {
    expect(rejects("(close >> ema.value")).toBe(true)
  })

  it("reports an error for a quoted empty expression", () => {
    // The frontend extractor picks up the empty string inside quotes and jsep
    // raises a parse error; the backend Validator rejects an empty condition
    // at the structure validation layer before reaching the parser.
    const yaml = 'conditions:\n  cond: ""'
    expect(collectConditionExpressionDiagnostics(yaml)).toEqual([
      expect.objectContaining({ code: "condition_expression_syntax" }),
    ])
  })
})
