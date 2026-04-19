import { describe, it, expect } from "vitest"
import { resolveColumnValue, evaluateRule } from "../../../data_grid/engines/rule_evaluator"
import type { DataTableRow, ConditionRule } from "../../../types/store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(close: number, extra: Record<string, number | string> = {}): DataTableRow {
  return { time: 1, open: close, high: close + 1, low: close - 1, close, volume: 100, ...extra }
}

function rule(type: ConditionRule["type"], column: string, value: number, compareColumn?: string): ConditionRule {
  return { type, column, value, compareColumn }
}

// ---------------------------------------------------------------------------
// resolveColumnValue
// ---------------------------------------------------------------------------

describe("resolveColumnValue", () => {
  it("returns numeric column value", () => {
    expect(resolveColumnValue(makeRow(100), "close")).toBe(100)
  })

  it("returns null for missing column", () => {
    expect(resolveColumnValue(makeRow(100), "nonexistent")).toBeNull()
  })

  it("returns null for null column value", () => {
    const row = makeRow(100)
    ;(row as Record<string, unknown>).sma = null
    expect(resolveColumnValue(row, "sma")).toBeNull()
  })

  it("returns null for non-finite value", () => {
    const row = makeRow(100, { sma: Infinity })
    expect(resolveColumnValue(row, "sma")).toBeNull()
  })

  it("returns null for NaN", () => {
    const row = makeRow(100, { sma: NaN })
    expect(resolveColumnValue(row, "sma")).toBeNull()
  })

  it("coerces numeric string to number", () => {
    const row = makeRow(100, { sma: "95.5" })
    expect(resolveColumnValue(row, "sma")).toBe(95.5)
  })

  it("returns null for non-numeric string", () => {
    const row = makeRow(100, { label: "text" })
    expect(resolveColumnValue(row, "label")).toBeNull()
  })

  it("returns 0 for zero value (not null)", () => {
    const row = makeRow(100, { sma: 0 })
    expect(resolveColumnValue(row, "sma")).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// evaluateRule — value_gt / value_lt
// ---------------------------------------------------------------------------

describe("evaluateRule — value_gt / value_lt", () => {
  it("value_gt: true when close > threshold", () => {
    expect(evaluateRule(rule("value_gt", "close", 100), makeRow(101), null)).toBe(true)
    expect(evaluateRule(rule("value_gt", "close", 100), makeRow(100), null)).toBe(false)
    expect(evaluateRule(rule("value_gt", "close", 100), makeRow(99), null)).toBe(false)
  })

  it("value_lt: true when close < threshold", () => {
    expect(evaluateRule(rule("value_lt", "close", 100), makeRow(99), null)).toBe(true)
    expect(evaluateRule(rule("value_lt", "close", 100), makeRow(100), null)).toBe(false)
    expect(evaluateRule(rule("value_lt", "close", 100), makeRow(101), null)).toBe(false)
  })

  it("change_gt and change_lt behave same as value variants", () => {
    expect(evaluateRule(rule("change_gt", "close", 100), makeRow(110), null)).toBe(true)
    expect(evaluateRule(rule("change_lt", "close", 100), makeRow(90), null)).toBe(true)
  })

  it("returns false when column is missing", () => {
    expect(evaluateRule(rule("value_gt", "nonexistent", 100), makeRow(110), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateRule — between
// ---------------------------------------------------------------------------

describe("evaluateRule — between", () => {
  it("true when value in [threshold, compareColumn]", () => {
    const r = rule("between", "close", 90, "sma")
    expect(evaluateRule(r, makeRow(95, { sma: 100 }), null)).toBe(true)
  })

  it("false when value below lower bound", () => {
    const r = rule("between", "close", 90, "sma")
    expect(evaluateRule(r, makeRow(85, { sma: 100 }), null)).toBe(false)
  })

  it("false when value above upper bound", () => {
    const r = rule("between", "close", 90, "sma")
    expect(evaluateRule(r, makeRow(105, { sma: 100 }), null)).toBe(false)
  })

  it("true at lower bound (inclusive)", () => {
    const r = rule("between", "close", 90, "sma")
    expect(evaluateRule(r, makeRow(90, { sma: 100 }), null)).toBe(true)
  })

  it("true at upper bound (inclusive)", () => {
    const r = rule("between", "close", 90, "sma")
    expect(evaluateRule(r, makeRow(100, { sma: 100 }), null)).toBe(true)
  })

  it("false when compareColumn is missing", () => {
    const r = rule("between", "close", 90, "missing_col")
    expect(evaluateRule(r, makeRow(95), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateRule — cross_above / cross_below
// ---------------------------------------------------------------------------

describe("evaluateRule — cross_above", () => {
  const r = rule("cross_above", "close", 0, "sma")

  it("true: prev close <= prev sma AND cur close > cur sma", () => {
    const prev = makeRow(90, { sma: 95 })
    const cur  = makeRow(100, { sma: 97 })
    expect(evaluateRule(r, cur, prev)).toBe(true)
  })

  it("false: no cross — both above", () => {
    const prev = makeRow(100, { sma: 95 })
    const cur  = makeRow(110, { sma: 97 })
    expect(evaluateRule(r, cur, prev)).toBe(false)
  })

  it("false: no cross — both below", () => {
    const prev = makeRow(85, { sma: 95 })
    const cur  = makeRow(88, { sma: 97 })
    expect(evaluateRule(r, cur, prev)).toBe(false)
  })

  it("false: prevRow is null", () => {
    expect(evaluateRule(r, makeRow(100, { sma: 90 }), null)).toBe(false)
  })

  it("false: compareColumn missing", () => {
    const noCol = rule("cross_above", "close", 0)
    const prev = makeRow(90, { sma: 95 })
    const cur  = makeRow(100, { sma: 97 })
    expect(evaluateRule(noCol, cur, prev)).toBe(false)
  })

  it("false: sma missing from row", () => {
    expect(evaluateRule(r, makeRow(100), makeRow(90))).toBe(false)
  })
})

describe("evaluateRule — cross_below", () => {
  const r = rule("cross_below", "close", 0, "sma")

  it("true: prev close >= prev sma AND cur close < cur sma", () => {
    const prev = makeRow(100, { sma: 95 })
    const cur  = makeRow(90, { sma: 97 })
    expect(evaluateRule(r, cur, prev)).toBe(true)
  })

  it("false: no cross", () => {
    const prev = makeRow(80, { sma: 95 })
    const cur  = makeRow(85, { sma: 97 })
    expect(evaluateRule(r, cur, prev)).toBe(false)
  })

  it("false: prevRow is null", () => {
    expect(evaluateRule(r, makeRow(90, { sma: 95 }), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateRule — unknown type
// ---------------------------------------------------------------------------

describe("evaluateRule — unknown type", () => {
  it("returns false for unknown rule type", () => {
    const r = rule("expression" as never, "close", 100)
    expect(evaluateRule(r, makeRow(110), null)).toBe(false)
  })
})
