import { apiFetch } from "../services/api_fetch"
import type { DataConfig, DataColumn } from "../types/store"
import candleCache from "../data/candle_cache"

export interface DataTableRow {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  [key: string]: number | null | undefined
}

function hasIndicatorsOrChanges(config: DataConfig): boolean {
  return config.columns.some(c =>
    (c.type === "indicator" && c.indicatorType) ||
    (c.type === "change" && c.changePeriod)
  )
}

function getInstrumentColumns(config: DataConfig): DataColumn[] {
  return config.columns.filter(c => c.type === "instrument" && c.instrumentSymbol && c.instrumentField)
}

export function loadFromCache(config: DataConfig): DataTableRow[] | null {
  if (!config.symbols.length) return null
  const symbol = config.symbols[0]
  const candles = candleCache.getRange(
    symbol, config.timeframe,
    config.startTime, config.endTime,
  )
  if (!candles.length) return null
  return candles.map(c => ({
    time: c.time, open: c.open, high: c.high,
    low: c.low, close: c.close, volume: c.volume,
  }))
}

async function fetchInstrumentData(
  symbol: string,
  timeframe: string,
  startTime?: number,
  endTime?: number,
): Promise<Map<number, Record<string, number>>> {
  const url = new URL("/api/data_table", window.location.origin)
  url.searchParams.set("symbol", symbol)
  url.searchParams.set("timeframe", timeframe)
  if (startTime) url.searchParams.set("start_time", new Date(startTime * 1000).toISOString())
  if (endTime) url.searchParams.set("end_time", new Date(endTime * 1000).toISOString())

  try {
    const response = await apiFetch(url)
    if (!response?.ok) return new Map()
    const rows: Array<Record<string, number>> = await response.json()
    const byTime = new Map<number, Record<string, number>>()
    for (const row of rows) byTime.set(row.time, row)
    return byTime
  } catch {
    return new Map()
  }
}

function mergeInstrumentData(
  rows: DataTableRow[],
  instrumentCols: DataColumn[],
  instrumentData: Map<string, Map<number, Record<string, number>>>,
): void {
  for (const row of rows) {
    for (const col of instrumentCols) {
      const data = instrumentData.get(col.instrumentSymbol!)
      if (!data) continue
      const instRow = data.get(row.time)
      const fieldKey = col.label
      ;(row as any)[fieldKey] = instRow ? instRow[col.instrumentField!] ?? null : null
    }
  }
}

export async function loadDataTable(config: DataConfig): Promise<DataTableRow[]> {
  if (!config.symbols.length) {
    return []
  }

  const isLinked = !!config.sourceTabId
  const needsServerCalc = hasIndicatorsOrChanges(config)
  const instrumentCols = getInstrumentColumns(config)

  if (isLinked && !needsServerCalc && !instrumentCols.length) {
    const cached = loadFromCache(config)
    if (cached && cached.length > 0) {
      return cached
    }
  }

  const symbol = config.symbols[0]
  const indicatorSpecs = config.columns
    .filter(c => c.type === "indicator" && c.indicatorType)
    .map(c => ({ type: c.indicatorType, params: c.indicatorParams || {} }))

  const changePeriods = config.columns
    .filter(c => c.type === "change" && c.changePeriod)
    .map(c => c.changePeriod)

  const url = new URL("/api/data_table", window.location.origin)
  url.searchParams.set("symbol", symbol)
  url.searchParams.set("timeframe", config.timeframe)

  if (config.startTime) {
    url.searchParams.set("start_time", new Date(config.startTime * 1000).toISOString())
  }
  if (config.endTime) {
    url.searchParams.set("end_time", new Date(config.endTime * 1000).toISOString())
  }

  if (indicatorSpecs.length) {
    url.searchParams.set("indicators", JSON.stringify(indicatorSpecs))
  }

  changePeriods.forEach(p => {
    if (p) url.searchParams.append("changes[]", p)
  })

  try {
    const response = await apiFetch(url)
    if (!response) {
      return loadFromCache(config) ?? []
    }
    if (!response.ok) {
      console.error("[DataGrid] API error:", response.status, response.statusText)
      return loadFromCache(config) ?? []
    }
    const data: DataTableRow[] = await response.json()

    if (instrumentCols.length) {
      const uniqueSymbols = [...new Set(instrumentCols.map(c => c.instrumentSymbol!))]
      const instrumentData = new Map<string, Map<number, Record<string, number>>>()
      const fetches = uniqueSymbols.map(async (sym) => {
        const d = await fetchInstrumentData(sym, config.timeframe, config.startTime, config.endTime)
        instrumentData.set(sym, d)
      })
      await Promise.all(fetches)
      mergeInstrumentData(data, instrumentCols, instrumentData)
    }

    return data
  } catch (err) {
    console.error("[DataGrid] Failed to load data:", err)
    return loadFromCache(config) ?? []
  }
}
