import type { Condition, ConditionAction } from "../types/store"

export interface ConditionMatch {
  rowIndex: number
  time: number
  actions: ConditionAction[]
  conditionNames: string[]
}

export function evaluateConditions(
  rows: Array<Record<string, any>>,
  conditions: Condition[],
): Map<number, ConditionMatch> {
  const active = conditions.filter(c => c.enabled)
  if (!active.length) return new Map()

  const matches = new Map<number, ConditionMatch>()

  rows.forEach((row, idx) => {
    const prevRow = idx > 0 ? rows[idx - 1] : null
    const triggered: Array<{ cond: Condition; action: ConditionAction }> = []

    for (const cond of active) {
      if (evaluateSingleCondition(cond, row, prevRow)) {
        triggered.push({ cond, action: cond.action })
      }
    }

    if (triggered.length && row.time != null) {
      matches.set(row.time, {
        rowIndex: idx,
        time: row.time,
        actions: triggered.map(t => t.action),
        conditionNames: triggered.map(t => t.cond.name),
      })
    }
  })

  return matches
}

export function evaluateSingleCondition(
  condition: Condition,
  row: Record<string, any>,
  prevRow: Record<string, any> | null = null,
): boolean {
  const { rule } = condition
  const colValue = resolveColumnValue(row, rule.column)
  if (colValue == null) return false

  const threshold = rule.value

  switch (rule.type) {
    case "value_gt":
      return colValue > threshold
    case "value_lt":
      return colValue < threshold
    case "change_gt":
      return colValue > threshold
    case "change_lt":
      return colValue < threshold
    case "between": {
      const upper = rule.compareColumn ? resolveColumnValue(row, rule.compareColumn) : threshold
      return upper != null && colValue >= threshold && colValue <= upper
    }
    case "cross_above": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCompare = resolveColumnValue(row, rule.compareColumn)
      const prevCompare = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCompare == null || prevCompare == null) return false
      return prevVal <= prevCompare && colValue > curCompare
    }
    case "cross_below": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCompare = resolveColumnValue(row, rule.compareColumn)
      const prevCompare = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCompare == null || prevCompare == null) return false
      return prevVal >= prevCompare && colValue < curCompare
    }
    case "expression": {
      if (!rule.expression) return false
      return evaluateExpression(rule.expression, row)
    }
    default:
      return false
  }
}

function resolveColumnValue(row: Record<string, any>, column: string): number | null {
  const v = row[column]
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const MATH_CONTEXT = "{abs,sqrt,min,max,pow,log,floor,ceil,round,sign,PI,E}=Math"

const RESERVED_IDENTIFIERS = new Set([
  "abs", "sqrt", "min", "max", "pow", "log", "floor", "ceil", "round", "sign", "PI", "E",
])

/**
 * Extracts column names referenced in a formula (col('name') and bare identifiers).
 */
export function getFormulaColumnReferences(expr: string): string[] {
  const refs = new Set<string>()
  const colCalls = expr.matchAll(/col\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
  for (const m of colCalls) refs.add(m[1].trim())
  const words = expr.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)
  for (const m of words) {
    const w = m[1]
    if (!RESERVED_IDENTIFIERS.has(w)) refs.add(w)
  }
  return [...refs]
}

/**
 * Returns the first column name in the formula that is not in validKeys, or null if all are valid.
 */
export function validateFormulaReferences(expr: string, validKeys: Set<string>): string | null {
  for (const ref of getFormulaColumnReferences(expr)) {
    if (!validKeys.has(ref)) return ref
  }
  return null
}

function resolveVariables(expr: string, row: Record<string, any>): string {
  let resolved = expr.replace(/col\(['"]([^'"]+)['"]\)/g, (_match, colName) => {
    const v = row[colName]
    return v != null ? String(Number(v)) : "NaN"
  })

  const rowKeys = Object.keys(row).sort((a, b) => b.length - a.length)
  for (const key of rowKeys) {
    if (/^\d/.test(key)) continue
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")
    resolved = resolved.replace(re, () => {
      const v = row[key]
      return v != null ? String(Number(v)) : "NaN"
    })
  }

  return resolved.replace(/[^0-9+\-*/().><=!&| \tNan,eE]/g, "")
}

function evaluateExpression(expr: string, row: Record<string, any>): boolean {
  try {
    const sanitized = resolveVariables(expr, row)
    const fn = new Function(`"use strict"; const ${MATH_CONTEXT}; return (${sanitized})`)
    return !!fn()
  } catch {
    return false
  }
}

export function evaluateFormulaExpression(expr: string, row: Record<string, any>): number | null {
  try {
    const sanitized = resolveVariables(expr, row)
    const fn = new Function(`"use strict"; const ${MATH_CONTEXT}; return (${sanitized})`)
    const result = fn()
    return Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

function extractActions<T>(
  matches: Map<number, ConditionMatch>,
  extract: (action: ConditionAction, time: number) => T | null,
): T[] {
  const results: T[] = []
  for (const [, match] of matches) {
    for (const action of match.actions) {
      const item = extract(action, match.time)
      if (item) results.push(item)
    }
  }
  return results.sort((a: any, b: any) => (a.time ?? 0) - (b.time ?? 0))
}

export function getChartMarkers(matches: Map<number, ConditionMatch>) {
  return extractActions(matches, (action, time) =>
    action.chartMarker
      ? { time, position: "aboveBar" as const, color: action.chartMarker.color, shape: "circle" as const, text: action.chartMarker.text || "" }
      : null
  )
}

export function getColorZones(matches: Map<number, ConditionMatch>) {
  return extractActions(matches, (action, time) =>
    action.chartColorZone
      ? { time, color: action.chartColorZone.color }
      : null
  )
}

export function getHighlightStyles(conditions: Condition[]): string {
  return conditions
    .filter(c => c.enabled && c.action.rowHighlight)
    .map(c => `.data-grid-highlight-${c.id} { background-color: ${c.action.rowHighlight} !important; }`)
    .join("\n")
}
