import { describe, it, expect } from "vitest"
import {
  evaluateConditions,
  evaluateSingleCondition,
  evaluateFormulaExpression,
  getChartMarkers,
  getColorZones,
  getHighlightStyles,
  validateFormulaReferences,
} from "../../data_grid/condition_engine"
import type { Condition, DataTableRow } from "../../types/store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(time: number, close: number, extra: Record<string, number | string> = {}): DataTableRow {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100, ...extra }
}

function makeCond(
  id: string,
  type: string,
  column: string,
  value: number,
  options: Partial<{ enabled: boolean; compareColumn: string; expression: string }> = {},
): Condition {
  const { enabled = true, compareColumn, expression } = options
  return {
    id,
    name: `Condition ${id}`,
    enabled,
    rule: { type: type as Condition["rule"]["type"], column, value, compareColumn, expression },
    action: {},
  }
}

// ---------------------------------------------------------------------------
// evaluateSingleCondition — all rule types
// ---------------------------------------------------------------------------

describe("evaluateSingleCondition — value_gt / value_lt", () => {
  it("value_gt returns true when column > threshold", () => {
    const cond = makeCond("1", "value_gt", "close", 100)
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 100))).toBe(false)
    expect(evaluateSingleCondition(cond, makeRow(1, 90))).toBe(false)
  })

  it("value_lt returns true when column < threshold", () => {
    const cond = makeCond("1", "value_lt", "close", 100)
    expect(evaluateSingleCondition(cond, makeRow(1, 90))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 100))).toBe(false)
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(false)
  })
})

describe("evaluateSingleCondition — change_gt / change_lt", () => {
  it("change_gt behaves like value_gt", () => {
    const cond = makeCond("1", "change_gt", "close", 100)
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 90))).toBe(false)
  })

  it("change_lt behaves like value_lt", () => {
    const cond = makeCond("1", "change_lt", "close", 100)
    expect(evaluateSingleCondition(cond, makeRow(1, 90))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(false)
  })
})

describe("evaluateSingleCondition — between", () => {
  it("returns true when value in [threshold, compareColumn]", () => {
    const cond: Condition = {
      id: "b", name: "between", enabled: true,
      rule: { type: "between", column: "close", value: 90, compareColumn: "sma" },
      action: {},
    }
    expect(evaluateSingleCondition(cond, makeRow(1, 95, { sma: 100 }))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 85, { sma: 100 }))).toBe(false)
    expect(evaluateSingleCondition(cond, makeRow(1, 105, { sma: 100 }))).toBe(false)
  })
})

describe("evaluateSingleCondition — cross_above / cross_below", () => {
  it("cross_above: prev <= prev_cmp AND cur > cur_cmp", () => {
    const cond = makeCond("1", "cross_above", "close", 0, { compareColumn: "sma" })
    const prev = makeRow(1, 90, { sma: 95 })  // close(90) <= sma(95)
    const cur  = makeRow(2, 100, { sma: 97 }) // close(100) > sma(97)
    expect(evaluateSingleCondition(cond, cur, prev)).toBe(true)
  })

  it("cross_above: false when no cross", () => {
    const cond = makeCond("1", "cross_above", "close", 0, { compareColumn: "sma" })
    const prev = makeRow(1, 100, { sma: 95 })
    const cur  = makeRow(2, 110, { sma: 97 })
    expect(evaluateSingleCondition(cond, cur, prev)).toBe(false)
  })

  it("cross_above: false when prevRow is null", () => {
    const cond = makeCond("1", "cross_above", "close", 0, { compareColumn: "sma" })
    expect(evaluateSingleCondition(cond, makeRow(1, 100, { sma: 90 }))).toBe(false)
  })

  it("cross_below: prev >= prev_cmp AND cur < cur_cmp", () => {
    const cond = makeCond("1", "cross_below", "close", 0, { compareColumn: "sma" })
    const prev = makeRow(1, 100, { sma: 95 })
    const cur  = makeRow(2, 90, { sma: 97 })
    expect(evaluateSingleCondition(cond, cur, prev)).toBe(true)
  })
})

describe("evaluateSingleCondition — expression", () => {
  it("evaluates arithmetic expression", () => {
    const cond = makeCond("1", "expression", "close", 0, { expression: "close > 100" })
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 90))).toBe(false)
  })

  it("expression using col() reference", () => {
    const cond = makeCond("1", "expression", "close", 0, { expression: "col('sma') > 90" })
    expect(evaluateSingleCondition(cond, makeRow(1, 100, { sma: 95 }))).toBe(true)
    expect(evaluateSingleCondition(cond, makeRow(1, 100, { sma: 85 }))).toBe(false)
  })

  it("returns false for empty expression", () => {
    const cond = makeCond("1", "expression", "close", 0, { expression: "" })
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(false)
  })

  it("returns false for invalid expression", () => {
    const cond = makeCond("1", "expression", "close", 0, { expression: "INVALID_SYNTAX!!!" })
    expect(evaluateSingleCondition(cond, makeRow(1, 110))).toBe(false)
  })
})

