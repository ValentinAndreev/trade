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

    if (triggered.length) {
      matches.set(idx, {
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
    case "correlation_gt":
      return false
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

function evaluateExpression(expr: string, row: Record<string, any>): boolean {
  try {
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

    const sanitized = resolved.replace(/[^0-9+\-*/().><=!&| \tNan,eE]/g, "")
    const fn = new Function(`"use strict"; const {abs,sqrt,min,max,pow,log,floor,ceil,round}=Math; return (${sanitized})`)
    const result = fn()
    return !!result
  } catch {
    return false
  }
}

export function evaluateFormulaExpression(expr: string, row: Record<string, any>): number | null {
  try {
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

    const sanitized = resolved.replace(/[^0-9+\-*/().><=!&| \tNan,eE]/g, "")
    const fn = new Function(`"use strict"; const {sqrt,abs,min,max,pow,log,floor,ceil,round,sign,PI,E}=Math; return (${sanitized})`)
    const result = fn()
    return Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

export function getChartMarkers(matches: Map<number, ConditionMatch>): Array<{
  time: number
  position: "aboveBar" | "belowBar"
  color: string
  shape: "arrowDown" | "arrowUp" | "circle"
  text: string
}> {
  const markers: Array<{
    time: number
    position: "aboveBar" | "belowBar"
    color: string
    shape: "arrowDown" | "arrowUp" | "circle"
    text: string
  }> = []

  for (const [, match] of matches) {
    for (const action of match.actions) {
      if (action.chartMarker) {
        markers.push({
          time: match.time,
          position: "aboveBar",
          color: action.chartMarker.color,
          shape: "circle",
          text: action.chartMarker.text || "",
        })
      }
    }
  }

  return markers.sort((a, b) => a.time - b.time)
}

export function getColorZones(matches: Map<number, ConditionMatch>): Array<{
  time: number
  color: string
}> {
  const zones: Array<{ time: number; color: string }> = []

  for (const [, match] of matches) {
    for (const action of match.actions) {
      if (action.chartColorZone) {
        zones.push({
          time: match.time,
          color: action.chartColorZone.color,
        })
      }
    }
  }

  return zones.sort((a, b) => a.time - b.time)
}

export function getHighlightStyles(conditions: Condition[]): string {
  return conditions
    .filter(c => c.enabled && c.action.rowHighlight)
    .map(c => `.data-grid-highlight-${c.id} { background-color: ${c.action.rowHighlight} !important; }`)
    .join("\n")
}
