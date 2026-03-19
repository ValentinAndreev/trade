import { describe, expect, it } from "vitest"
import { collectConditionExpressionDiagnostics } from "../../system_editor/condition_expression"

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