describe("evaluateSingleCondition — missing column", () => {
  it("returns false when column missing from row", () => {
    const cond = makeCond("1", "value_gt", "nonexistent", 0)
    expect(evaluateSingleCondition(cond, makeRow(1, 100))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateConditions
// ---------------------------------------------------------------------------

describe("evaluateConditions", () => {
  it("returns empty map when no active conditions", () => {
    const rows = [makeRow(1, 110)]
    const result = evaluateConditions(rows, [makeCond("1", "value_gt", "close", 100, { enabled: false })])
    expect(result.size).toBe(0)
  })

  it("marks matching rows", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 120)]
    const result = evaluateConditions(rows, [makeCond("1", "value_gt", "close", 100)])
    expect(result.has(1)).toBe(false)
    expect(result.has(2)).toBe(true)
    expect(result.has(3)).toBe(true)
  })

  it("collects condition names and IDs", () => {
    const rows = [makeRow(1, 110)]
    const result = evaluateConditions(rows, [makeCond("c1", "value_gt", "close", 100)])
    expect(result.get(1)?.conditionIds).toContain("c1")
    expect(result.get(1)?.conditionNames).toContain("Condition c1")
  })
})

// ---------------------------------------------------------------------------
// evaluateFormulaExpression
// ---------------------------------------------------------------------------

describe("evaluateFormulaExpression", () => {
  it("evaluates simple arithmetic", () => {
    expect(evaluateFormulaExpression("1 + 2", makeRow(1, 100))).toBe(3)
  })

  it("evaluates using row columns", () => {
    expect(evaluateFormulaExpression("close * 2", makeRow(1, 50))).toBe(100)
  })

  it("evaluates col() references", () => {
    expect(evaluateFormulaExpression("col('sma') + 10", makeRow(1, 100, { sma: 90 }))).toBe(100)
  })

  it("evaluates arithmetic with multiple operators", () => {
    expect(evaluateFormulaExpression("(close - 80) * 2", makeRow(1, 100))).toBe(40)
    expect(evaluateFormulaExpression("high - low", makeRow(1, 100))).toBe(2) // high=101, low=99
  })

  it("returns null for invalid expressions", () => {
    expect(evaluateFormulaExpression("INVALID_SYNTAX(", makeRow(1, 100))).toBeNull()
  })

  it("returns null for non-finite results", () => {
    expect(evaluateFormulaExpression("1/0", makeRow(1, 100))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getChartMarkers
// ---------------------------------------------------------------------------

describe("getChartMarkers", () => {
  it("returns markers from chartMarker actions", () => {
    const matches = new Map()
    matches.set(100, {
      rowIndex: 0, time: 100,
      actions: [{ chartMarker: { color: "red", text: "X" } }],
      conditionNames: ["c"], conditionIds: ["1"],
    })
    const markers = getChartMarkers(matches)
    expect(markers).toHaveLength(1)
    expect(markers[0].color).toBe("red")
    expect(markers[0].text).toBe("X")
    expect(markers[0].time).toBe(100)
  })

  it("skips actions without chartMarker", () => {
    const matches = new Map()
    matches.set(100, {
      rowIndex: 0, time: 100,
      actions: [{}],
      conditionNames: ["c"], conditionIds: ["1"],
    })
    expect(getChartMarkers(matches)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getColorZones
// ---------------------------------------------------------------------------

describe("getColorZones", () => {
  it("returns color zones from chartColorZone actions", () => {
    const matches = new Map()
    matches.set(100, {
      rowIndex: 0, time: 100,
      actions: [{ chartColorZone: { color: "blue" } }],
      conditionNames: ["c"], conditionIds: ["1"],
    })
    const zones = getColorZones(matches)
    expect(zones).toHaveLength(1)
    expect(zones[0].color).toBe("blue")
  })
})

// ---------------------------------------------------------------------------
// getHighlightStyles
// ---------------------------------------------------------------------------

describe("getHighlightStyles", () => {
  it("generates CSS for row highlights", () => {
    const conditions: Condition[] = [
      {
        id: "c1", name: "test", enabled: true,
        rule: { type: "value_gt", column: "close", value: 0 },
        action: { rowHighlight: "#ff0000" },
      },
    ]
    const css = getHighlightStyles(conditions)
    expect(css).toContain(".data-grid-highlight-c1")
    expect(css).toContain("#ff0000")
  })

  it("excludes disabled conditions", () => {
    const conditions: Condition[] = [
      {
        id: "c1", name: "test", enabled: false,
        rule: { type: "value_gt", column: "close", value: 0 },
        action: { rowHighlight: "#ff0000" },
      },
    ]
    expect(getHighlightStyles(conditions)).toBe("")
  })

  it("excludes conditions without rowHighlight", () => {
    const conditions: Condition[] = [
      {
        id: "c1", name: "test", enabled: true,
        rule: { type: "value_gt", column: "close", value: 0 },
        action: {},
      },
    ]
    expect(getHighlightStyles(conditions)).toBe("")
  })
})

// ---------------------------------------------------------------------------
// validateFormulaReferences
// ---------------------------------------------------------------------------

describe("validateFormulaReferences", () => {
  it("returns null when all references are valid", () => {
    const valid = new Set(["close", "sma"])
    expect(validateFormulaReferences("close + sma", valid)).toBeNull()
  })

  it("returns invalid reference name", () => {
    const valid = new Set(["close"])
    const result = validateFormulaReferences("close + unknown_col", valid)
    expect(result).toBe("unknown_col")
  })

  it("ignores math function names", () => {
    const valid = new Set(["close"])
    expect(validateFormulaReferences("abs(close - 100)", valid)).toBeNull()
  })
})
