import type { ColDef, GridOptions, ValueFormatterParams, CellClassParams, ValueGetterParams, GetRowIdParams } from "ag-grid-community"
import { columnFieldKey } from "../types/store"
import type { DataColumn, Condition, DataTableRow, TradingSystem } from "../types/store"
import { evaluateFormulaExpression, type ConditionMatch } from "./condition_engine"
import type { SystemSignal } from "./system_engine"
import { UP_COLOR, DOWN_COLOR, ACCENT_COLOR } from "../config/theme"
import { PRICE_PRECISION, CHANGE_PRECISION, VOLUME_PRECISION } from "../config/constants"

function formatPrice(params: ValueFormatterParams): string {
  const v = params.value
  if (v == null) return ""
  return Number(v).toFixed(PRICE_PRECISION)
}

function formatVolume(params: ValueFormatterParams): string {
  const v = params.value
  if (v == null) return ""
  return Number(v).toFixed(VOLUME_PRECISION)
}

function formatChange(params: ValueFormatterParams): string {
  const v = params.value
  if (v == null) return ""
  const n = Number(v)
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(CHANGE_PRECISION)}%`
}

function formatDateTime(params: ValueFormatterParams): string {
  const v = params.value
  if (v == null) return ""
  const d = new Date(Number(v) * 1000)
  return d.toLocaleString("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
}

function defaultWidth(col: DataColumn): number {
  const widthByTitle = (col.label?.length ?? 0) * 12
  const widthByContent: Record<string, number> = {
    datetime: 160,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 110,
    change: 90,
    indicator: 100,
    formula: 110,
    instrument: 100,
  }
  const contentWidth = widthByContent[col.type] ?? 100
  return Math.max(80, Math.min(400, Math.max(widthByTitle, contentWidth)))
}

/** Column state (colId + width) so grid actually applies widths from title/content. */
export function getInitialColumnState(columns: DataColumn[]): Array<{ colId: string; width: number }> {
  return columns.map(col => ({ colId: col.id, width: col.width ?? defaultWidth(col) }))
}

/** Build a ColDef for a TradingSystem signal column. */
export function buildSystemColDef(system: TradingSystem, signalMap: Map<number, SystemSignal>): ColDef {
  const color = system.color ?? ACCENT_COLOR
  return {
    colId: `sys_${system.id}`,
    headerName: system.name,
    sortable: false,
    filter: false,
    resizable: true,
    width: Math.max(240, system.name.length * 10 + 16),
    suppressSizeToFit: true,
    cellRenderer: (params: { data?: DataTableRow }) => {
      if (!params.data?.time) return ""
      const sig = signalMap.get(params.data.time)
      if (!sig) return ""
      return formatSystemSignal(sig, color)
    },
  }
}

function formatSystemSignal(sig: SystemSignal, _systemColor: string): string {
  const isLong = sig.direction === "long"
  const dirLabel = isLong ? "▲ LONG" : "▼ SHORT"
  const entryColor = isLong ? UP_COLOR : DOWN_COLOR

  if (sig.type === "entry") {
    return `<span style="color:${entryColor};font-weight:600">${dirLabel} ${sig.price.toFixed(2)}</span>`
  }
  if (sig.type === "exit") {
    const pnl = sig.pnl ?? 0
    const pct = sig.pnlPercent ?? 0
    const c = pnl >= 0 ? UP_COLOR : DOWN_COLOR
    const sign = pnl >= 0 ? "+" : ""
    return `<span style="color:${c};font-weight:600">EXIT ${sig.price.toFixed(2)} ${sign}${pnl.toFixed(2)} (${sign}${pct.toFixed(2)}%)</span>`
  }
  if (sig.type === "open") {
    const pnl = sig.pnl ?? 0
    const pct = sig.pnlPercent ?? 0
    const c = pnl >= 0 ? UP_COLOR : DOWN_COLOR
    const sign = pnl >= 0 ? "+" : ""
    return `<span style="color:${c}">OPEN ${sign}${pnl.toFixed(2)} (${sign}${pct.toFixed(2)}%)</span>`
  }
  return ""
}

export function buildColDefs(columns: DataColumn[]): ColDef[] {
  return columns.map(col => {
    const w = col.width ?? defaultWidth(col)
    const base: ColDef = {
      colId: col.id,
      headerName: col.label,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 50,
      width: w,
      suppressSizeToFit: true,
      hide: col.visible === false,
    }

    switch (col.type) {
      case "datetime":
        return { ...base, field: "time", valueFormatter: formatDateTime, sort: "desc" as const }
      case "open":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatPrice, type: "numericColumn" }
      case "high":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatPrice, type: "numericColumn" }
      case "low":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatPrice, type: "numericColumn" }
      case "close":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatPrice, type: "numericColumn" }
      case "volume":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatVolume, type: "numericColumn" }
      case "change":
        return {
          ...base,
          field: columnFieldKey(col),
          valueFormatter: formatChange,
          type: "numericColumn",
          cellStyle: (params: CellClassParams) => {
            const v = params.value
            if (v == null) return null
            return v > 0 ? { color: UP_COLOR } : v < 0 ? { color: DOWN_COLOR } : null
          },
        }
      case "indicator":
        return { ...base, field: columnFieldKey(col), valueFormatter: formatPrice, type: "numericColumn" }
      case "formula": {
        const expression = col.expression || ""
        return {
          ...base,
          field: columnFieldKey(col),
          type: "numericColumn",
          valueGetter: (params: ValueGetterParams) => {
            if (!params.data) return null
            return evaluateFormulaExpression(expression, params.data)
          },
          valueFormatter: formatPrice,
        }
      }
      case "instrument": {
        return {
          ...base,
          field: columnFieldKey(col),
          valueFormatter: formatPrice,
          type: "numericColumn",
        }
      }
      default:
        return { ...base, field: col.id }
    }
  })
}

export function buildRowClassRules(
  conditions: Condition[],
  matchesByTime: Map<number, ConditionMatch>,
): Record<string, (params: { data?: DataTableRow }) => boolean> {
  const rules: Record<string, (params: { data?: DataTableRow }) => boolean> = {}

  conditions.filter(c => c.enabled && c.action.rowHighlight).forEach(cond => {
    const cssClass = `data-grid-highlight-${cond.id}`
    rules[cssClass] = (params: { data?: DataTableRow }) => {
      if (!params.data?.time) return false
      return matchesByTime.get(params.data.time)?.conditionNames.includes(cond.name) ?? false
    }
  })

  return rules
}

export interface SelectionStats {
  count: number
  min: number
  max: number
  sum: number
  avg: number
  fields: Record<string, { min: number; max: number; avg: number }>
}

export function computeSelectionStats(selectedRows: DataTableRow[], numericFields: string[]): SelectionStats | null {
  if (!selectedRows.length) return null

  const fields: Record<string, { min: number; max: number; avg: number }> = {}
  let globalMin = Infinity
  let globalMax = -Infinity
  let globalSum = 0
  let globalCount = 0

  for (const field of numericFields) {
    const vals = selectedRows
      .map(r => r[field])
      .filter(v => v != null && Number.isFinite(Number(v)))
      .map(Number)

    if (!vals.length) continue

    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const sum = vals.reduce((a, b) => a + b, 0)
    fields[field] = { min, max, avg: sum / vals.length }

    if (min < globalMin) globalMin = min
    if (max > globalMax) globalMax = max
    globalSum += sum
    globalCount += vals.length
  }

  if (!globalCount) return null

  return {
    count: selectedRows.length,
    min: globalMin,
    max: globalMax,
    sum: globalSum,
    avg: globalSum / globalCount,
    fields,
  }
}

export function buildGridOptions(
  columns: DataColumn[],
  conditions: Condition[],
  matchesByTime: Map<number, ConditionMatch> = new Map(),
): GridOptions {
  return {
    columnDefs: buildColDefs(columns),
    rowClassRules: buildRowClassRules(conditions, matchesByTime),
    getRowId: (params: GetRowIdParams<DataTableRow>) => String(params.data.time),
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 50,
    },
    animateRows: false,
    rowSelection: { mode: "multiRow", enableClickSelection: true },
    suppressCellFocus: false,
    enableCellTextSelection: true,
    domLayout: "normal",
    statusBar: {
      statusPanels: [
        { statusPanel: "agSelectedRowCountComponent" },
        { statusPanel: "agAggregationComponent" },
      ],
    },
  }
}
