import { beforeAll, describe, expect, it } from "vitest"
import type { ResearchConditionExpressionMetadata } from "../../research/dsl"
import {
  collectConditionExpressionDiagnostics,
  setConditionExpressionMetadata,
} from "../../system_editor/condition_expression"

const TEST_CONDITION_EXPRESSION_METADATA: ResearchConditionExpressionMetadata = {
  root_requirement: "Condition expressions must evaluate to a boolean comparison",
  operators: [
    { symbol: "&&", category: "logical", label: "Logical and", precedence: 2, register_in_frontend_parser: false },
    { symbol: "||", category: "logical", label: "Logical or", precedence: 1, register_in_frontend_parser: false },
    { symbol: "<<", category: "comparison", label: "Cross below", precedence: 6, register_in_frontend_parser: true },
    { symbol: ">>", category: "comparison", label: "Cross above", precedence: 6, register_in_frontend_parser: true },
    { symbol: "<", category: "comparison", label: "Less than", precedence: 6, register_in_frontend_parser: false },
    { symbol: ">", category: "comparison", label: "Greater than", precedence: 6, register_in_frontend_parser: false },
    { symbol: "<=", category: "comparison", label: "Less or equal", precedence: 6, register_in_frontend_parser: false },
    { symbol: ">=", category: "comparison", label: "Greater or equal", precedence: 6, register_in_frontend_parser: false },
    { symbol: "+", category: "arithmetic", label: "Addition", precedence: 9, register_in_frontend_parser: false },
    { symbol: "-", category: "arithmetic", label: "Subtraction", precedence: 9, register_in_frontend_parser: false },
    { symbol: "*", category: "arithmetic", label: "Multiplication", precedence: 10, register_in_frontend_parser: false },
    { symbol: "/", category: "arithmetic", label: "Division", precedence: 10, register_in_frontend_parser: false },
  ],
  functions: [
    {
      name: "abs",
      label: "Absolute value",
      signature: "abs(x)",
      description: "Absolute value",
      min_args: 1,
      max_args: 1,
      return_kind: "numeric",
      numeric_arguments: true,
      positive_integer_literal_indexes: [],
    },
    {
      name: "min",
      label: "Minimum",
      signature: "min(a, b, ...)",
      description: "Smallest value",
      min_args: 2,
      max_args: null,
      return_kind: "numeric",
      numeric_arguments: true,
      positive_integer_literal_indexes: [],
    },
    {
      name: "max",
      label: "Maximum",
      signature: "max(a, b, ...)",
      description: "Largest value",
      min_args: 2,
      max_args: null,
      return_kind: "numeric",
      numeric_arguments: true,
      positive_integer_literal_indexes: [],
    },
    {
      name: "prev",
      label: "Previous bar value",
      signature: "prev(x)",
      description: "Value from 1 bar ago",
      min_args: 1,
      max_args: 1,
      return_kind: "numeric",
      numeric_arguments: true,
      positive_integer_literal_indexes: [],
    },
    {
      name: "offset",
      label: "Value N bars back",
      signature: "offset(x, n)",
      description: "Value from n bars ago",
      min_args: 2,
      max_args: 2,
      return_kind: "numeric",
      numeric_arguments: true,
      positive_integer_literal_indexes: [1],
    },
  ],
  references: {
    candle_fields: ["open", "high", "low", "close", "volume"],
    module_output: "<module>.value",
    params_prefix: "params.<key>",
  },
}

beforeAll(() => {
  setConditionExpressionMetadata(TEST_CONDITION_EXPRESSION_METADATA)
})

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

  it("rejects arithmetic expressions that do not produce a boolean condition", () => {
    const yaml = [
      "conditions:",
      '  long_entry: "close + ema.value"',
    ].join("\n")

    expect(collectConditionExpressionDiagnostics(yaml)).toEqual([
      expect.objectContaining({
        message: "Condition expressions must evaluate to a boolean comparison",
        line: 2,
        column: 16,
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

  it("accepts arithmetic on the right side of a comparison", () => {
    expect(accepts("ema_fast.value >> ema_slow.value - 100")).toBe(true)
  })

  it("accepts arithmetic precedence with parentheses", () => {
    expect(accepts("close > (ema_fast.value + ema_slow.value) / 2")).toBe(true)
  })

  it("accepts unary minus inside arithmetic expressions", () => {
    expect(accepts("close > -(ema.value - 5)")).toBe(true)
  })

  it("accepts abs/min/max helper functions", () => {
    expect(accepts("abs(close - ema.value) >= min(4, max(2, slow.value - ema.value))")).toBe(true)
  })

  it("accepts prev and offset helper functions", () => {
    expect(accepts("close > max(prev(close), offset(close, 2))")).toBe(true)
  })

  // --- Expressions that BOTH parsers must reject ---

  it("rejects bare arithmetic expression +", () => {
    expect(rejects("close + ema.value")).toBe(true)
  })

  it("rejects bare arithmetic expression -", () => {
    expect(rejects("close - ema.value")).toBe(true)
  })

  it("rejects bare arithmetic expression *", () => {
    expect(rejects("close * ema.value")).toBe(true)
  })

  it("rejects bare arithmetic expression /", () => {
    expect(rejects("close / ema.value")).toBe(true)
  })

  it("rejects string literals", () => {
    expect(rejects("close >> 'hello'")).toBe(true)
  })

  it("rejects syntax error: unmatched parenthesis", () => {
    expect(rejects("(close >> ema.value")).toBe(true)
  })

  it("rejects unsupported helper functions", () => {
    expect(rejects("close > foo(close)")).toBe(true)
  })

  it("rejects offset with a dynamic second argument", () => {
    expect(rejects("close > offset(close, ema.value)")).toBe(true)
  })

  it("rejects logical expressions with numeric branches", () => {
    expect(rejects("close > ema.value && close")).toBe(true)
  })

  it("rejects arithmetic expressions with boolean sub-expressions", () => {
    expect(rejects("close > ema.value + (rsi.value > 50)")).toBe(true)
  })

  it("rejects numeric helper functions called with boolean arguments", () => {
    expect(rejects("close > abs((rsi.value > 50))")).toBe(true)
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
