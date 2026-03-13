import type { DataTableRow, ConditionRule } from "../../types/store"

/**
 * Resolves a named column value from a data row, returning null if missing or non-numeric.
 */
export function resolveColumnValue(row: DataTableRow, column: string): number | null {
  const v = row[column]
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Evaluates a single ConditionRule against the current and previous rows.
 * This shared implementation is used by both condition_engine and system_engine.
 * Note: "expression" rules are not supported here — they are only handled in condition_engine.
 */
export function evaluateRule(
  rule: ConditionRule,
  row: DataTableRow,
  prevRow: DataTableRow | null,
): boolean {
  const colValue = resolveColumnValue(row, rule.column)
  if (colValue == null) return false
  const threshold = rule.value

  switch (rule.type) {
    case "value_gt":
    case "change_gt":
      return colValue > threshold
    case "value_lt":
    case "change_lt":
      return colValue < threshold
    case "between": {
      const upper = rule.compareColumn ? resolveColumnValue(row, rule.compareColumn) : threshold
      return upper != null && colValue >= threshold && colValue <= upper
    }
    case "cross_above": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCmp  = resolveColumnValue(row, rule.compareColumn)
      const prevCmp = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCmp == null || prevCmp == null) return false
      return prevVal <= prevCmp && colValue > curCmp
    }
    case "cross_below": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCmp  = resolveColumnValue(row, rule.compareColumn)
      const prevCmp = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCmp == null || prevCmp == null) return false
      return prevVal >= prevCmp && colValue < curCmp
    }
    default:
      return false
  }
}
